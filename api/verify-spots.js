// Verify Spots API - Compare stored coordinates with geocoded address coordinates
// Usage: GET /api/verify-spots              → verify all published spots
//        GET /api/verify-spots?id=xxx       → verify a single spot by ID
//        GET /api/verify-spots?threshold=200 → only show spots with >200m error (default: 100)
// Returns: array of spots with coordinate discrepancies
const { Client } = require('@notionhq/client');
const https = require('https');

let notionClient = null;
function getNotion() {
  if (!notionClient) notionClient = new Client({ auth: process.env.NOTION_TOKEN_TRAVEL });
  return notionClient;
}

function getPlainText(rt) {
  if (!rt || !Array.isArray(rt)) return '';
  return rt.map(t => t.plain_text || '').join('');
}

function naverGeocode(query, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const url = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
    const options = {
      headers: {
        'X-NCP-APIGW-API-KEY-ID': clientId,
        'X-NCP-APIGW-API-KEY': clientSecret,
      },
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

// Haversine distance in meters
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Small delay to avoid rate limiting
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.NAVER_MAPS_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAPS_CLIENT_KEY;
  if (!clientId || !clientSecret || !process.env.NOTION_TOKEN_TRAVEL) {
    return res.status(500).json({ error: 'Required API keys not configured' });
  }

  const threshold = parseInt(req.query.threshold) || 100;
  const spotId = req.query.id || null;

  try {
    const notion = getNotion();
    const dbId = process.env.NOTION_DB_TRAVEL;

    // Fetch spots from Notion
    let allPages = [];
    if (spotId) {
      const page = await notion.pages.retrieve({ page_id: spotId });
      allPages = [page];
    } else {
      let cursor = undefined;
      do {
        const resp = await notion.databases.query({
          database_id: dbId,
          filter: { property: 'Published', checkbox: { equals: true } },
          page_size: 100,
          start_cursor: cursor,
        });
        allPages = allPages.concat(resp.results);
        cursor = resp.has_more ? resp.next_cursor : undefined;
      } while (cursor);
    }

    const results = [];
    for (const page of allPages) {
      const props = page.properties;
      const name = getPlainText(props['Name']?.title || props['Name']?.rich_text) || '(no name)';
      const address = getPlainText(props['Address']?.rich_text);
      const storedLat = props['Latitude']?.number;
      const storedLng = props['Longitude']?.number;

      if (!address || storedLat == null || storedLng == null) {
        results.push({
          id: page.id, name, address: address || '(empty)',
          storedLat, storedLng, status: 'skip', reason: 'missing address or coordinates',
        });
        continue;
      }

      // Geocode address
      await delay(100); // Naver API rate limit
      let geocoded;
      try {
        geocoded = await naverGeocode(address, clientId, clientSecret);
      } catch (e) {
        results.push({
          id: page.id, name, address, storedLat, storedLng,
          status: 'error', reason: 'geocoding failed: ' + e.message,
        });
        continue;
      }

      if (!geocoded.addresses || geocoded.addresses.length === 0) {
        results.push({
          id: page.id, name, address, storedLat, storedLng,
          status: 'no_result', reason: 'address not found by geocoder',
        });
        continue;
      }

      const geo = geocoded.addresses[0];
      const geoLat = parseFloat(geo.y);
      const geoLng = parseFloat(geo.x);
      const dist = Math.round(distanceMeters(storedLat, storedLng, geoLat, geoLng));

      if (dist >= threshold) {
        results.push({
          id: page.id, name, address,
          storedLat, storedLng,
          geocodedLat: geoLat, geocodedLng: geoLng,
          distanceMeters: dist,
          status: 'mismatch',
        });
      } else {
        results.push({
          id: page.id, name, address,
          storedLat, storedLng,
          geocodedLat: geoLat, geocodedLng: geoLng,
          distanceMeters: dist,
          status: 'ok',
        });
      }
    }

    // Sort: mismatches first, then by distance descending
    results.sort((a, b) => {
      if (a.status === 'mismatch' && b.status !== 'mismatch') return -1;
      if (a.status !== 'mismatch' && b.status === 'mismatch') return 1;
      return (b.distanceMeters || 0) - (a.distanceMeters || 0);
    });

    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      mismatch: results.filter(r => r.status === 'mismatch').length,
      noResult: results.filter(r => r.status === 'no_result').length,
      skip: results.filter(r => r.status === 'skip').length,
      error: results.filter(r => r.status === 'error').length,
      threshold: threshold + 'm',
    };

    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).json({ summary, results });
  } catch (error) {
    console.error('Verify spots error:', error);
    res.status(500).json({ error: 'Verification failed: ' + error.message });
  }
};
