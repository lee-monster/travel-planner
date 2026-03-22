// TravelKo sitemap generator
module.exports = function handler(req, res) {
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

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

  // Generate one <url> entry per language per base path
  basePaths.forEach(function(bp) {
    langs.forEach(function(lang) {
      xml += '  <url>\n';
      xml += '    <loc>' + langUrl(bp.path, lang) + '</loc>\n';
      xml += '    <lastmod>' + now + '</lastmod>\n';
      xml += '    <changefreq>' + bp.changefreq + '</changefreq>\n';
      xml += '    <priority>' + bp.priority + '</priority>\n';
      // hreflang alternates pointing to each language version
      langs.forEach(function(altLang) {
        xml += '    <xhtml:link rel="alternate" hreflang="' + altLang + '" href="' + langUrl(bp.path, altLang) + '"/>\n';
      });
      xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + baseUrl + bp.path + '"/>\n';
      xml += '  </url>\n';
    });
  });

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
