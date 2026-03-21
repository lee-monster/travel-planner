// Geocode API - Convert Korean address to coordinates using Naver Maps Geocoding
// Usage: GET /api/geocode?query=부산광역시+해운대구+달맞이길62번길+13
// Returns: { addresses: [{ roadAddress, jibunAddress, x (lng), y (lat) }] }
const https = require('https');

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
        catch (e) { reject(new Error('Failed to parse geocode response')); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query parameter required' });
  }

  const clientId = process.env.NAVER_MAPS_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAPS_CLIENT_KEY;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Naver Maps API keys not configured' });
  }

  try {
    const result = await naverGeocode(query, clientId, clientSecret);

    // Simplify response
    const addresses = (result.addresses || []).map(a => ({
      roadAddress: a.roadAddress || '',
      jibunAddress: a.jibunAddress || '',
      lat: parseFloat(a.y),
      lng: parseFloat(a.x),
    }));

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ query, addresses });
  } catch (error) {
    console.error('Geocode API error:', error);
    res.status(500).json({ error: 'Geocoding failed' });
  }
};
