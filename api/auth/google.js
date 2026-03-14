// POST /api/auth/google - Google Sign-In verification + user upsert
const { Client } = require('@notionhq/client');
const { createToken, verifyGoogleToken, setCors } = require('../_lib/auth');

const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
const USERS_DB = process.env.NOTION_DB_USERS;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  // Verify Google ID token
  const googleUser = await verifyGoogleToken(credential);
  if (!googleUser) return res.status(401).json({ error: 'Invalid Google token' });

  try {
    // Find or create user in Notion
    let user = await findUserByGoogleId(googleUser.googleId);

    if (!user) {
      user = await createUser(googleUser);
    } else {
      // Update name/avatar if changed
      await updateUser(user.id, googleUser);
    }

    // Create JWT
    const token = createToken({
      userId: user.id,
      googleId: googleUser.googleId,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.avatar
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: googleUser.name,
        email: googleUser.email,
        avatar: googleUser.avatar
      }
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

async function findUserByGoogleId(googleId) {
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

async function createUser(googleUser) {
  const page = await notion.pages.create({
    parent: { database_id: USERS_DB },
    properties: {
      Name: { title: [{ text: { content: googleUser.name } }] },
      GoogleId: { rich_text: [{ text: { content: googleUser.googleId } }] },
      Email: { rich_text: [{ text: { content: googleUser.email } }] },
      Avatar: { url: googleUser.avatar || null },
      Bookmarks: { rich_text: [{ text: { content: '[]' } }] }
    }
  });
  return page;
}

async function updateUser(pageId, googleUser) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Name: { title: [{ text: { content: googleUser.name } }] },
      Avatar: { url: googleUser.avatar || null }
    }
  });
}
