const { Client } = require('@notionhq/client');

let notionClient = null;

function getNotion() {
  if (!notionClient) {
    notionClient = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
  }
  return notionClient;
}

function getPlainText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(t => t.plain_text || '').join('');
}

function getFiles(filesProp) {
  if (!filesProp || !Array.isArray(filesProp)) return [];
  return filesProp.map(f => {
    if (f.type === 'file') return f.file.url;
    if (f.type === 'external') return f.external.url;
    return '';
  }).filter(Boolean);
}

function getMultiSelect(prop) {
  if (!prop || !Array.isArray(prop)) return [];
  return prop.map(t => t.name);
}

const LANG_FIELDS = {
  en: { name: 'Name', desc: 'Description' },
  ko: { name: 'Name_ko', desc: 'Description_ko' },
  id: { name: 'Name_id', desc: 'Description_id' },
  mn: { name: 'Name_mn', desc: 'Description_mn' },
  ms: { name: 'Name_id', desc: 'Description_id' },  // Malay falls back to Indonesian (similar language)
  vi: { name: 'Name', desc: 'Description' },          // Vietnamese falls back to English
};

function formatSpot(page, lang) {
  const props = page.properties;
  const lf = LANG_FIELDS[lang] || LANG_FIELDS.en;
  const lfEn = LANG_FIELDS.en;

  // Fallback to English if requested lang is empty
  const name = getPlainText(props[lf.name]?.title || props[lf.name]?.rich_text) ||
               getPlainText(props[lfEn.name]?.title || props[lfEn.name]?.rich_text);
  const description = getPlainText(props[lf.desc]?.rich_text) ||
                      getPlainText(props[lfEn.desc]?.rich_text);

  return {
    id: page.id,
    name,
    description,
    category: props['Category']?.select?.name || '',
    region: props['Region']?.select?.name || '',
    lat: props['Latitude']?.number || null,
    lng: props['Longitude']?.number || null,
    address: getPlainText(props['Address']?.rich_text),
    coverImage: props['CoverImage']?.url || '',
    photos: getFiles(props['Photos']?.files),
    tags: getMultiSelect(props['Tags']?.multi_select),
    instagram: getPlainText(props['Instagram']?.rich_text),
    naverMapLink: props['NaverMapLink']?.url || '',
    rating: props['Rating']?.number || 0,
    featured: props['Featured']?.checkbox || false,
    submittedBy: getPlainText(props['SubmittedBy']?.rich_text),
    createdAt: page.created_time,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const dbId = process.env.NOTION_DB_TRAVEL;
    if (!process.env.NOTION_TOKEN_TRAVEL || !dbId) {
      return res.status(200).json({ items: [], hasMore: false });
    }

    const { category, region, lang, limit, cursor, featured } = req.query;
    const notion = getNotion();
    const pageSize = Math.min(parseInt(limit) || 100, 100);
    const language = lang || 'en';

    const filter = {
      and: [
        { property: 'Published', checkbox: { equals: true } },
      ],
    };

    if (category) {
      // Support comma-separated categories for multi-category filtering (e.g., muslim toggle)
      const cats = category.split(',').map(c => c.trim()).filter(Boolean);
      if (cats.length === 1) {
        filter.and.push({ property: 'Category', select: { equals: cats[0] } });
      } else if (cats.length > 1) {
        filter.and.push({
          or: cats.map(c => ({ property: 'Category', select: { equals: c } }))
        });
      }
    }
    if (region) {
      filter.and.push({ property: 'Region', select: { equals: region } });
    }
    if (featured === 'true') {
      filter.and.push({ property: 'Featured', checkbox: { equals: true } });
    }

    const queryOpts = {
      database_id: dbId,
      filter,
      sorts: [
        { property: 'Featured', direction: 'descending' },
        { timestamp: 'created_time', direction: 'descending' },
      ],
      page_size: pageSize,
    };

    if (cursor) {
      queryOpts.start_cursor = cursor;
    }

    const response = await notion.databases.query(queryOpts);
    const items = response.results.map(p => formatSpot(p, language));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      items,
      hasMore: response.has_more,
      nextCursor: response.next_cursor || null,
    });
  } catch (error) {
    console.error('Travel spots API error:', error);
    res.status(500).json({ error: 'Failed to fetch travel spots' });
  }
};
