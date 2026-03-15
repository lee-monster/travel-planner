// Shared auth utilities for TravelKo
// JWT creation/verification + Google token validation

const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'travelko-dev-secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

// Simple JWT implementation using Node.js crypto
function base64url(buf) {
  return (typeof buf === 'string' ? Buffer.from(buf) : buf)
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createToken(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })); // 30 days
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Verify Google ID token via Google's tokeninfo endpoint
async function verifyGoogleToken(idToken) {
  try {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!res.ok) {
      console.error('Google tokeninfo failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    // Verify audience matches our client ID
    if (GOOGLE_CLIENT_ID && data.aud !== GOOGLE_CLIENT_ID) {
      console.error('Google aud mismatch:', data.aud, '!=', GOOGLE_CLIENT_ID);
      return null;
    }
    return {
      googleId: data.sub,
      email: data.email,
      name: data.name || data.email.split('@')[0],
      avatar: data.picture || ''
    };
  } catch (e) {
    console.error('Google token verification error:', e);
    return null;
  }
}

// Extract user from Authorization header
function getUserFromRequest(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}

// CORS headers for API responses
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = { createToken, verifyToken, verifyGoogleToken, getUserFromRequest, setCors };
