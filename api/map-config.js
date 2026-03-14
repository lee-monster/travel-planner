module.exports = (req, res) => {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.json({
    clientId: process.env.NAVER_MAPS_CLIENT_ID || '',
    googleKey: process.env.GOOGLE_MAPS_API_KEY || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
};
