// Verify Spots API - Compare stored coordinates with geocoded address coordinates
// Usage: GET /api/verify-spots              → verify all published spots
//        GET /api/verify-spots?id=xxx       → verify a single spot by ID
//        GET /api/verify-spots?threshold=200 → only flag spots with >200m error (default: 100)
// Returns: { summary, results[] } sorted by distance descending
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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error')); }
      });
    }).on('error', reject);
  });
}

async function googleGeocode(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=ko&region=kr&key=${apiKey}`;
  const result = await httpsGet(url);
  if (result.status === 'OK' && result.results && result.results.length > 0) {
    const loc = result.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng, formattedAddress: result.results[0].formatted_address };
  }
  return null;
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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleKey || !process.env.NOTION_TOKEN_TRAVEL) {
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

      await delay(50); // Google Geocoding rate limit
      let geo;
      try {
        geo = await googleGeocode(address, googleKey);
      } catch (e) {
        results.push({
          id: page.id, name, address, storedLat, storedLng,
          status: 'error', reason: 'geocoding failed: ' + e.message,
        });
        continue;
      }

      if (!geo) {
        results.push({
          id: page.id, name, address, storedLat, storedLng,
          status: 'no_result', reason: 'address not found by geocoder',
        });
        continue;
      }

      const dist = Math.round(distanceMeters(storedLat, storedLng, geo.lat, geo.lng));

      results.push({
        id: page.id, name, address,
        storedLat, storedLng,
        geocodedLat: geo.lat, geocodedLng: geo.lng,
        geocodedAddress: geo.formattedAddress,
        distanceMeters: dist,
        status: dist >= threshold ? 'mismatch' : 'ok',
      });
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
