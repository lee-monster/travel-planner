// GET/POST /api/user/bookmarks - User bookmark management
// Bookmarks stored as JSON in user's Notion page
const { Client } = require('@notionhq/client');
const { getUserFromRequest, setCors } = require('../_lib/auth');

const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
const USERS_DB = process.env.NOTION_DB_USERS;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      return await getBookmarks(user, res);
    } else if (req.method === 'POST') {
      return await updateBookmark(user, req.body, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Bookmarks error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function getBookmarks(user, res) {
  const userPage = await findUserPage(user.googleId);
  if (!userPage) return res.status(200).json({ bookmarks: [] });

  const bookmarks = parseBookmarks(userPage);
  return res.status(200).json({ bookmarks });
}

async function updateBookmark(user, body, res) {
  const { spotId, type, action } = body;
  // type: 'want_to_visit' | 'interested'
  // action: 'add' | 'remove'
  if (!spotId || !type || !action) {
    return res.status(400).json({ error: 'Missing spotId, type, or action' });
  }
  if (!['want_to_visit', 'interested'].includes(type)) {
    return res.status(400).json({ error: 'Invalid bookmark type' });
  }

  const userPage = await findUserPage(user.googleId);
  if (!userPage) return res.status(404).json({ error: 'User not found' });

  let bookmarks = parseBookmarks(userPage);

  if (action === 'add') {
    // Remove existing bookmark for this spot (if changing type)
    bookmarks = bookmarks.filter(b => b.spotId !== spotId);
    bookmarks.push({ spotId, type });
  } else if (action === 'remove') {
    bookmarks = bookmarks.filter(b => !(b.spotId === spotId && b.type === type));
  }

  // Save back to Notion
  const jsonStr = JSON.stringify(bookmarks);
  await notion.pages.update({
    page_id: userPage.id,
    properties: {
      Bookmarks: { rich_text: [{ text: { content: jsonStr } }] }
    }
  });

  return res.status(200).json({ success: true, bookmarks });
}

async function findUserPage(googleId) {
  const response = await notion.databases.query({
    database_id: USERS_DB,
    filter: {
      property: 'GoogleId',
      rich_text: { equals: googleId }
    },
    page_size: 1
  });
  return response.results[0] || null;
}

function parseBookmarks(userPage) {
  try {
    const prop = userPage.properties.Bookmarks;
    if (!prop || !prop.rich_text || !prop.rich_text.length) return [];
    const raw = prop.rich_text.map(r => r.plain_text).join('');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}
