// TravelKo sitemap generator
module.exports = function handler(req, res) {
  const baseUrl = 'https://travel.koinfo.kr';
  const now = new Date().toISOString().split('T')[0];

  var categories = ['food', 'attraction', 'cafe', 'nature', 'shopping', 'nightlife'];
  var regions = ['Seoul', 'Busan', 'Jeju', 'Incheon', 'Gyeonggi', 'Gangneung', 'Sokcho', 'Jeonju', 'Gyeongju', 'Yeosu', 'Daegu', 'Suwon'];
  var langs = ['en', 'ko', 'id', 'mn', 'ms', 'vi'];

  var urls = [
    { loc: baseUrl + '/', priority: '1.0', changefreq: 'daily' },
  ];
  categories.forEach(function(cat) {
    urls.push({ loc: baseUrl + '/?category=' + cat, priority: '0.8', changefreq: 'weekly' });
  });
  regions.forEach(function(region) {
    urls.push({ loc: baseUrl + '/?region=' + region, priority: '0.7', changefreq: 'weekly' });
  });

  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
  xml += ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

  urls.forEach(function(u) {
    xml += '  <url>\n';
    xml += '    <loc>' + u.loc + '</loc>\n';
    xml += '    <lastmod>' + now + '</lastmod>\n';
    xml += '    <changefreq>' + u.changefreq + '</changefreq>\n';
    xml += '    <priority>' + u.priority + '</priority>\n';
    langs.forEach(function(lang) {
      xml += '    <xhtml:link rel="alternate" hreflang="' + lang + '" href="' + u.loc + '"/>\n';
    });
    xml += '    <xhtml:link rel="alternate" hreflang="x-default" href="' + u.loc + '"/>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
