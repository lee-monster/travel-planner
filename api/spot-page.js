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

function getFiles(fp) {
  if (!fp || !Array.isArray(fp)) return [];
  return fp.map(f => f.type === 'file' ? f.file.url : f.type === 'external' ? f.external.url : '').filter(Boolean);
}

const LANG_FIELDS = {
  en: { name: 'Name', desc: 'Description' },
  ko: { name: 'Name_ko', desc: 'Description_ko' },
  id: { name: 'Name_id', desc: 'Description_id' },
  mn: { name: 'Name_mn', desc: 'Description_mn' },
  ms: { name: 'Name_ms', desc: 'Description_ms' },
  vi: { name: 'Name_vi', desc: 'Description_vi' },
};

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
  const { id, lang } = req.query;
  if (!id) return res.status(400).send('Missing spot id');

  try {
    const notion = getNotion();
    const page = await notion.pages.retrieve({ page_id: id });
    const props = page.properties;

    const lf = LANG_FIELDS[lang] || LANG_FIELDS.en;
    const lfEn = LANG_FIELDS.en;

    const name = getPlainText(props[lf.name]?.title || props[lf.name]?.rich_text) ||
                 getPlainText(props[lfEn.name]?.title || props[lfEn.name]?.rich_text) || 'Travel Spot';
    const description = getPlainText(props[lf.desc]?.rich_text) ||
                        getPlainText(props[lfEn.desc]?.rich_text) || '';
    const category = props['Category']?.select?.name || '';
    const region = props['Region']?.select?.name || '';
    const address = getPlainText(props['Address']?.rich_text);
    const coverImage = props['CoverImage']?.url || '';
    const photos = getFiles(props['Photos']?.files);
    const ogImage = coverImage || (photos.length > 0 ? photos[0] : 'https://travel.koinfo.kr/images/og-travel_2.png');
    const lat = props['Latitude']?.number || null;
    const lng = props['Longitude']?.number || null;

    const ogTitle = esc(name + ' — TravelKo');
    const ogDesc = esc(description.substring(0, 200));
    const spotUrl = 'https://travel.koinfo.kr/spot/' + id + (lang ? '?lang=' + lang : '');
    const appUrl = 'https://travel.koinfo.kr/?spot=' + id + (lang ? '&lang=' + lang : '');

    const CAT_EMOJI = { food: '🍜', attraction: '🏛️', cafe: '☕', nature: '🌿', shopping: '🛍️', nightlife: '🌙', halal: '🥘', mosque: '🕌', vegetarian: '🥗' };
    const catEmoji = CAT_EMOJI[category] || '📍';

    const html = `<!DOCTYPE html>
<html lang="${lang || 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#2563EB">
<link rel="icon" type="image/png" href="/images/main_bar.png">
<title>${ogTitle}</title>
<meta name="description" content="${ogDesc}">
<meta property="og:type" content="article">
<meta property="og:title" content="${ogTitle}">
<meta property="og:description" content="${ogDesc}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(spotUrl)}">
<meta property="og:site_name" content="TravelKo">
<meta property="og:locale" content="${{en:'en_US',ko:'ko_KR',id:'id_ID',mn:'mn_MN',ms:'ms_MY',vi:'vi_VN'}[lang] || 'en_US'}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ogTitle}">
<meta name="twitter:description" content="${ogDesc}">
<meta name="twitter:image" content="${esc(ogImage)}">
${lat && lng ? `<meta property="place:location:latitude" content="${lat}">\n<meta property="place:location:longitude" content="${lng}">` : ''}
<link rel="canonical" href="${esc(spotUrl)}">
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "TouristAttraction",
  "name": name,
  "description": description.substring(0, 300),
  "image": ogImage,
  "address": { "@type": "PostalAddress", "addressCountry": "KR", "streetAddress": address },
  ...(lat && lng ? { "geo": { "@type": "GeoCoordinates", "latitude": lat, "longitude": lng } } : {}),
  "isPartOf": { "@type": "WebSite", "name": "TravelKo", "url": "https://travel.koinfo.kr" }
})}
</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--p:#2563EB;--pd:#1D4ED8;--g50:#f9fafb;--g100:#f3f4f6;--g200:#e5e7eb;--g500:#6b7280;--g800:#1f2937;--g900:#111827;--r:8px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--g800);background:var(--g50);line-height:1.6;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--p);text-decoration:none}
header{background:#fff;border-bottom:1px solid var(--g200);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;max-width:720px;width:100%;margin:0 auto}
.logo{display:flex;align-items:center;gap:8px;font-size:1.1rem;font-weight:700;color:var(--g900);text-decoration:none}
.logo img{width:28px;height:28px;border-radius:4px}
.badge{font-size:0.72rem;font-weight:600;color:var(--p);background:#eff6ff;border:1px solid #bfdbfe;padding:3px 10px;border-radius:12px}
main{flex:1;max-width:720px;width:100%;margin:0 auto;padding:24px 20px 40px}
.spot-img{width:100%;max-height:400px;object-fit:cover;border-radius:var(--r);margin-bottom:16px}
.spot-cat{display:inline-block;font-size:0.78rem;font-weight:600;padding:3px 10px;border-radius:12px;background:#eff6ff;color:var(--p);margin-bottom:8px}
h1{font-size:1.4rem;font-weight:700;color:var(--g900);margin-bottom:8px}
.spot-meta{font-size:0.85rem;color:var(--g500);margin-bottom:16px}
.spot-desc{font-size:0.95rem;line-height:1.7;margin-bottom:20px}
.spot-addr{font-size:0.88rem;color:var(--g500);margin-bottom:24px}
.cta{text-align:center;margin-top:20px;padding:24px 16px;background:#fff;border:1px solid var(--g200);border-radius:var(--r)}
.cta p{color:var(--g500);font-size:0.9rem;margin-bottom:14px}
.cta-btn{display:inline-block;background:var(--p);color:#fff;font-weight:600;font-size:0.92rem;padding:10px 28px;border-radius:var(--r);text-decoration:none;transition:background 0.2s}
.cta-btn:hover{background:var(--pd);text-decoration:none}
footer{text-align:center;padding:20px;font-size:0.78rem;color:var(--g500);border-top:1px solid var(--g200);max-width:720px;width:100%;margin:0 auto}
@media(max-width:480px){main{padding:16px 14px 32px}h1{font-size:1.2rem}.spot-img{max-height:260px}}
</style>
</head>
<body>
<header>
<a href="/" class="logo"><img src="/images/main_bar.png" alt="TravelKo">TravelKo</a>
<span class="badge">${catEmoji} ${esc(category)}</span>
</header>
<main>
${ogImage && ogImage !== 'https://travel.koinfo.kr/images/og-travel_2.png' ? `<img class="spot-img" src="${esc(ogImage)}" alt="${esc(name)}">` : ''}
<span class="spot-cat">${catEmoji} ${esc(category)}</span>
<h1>${esc(name)}</h1>
<div class="spot-meta">${esc(region)}${address ? ' · ' + esc(address) : ''}</div>
<div class="spot-desc">${esc(description)}</div>
${lat && lng ? `<div class="spot-addr"><a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">📍 Open in Google Maps</a></div>` : ''}
<div class="cta">
<p>Explore more spots on TravelKo</p>
<a href="${esc(appUrl)}" class="cta-btn">Open in TravelKo</a>
</div>
</main>
<footer>&copy; 2026 TravelKo by KoInfo</footer>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
  } catch (err) {
    // Spot not found — redirect to main app
    return res.redirect(302, 'https://travel.koinfo.kr/');
  }
};
