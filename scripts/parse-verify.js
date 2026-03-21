const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify-results.json'), 'utf8'));

console.log('=== SUMMARY ===');
console.log(JSON.stringify(data.summary, null, 2));
console.log('');

console.log('=== MISMATCHES (>100m) ===');
data.results.forEach(r => {
  if (r.status === 'mismatch') {
    const dist = String(r.distanceMeters).padStart(6);
    const name = (r.name || '').padEnd(40).slice(0, 40);
    console.log(`${dist}m | ${name} | stored: ${r.storedLat},${r.storedLng} | geo: ${r.geocodedLat},${r.geocodedLng} | ${r.id.slice(0,8)}`);
  }
});

console.log('');
console.log('=== NO RESULT ===');
data.results.forEach(r => {
  if (r.status === 'no_result') {
    console.log(`${r.name} | ${r.address} | ${r.id.slice(0,8)}`);
  }
});
