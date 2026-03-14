// POST /api/travel-planner - AI Travel Planner using Gemini 2.0 Flash with Google Search Grounding
const { Client } = require('@notionhq/client');
const { getUserFromRequest, setCors } = require('./_lib/auth');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
const USERS_DB = process.env.NOTION_DB_USERS;
const DAILY_LIMIT = 20;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'AI planner not configured - missing GEMINI_API_KEY' });
  }

  // Check daily usage limit
  var userPage, usage, todayKey, todayCount;
  try {
    userPage = await findUserPage(user.googleId);
    usage = userPage ? parsePlannerUsage(userPage) : {};
    todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    todayCount = usage[todayKey] || 0;

    if (todayCount >= DAILY_LIMIT) {
      return res.status(429).json({
        error: 'rate_limit',
        limit: DAILY_LIMIT,
        used: todayCount,
        remaining: 0
      });
    }
  } catch (err) {
    console.error('Usage check error:', err);
    // Allow request if usage check fails
    usage = {};
    todayKey = new Date().toISOString().slice(0, 10);
    todayCount = 0;
  }

  const { spots, days, budget, style, lang } = req.body;

  if (!spots || !spots.length || !days) {
    return res.status(400).json({ error: 'Missing required fields: spots, days' });
  }

  const spotDescriptions = spots.map(function(s, i) {
    return (i + 1) + '. ' + s.name +
      (s.category ? ' [' + s.category + ']' : '') +
      (s.region ? ' - ' + s.region : '') +
      (s.address ? ' (' + s.address + ')' : '') +
      (s.description ? '\n   ' + s.description.substring(0, 150) : '');
  }).join('\n');

  const langNames = {
    en: 'English', ko: '한국어', id: 'Bahasa Indonesia',
    mn: 'Монгол хэл', ms: 'Bahasa Melayu', vi: 'Tiếng Việt'
  };
  const respondLang = langNames[lang] || 'English';

  const budgetDesc = {
    budget: 'Budget-friendly (최소 비용)',
    moderate: 'Moderate (적당한 비용)',
    luxury: 'Luxury (프리미엄 경험)'
  };

  const styleDesc = {
    relaxed: 'Relaxed (여유롭게, 하루 2-3곳)',
    balanced: 'Balanced (적당히, 하루 3-4곳)',
    packed: 'Packed (빡빡하게, 하루 5곳+)'
  };

  const systemPrompt = `You are TravelKo's AI Travel Planner — an expert on traveling in Korea.
Create a detailed, practical day-by-day travel itinerary based on the user's selected spots and preferences.
Use Google Search to find the latest information about each spot (opening hours, prices, seasonal events, nearby restaurants).

Rules:
- Organize spots logically by proximity and region to minimize travel time
- Include estimated time at each spot (e.g., "1-2 hours")
- Suggest specific meal recommendations near each area with current price ranges
- Add transportation tips between spots (subway, bus, taxi with estimated cost)
- Include morning/afternoon/evening time blocks
- Match the travel pace to the user's style preference
- Give specific budget estimates in KRW (₩) for each day
- Add practical tips (best time to visit, what to wear, reservations needed, etc.)
- If spots are in different regions, plan travel days between regions
- Respond ENTIRELY in ${respondLang}
- Use markdown formatting for readability`;

  const userPrompt = `Plan a ${days}-day Korea travel itinerary.

**Budget Level:** ${budgetDesc[budget] || budget || 'Moderate'}
**Travel Style:** ${styleDesc[style] || style || 'Balanced'}

**Selected spots to include:**
${spotDescriptions}

Create a day-by-day plan that covers all these spots efficiently. Include meals, transport, and time estimates.`;

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + GEMINI_API_KEY;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          { role: 'user', parts: [{ text: userPrompt }] }
        ],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 4096
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(502).json({
        error: 'AI service error',
        detail: data.error ? data.error.message : JSON.stringify(data)
      });
    }

    const candidate = data.candidates && data.candidates[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      console.error('Gemini unexpected response:', JSON.stringify(data));
      return res.status(502).json({
        error: 'AI service returned empty response',
        detail: candidate && candidate.finishReason ? 'Finish reason: ' + candidate.finishReason : 'No candidates'
      });
    }

    // Extract text from all parts
    const plan = candidate.content.parts
      .filter(function(p) { return p.text; })
      .map(function(p) { return p.text; })
      .join('');

    // Increment usage after successful generation
    try {
      if (userPage) {
        usage[todayKey] = todayCount + 1;
        // Clean up old entries (keep only last 7 days)
        var cleanUsage = {};
        Object.keys(usage).sort().slice(-7).forEach(function(k) { cleanUsage[k] = usage[k]; });
        await notion.pages.update({
          page_id: userPage.id,
          properties: {
            PlannerUsage: { rich_text: [{ text: { content: JSON.stringify(cleanUsage) } }] }
          }
        });
      }
    } catch (err) {
      console.error('Usage update error:', err);
    }

    return res.status(200).json({
      success: true,
      plan: plan,
      remaining: DAILY_LIMIT - todayCount - 1
    });
  } catch (err) {
    console.error('Planner error:', err);
    return res.status(500).json({ error: 'Failed to generate travel plan', detail: err.message });
  }
};

async function findUserPage(googleId) {
  var response = await notion.databases.query({
    database_id: USERS_DB,
    filter: {
      property: 'GoogleId',
      rich_text: { equals: googleId }
    },
    page_size: 1
  });
  return response.results[0] || null;
}

function parsePlannerUsage(userPage) {
  try {
    var prop = userPage.properties.PlannerUsage;
    if (!prop || !prop.rich_text || !prop.rich_text.length) return {};
    var raw = prop.rich_text.map(function(r) { return r.plain_text; }).join('');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// Increase Vercel function timeout (Hobby: max 60s, Pro: max 300s)
module.exports.config = {
  maxDuration: 60
};
