// DELETE /api/user/delete-account - Delete user account and all associated data
const { Client } = require('@notionhq/client');
const { getUserFromRequest, setCors } = require('../_lib/auth');

const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
const USERS_DB = process.env.NOTION_DB_USERS;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Find user page in Notion
    const response = await notion.databases.query({
      database_id: USERS_DB,
      filter: {
        property: 'GoogleId',
        rich_text: { equals: user.googleId }
      },
      page_size: 1
    });

    const userPage = response.results[0];
    if (!userPage) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Archive the user page (Notion soft-delete)
    await notion.pages.update({
      page_id: userPage.id,
      archived: true
    });

    return res.status(200).json({ success: true, message: 'Account deleted' });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
