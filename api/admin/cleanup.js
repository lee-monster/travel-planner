// Admin Cleanup API - Batch unpublish duplicates and fix coordinates
// POST /api/admin/cleanup
// Body: { action: "unpublish", ids: ["id1", "id2", ...] }
//    or { action: "update_coords", updates: [{ id, lat, lng }, ...] }
// Requires: X-Admin-Key header matching JWT_SECRET for basic protection
const { Client } = require('@notionhq/client');

let notionClient = null;
function getNotion() {
  if (!notionClient) notionClient = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
  return notionClient;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check: accepts JWT_SECRET or NOTION_TOKEN_TRAVEL as admin key
  const adminKey = req.headers['x-admin-key'];
  const validKeys = [process.env.JWT_SECRET, process.env.NOTION_TOKEN_TRAVEL].filter(Boolean);
  if (!adminKey || !validKeys.includes(adminKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { action, ids, updates } = req.body;
  const notion = getNotion();
  const results = [];

  try {
    if (action === 'unpublish' && Array.isArray(ids)) {
      for (const id of ids) {
        try {
          await notion.pages.update({
            page_id: id,
            properties: { 'Published': { checkbox: false } },
          });
          results.push({ id, status: 'ok' });
        } catch (e) {
          results.push({ id, status: 'error', message: e.message });
        }
        await delay(50);
      }
    } else if (action === 'update_coords' && Array.isArray(updates)) {
      for (const u of updates) {
        try {
          await notion.pages.update({
            page_id: u.id,
            properties: {
              'Latitude': { number: u.lat },
              'Longitude': { number: u.lng },
            },
          });
          results.push({ id: u.id, status: 'ok', lat: u.lat, lng: u.lng });
        } catch (e) {
          results.push({ id: u.id, status: 'error', message: e.message });
        }
        await delay(50);
      }
    } else if (action === 'update_translations' && Array.isArray(updates)) {
      // updates: [{ id, properties: { Name_ms: "...", Description_ms: "...", ... } }, ...]
      for (const u of updates) {
        try {
          const props = {};
          for (const [key, val] of Object.entries(u.properties || {})) {
            props[key] = { rich_text: [{ text: { content: val } }] };
          }
          await notion.pages.update({ page_id: u.id, properties: props });
          results.push({ id: u.id, status: 'ok' });
        } catch (e) {
          results.push({ id: u.id, status: 'error', message: e.message });
        }
        await delay(50);
      }
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "unpublish", "update_coords", or "update_translations".' });
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error').length;
    res.status(200).json({ action, total: results.length, ok, errors, results });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Cleanup failed: ' + error.message });
  }
};
