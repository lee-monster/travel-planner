// /api/share-plan — Save and retrieve shared travel plans
// POST: save a plan, return share ID
// GET: retrieve a shared plan by ID
const { Client } = require('@notionhq/client');
const { setCors } = require('./_lib/auth');
const crypto = require('crypto');

const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
const SPOTS_DB = process.env.NOTION_DB_TRAVEL;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  var id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  // Cache shared plans for 1 hour
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  try {
    // Search for shared plan page by shareId property
    var response = await notion.databases.query({
      database_id: SPOTS_DB,
      filter: {
        and: [
          { property: 'Name', title: { starts_with: 'SHARED_PLAN:' } },
          { property: 'Address', rich_text: { equals: id } }
        ]
      },
      page_size: 1
    });

    if (!response.results || response.results.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    var page = response.results[0];
    var props = page.properties;

    var title = getPlainText(props.Description) || '';
    var planData = getPlainText(props.Description_ko) || '';

    // Parse stored plan data
    var plan;
    try {
      plan = JSON.parse(planData);
    } catch(e) {
      return res.status(500).json({ error: 'Invalid plan data' });
    }

    return res.status(200).json({
      success: true,
      plan: plan
    });
  } catch (err) {
    console.error('Share plan GET error:', err);
    return res.status(500).json({ error: 'Failed to retrieve plan' });
  }
}

async function handlePost(req, res) {
  var { title, days, budget, style, spotNames, planHtml, lang } = req.body;

  if (!title || !planHtml) {
    return res.status(400).json({ error: 'Missing required fields: title, planHtml' });
  }

  // Generate short share ID (8 chars)
  var shareId = crypto.randomBytes(4).toString('hex');

  // Store plan data as JSON in Description_ko field (repurposing unused field)
  var planData = JSON.stringify({
    title: title,
    days: days || 0,
    budget: budget || '',
    style: style || '',
    spotNames: spotNames || [],
    planHtml: planHtml,
    lang: lang || 'en',
    sharedAt: new Date().toISOString()
  });

  // Check size limit (Notion rich_text max 2000 chars per block)
  // If too large, truncate planHtml
  if (planData.length > 1900) {
    // Truncate planHtml to fit
    var maxHtmlLen = 1900 - JSON.stringify({
      title: title, days: days, budget: budget, style: style,
      spotNames: spotNames, planHtml: '', lang: lang,
      sharedAt: new Date().toISOString()
    }).length - 10;

    if (maxHtmlLen < 200) {
      return res.status(413).json({ error: 'Plan too large to share' });
    }
    planHtml = planHtml.substring(0, maxHtmlLen) + '...';
    planData = JSON.stringify({
      title: title, days: days || 0, budget: budget || '', style: style || '',
      spotNames: spotNames || [], planHtml: planHtml, lang: lang || 'en',
      sharedAt: new Date().toISOString()
    });
  }

  try {
    await notion.pages.create({
      parent: { database_id: SPOTS_DB },
      properties: {
        Name: { title: [{ text: { content: 'SHARED_PLAN:' + shareId } }] },
        Address: { rich_text: [{ text: { content: shareId } }] },
        Description: { rich_text: [{ text: { content: title } }] },
        Description_ko: { rich_text: [{ text: { content: planData } }] },
        Published: { checkbox: false },
        SubmittedBy: { rich_text: [{ text: { content: 'shared_plan' } }] },
        Category: { select: { name: 'attraction' } }
      }
    });

    return res.status(200).json({
      success: true,
      shareId: shareId,
      shareUrl: 'https://travel.koinfo.kr/plan/' + shareId
    });
  } catch (err) {
    console.error('Share plan POST error:', err);
    return res.status(500).json({ error: 'Failed to save shared plan' });
  }
}

function getPlainText(prop) {
  if (!prop || !prop.rich_text) return '';
  return prop.rich_text.map(function(r) { return r.plain_text; }).join('');
}
