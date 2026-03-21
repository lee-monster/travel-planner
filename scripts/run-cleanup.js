// Run cleanup via deployed admin API
// Usage: node scripts/run-cleanup.js <admin-key>
const fs = require('fs');
const path = require('path');
const https = require('https');

const ADMIN_KEY = process.argv[2];
if (!ADMIN_KEY) {
  console.error('Usage: node scripts/run-cleanup.js <admin-key>');
  console.error('admin-key = JWT_SECRET or NOTION_TOKEN_TRAVEL value from Vercel env');
  process.exit(1);
}

const API_URL = 'https://travel.koinfo.kr/api/admin/cleanup';

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('Parse error: ' + body.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const unpublishIds = JSON.parse(fs.readFileSync(path.join(__dirname, 'unpublish-ids.json'), 'utf8'));
  const coordFixes = JSON.parse(fs.readFileSync(path.join(__dirname, 'coord-fixes.json'), 'utf8'));

  // Process in batches of 20 to avoid timeout
  const BATCH = 20;

  console.log(`\n=== UNPUBLISH ${unpublishIds.length} DUPLICATES (batches of ${BATCH}) ===\n`);
  let totalOk = 0, totalErr = 0;

  for (let i = 0; i < unpublishIds.length; i += BATCH) {
    const batch = unpublishIds.slice(i, i + BATCH);
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}: IDs ${i + 1}-${i + batch.length}...`);
    try {
      const result = await postJson(API_URL, { action: 'unpublish', ids: batch }, { 'X-Admin-Key': ADMIN_KEY });
      totalOk += result.ok || 0;
      totalErr += result.errors || 0;
      if (result.errors > 0) {
        result.results.filter(r => r.status === 'error').forEach(r => console.log(`    ERROR: ${r.id.slice(0, 8)} - ${r.message}`));
      }
    } catch (e) {
      console.error(`    BATCH ERROR: ${e.message}`);
      totalErr += batch.length;
    }
  }
  console.log(`\nUnpublish done: ${totalOk} ok, ${totalErr} errors\n`);

  console.log(`=== FIX COORDINATES: ${coordFixes.length} SPOTS (batches of ${BATCH}) ===\n`);
  let fixOk = 0, fixErr = 0;

  for (let i = 0; i < coordFixes.length; i += BATCH) {
    const batch = coordFixes.slice(i, i + BATCH).map(f => ({ id: f.id, lat: f.lat, lng: f.lng }));
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}: fixes ${i + 1}-${i + batch.length}...`);
    try {
      const result = await postJson(API_URL, { action: 'update_coords', updates: batch }, { 'X-Admin-Key': ADMIN_KEY });
      fixOk += result.ok || 0;
      fixErr += result.errors || 0;
      if (result.errors > 0) {
        result.results.filter(r => r.status === 'error').forEach(r => console.log(`    ERROR: ${r.id.slice(0, 8)} - ${r.message}`));
      }
    } catch (e) {
      console.error(`    BATCH ERROR: ${e.message}`);
      fixErr += batch.length;
    }
  }
  console.log(`\nCoord fixes done: ${fixOk} ok, ${fixErr} errors`);
  console.log(`\n=== ALL DONE ===`);
}

main().catch(console.error);
