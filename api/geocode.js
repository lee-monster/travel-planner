// Geocode API - Convert address to coordinates
// Uses Google Maps Geocoding (primary) with Naver Maps Geocoding (fallback)
// Usage: GET /api/geocode?query=부산광역시+해운대구+달맞이길62번길+13
//        GET /api/geocode?query=...&provider=naver  (force Naver)
//        GET /api/geocode?query=...&provider=google (force Google)
const https = require('https');

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const options = headers ? { headers } : {};
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse response')); }
      });
    }).on('error', reject);
  });
}

async function googleGeocode(query, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&language=ko&region=kr&key=${apiKey}`;
  const result = await httpsGet(url);
  if (result.status !== 'OK' || !result.results || result.results.length === 0) {
    return [];
  }
  return result.results.map(r => ({
    formattedAddress: r.formatted_address || '',
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    provider: 'google',
  }));
}

async function naverGeocode(query, clientId, clientSecret) {
  const url = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
  const result = await httpsGet(url, {
    'X-NCP-APIGW-API-KEY-ID': clientId,
    'X-NCP-APIGW-API-KEY': clientSecret,
  });
  if (!result.addresses || result.addresses.length === 0) {
    return [];
  }
  return result.addresses.map(a => ({
    formattedAddress: a.roadAddress || a.jibunAddress || '',
    lat: parseFloat(a.y),
    lng: parseFloat(a.x),
    provider: 'naver',
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, provider } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const naverId = process.env.NAVER_MAPS_CLIENT_ID;
  const naverSecret = process.env.NAVER_MAPS_CLIENT_KEY;

  try {
    let addresses = [];

    // Try Google first (better Korean address coverage), fallback to Naver
    if (provider === 'naver') {
      if (naverId && naverSecret) addresses = await naverGeocode(query, naverId, naverSecret);
    } else if (provider === 'google') {
      if (googleKey) addresses = await googleGeocode(query, googleKey);
    } else {
      // Auto: Google first, Naver fallback
      if (googleKey) addresses = await googleGeocode(query, googleKey);
      if (addresses.length === 0 && naverId && naverSecret) {
        addresses = await naverGeocode(query, naverId, naverSecret);
      }
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ query, addresses });
  } catch (error) {
    console.error('Geocode API error:', error);
    res.status(500).json({ error: 'Geocoding failed: ' + error.message });
  }
};
