// TravelKo sitemap generator — includes individual spots
const { Client } = require('@notionhq/client');

let notionClient = null;
function getNotion() {
  if (!notionClient) notionClient = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
  return notionClient;
}

function getPlainText(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.map(t => t.plain_text || '').join('');
}

module.exports = async function handler(req, res) {
  const baseUrl = 'https://travel.koinfo.kr';
  const now = new Date().toISOString().split('T')[0];

  var categories = ['food', 'attraction', 'cafe', 'nature', 'shopping', 'nightlife'];
  var regions = ['Seoul', 'Busan', 'Jeju', 'Incheon', 'Gyeonggi', 'Gangneung', 'Sokcho', 'Jeonju', 'Gyeongju', 'Yeosu', 'Daegu', 'Suwon'];
  var langs = ['en', 'ko', 'id', 'mn', 'ms', 'vi'];

  // Base paths (without lang param) for URL generation
  var basePaths = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
  ];
  categories.forEach(function(cat) {
    basePaths.push({ path: '/?category=' + cat, priority: '0.8', changefreq: 'weekly' });
  });
  regions.forEach(function(region) {
    basePaths.push({ path: '/?region=' + region, priority: '0.7', changefreq: 'weekly' });
  });

  // Guide pages
  var guides = ['taxi', 'transport'];
  guides.forEach(function(guide) {
    basePaths.push({ path: '/guide/' + guide, priority: '0.8', changefreq: 'monthly' });
  });

  // Helper: append lang param to a path
  function langUrl(path, lang) {
    if (path.indexOf('?') !== -1) return baseUrl + path + '&lang=' + lang;
    return baseUrl + path + '?lang=' + lang;
  }

  function escXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

  // Generate one <url> entry per language per base path
  basePaths.forEach(function(bp) {
    langs.forEach(function(lang) {
      xml += '  <url>\n';
      xml += '    <loc>' + escXml(langUrl(bp.path, lang)) + '</loc>\n';
      xml += '    <lastmod>' + now + '</lastmod>\n';
      xml += '    <changefreq>' + bp.changefreq + '</changefreq>\n';
      xml += '    <priority>' + bp.priority + '</priority>\n';
      langs.forEach(function(altLang) {
        xml += '    <xhtml:link rel="alternate" hreflang="' + altLang + '" href="' + escXml(langUrl(bp.path, altLang)) + '"/>\n';
      });
      xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + escXml(baseUrl + bp.path) + '"/>\n';
      xml += '  </url>\n';
    });
  });

  // Fetch all published spots and add individual spot pages
  try {
    const dbId = process.env.NOTION_DB_TRAVEL;
    if (dbId) {
      const notion = getNotion();
      let hasMore = true;
      let cursor = undefined;

      while (hasMore) {
        const response = await notion.databases.query({
          database_id: dbId,
          filter: { property: 'Published', checkbox: { equals: true } },
          page_size: 100,
          start_cursor: cursor,
        });

        response.results.forEach(function(page) {
          const spotId = page.id;
          const spotPath = '/spot/' + spotId;

          langs.forEach(function(lang) {
            const spotLangUrl = baseUrl + spotPath + '?lang=' + lang;
            xml += '  <url>\n';
            xml += '    <loc>' + escXml(spotLangUrl) + '</loc>\n';
            xml += '    <lastmod>' + (page.last_edited_time || now).split('T')[0] + '</lastmod>\n';
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.6</priority>\n';
            langs.forEach(function(altLang) {
              xml += '    <xhtml:link rel="alternate" hreflang="' + altLang + '" href="' + escXml(baseUrl + spotPath + '?lang=' + altLang) + '"/>\n';
            });
            xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + escXml(baseUrl + spotPath) + '"/>\n';
            xml += '  </url>\n';
          });
        });

        hasMore = response.has_more;
        cursor = response.next_cursor;
      }
    }
  } catch (err) {
    // If spot fetching fails, continue with base paths only
  }

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
