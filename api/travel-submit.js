const { Client } = require('@notionhq/client');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dbId = process.env.NOTION_DB_TRAVEL;
    if (!process.env.NOTION_TOKEN_TRAVEL || !dbId) {
      return res.status(503).json({ error: 'Travel DB not configured' });
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
    const { name, description, category, lat, lng, address, instagram, photos, submittedBy, lang } = req.body;

    if (!name || !description || !category) {
      return res.status(400).json({ error: 'name, description, category are required' });
    }

    // Determine which language field to populate based on submission language
    const nameField = lang === 'ko' ? 'Name_ko' : lang === 'id' ? 'Name_id' : lang === 'mn' ? 'Name_mn' : 'Name';
    const descField = lang === 'ko' ? 'Description_ko' : lang === 'id' ? 'Description_id' : lang === 'mn' ? 'Description_mn' : 'Description';

    const properties = {
      Name: { title: [{ text: { content: name } }] },
      Category: { select: { name: category } },
      Published: { checkbox: false },
      Featured: { checkbox: false },
    };

    // Also set the lang-specific field if not English
    if (nameField !== 'Name') {
      properties[nameField] = { rich_text: [{ text: { content: name } }] };
    }
    if (descField !== 'Description') {
      properties[descField] = { rich_text: [{ text: { content: description } }] };
    } else {
      properties.Description = { rich_text: [{ text: { content: description } }] };
    }

    if (lat && lng) {
      properties.Latitude = { number: parseFloat(lat) };
      properties.Longitude = { number: parseFloat(lng) };
    }
    if (address) {
      properties.Address = { rich_text: [{ text: { content: address } }] };
    }
    if (instagram) {
      properties.Instagram = { rich_text: [{ text: { content: instagram } }] };
    }
    if (submittedBy) {
      properties.SubmittedBy = { rich_text: [{ text: { content: submittedBy } }] };
    }
    if (photos && Array.isArray(photos) && photos.length > 0) {
      properties.CoverImage = { url: photos[0] };
    }

    await notion.pages.create({
      parent: { database_id: dbId },
      properties,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Travel submit error:', error);
    res.status(500).json({ error: 'Failed to submit spot' });
  }
};
