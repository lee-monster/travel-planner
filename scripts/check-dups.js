const https = require('https');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const base = 'https://travel.koinfo.kr/api/travel-spots?lang=en&limit=100';
  let all = [];
  let cursor = null;

  do {
    const url = cursor ? base + '&cursor=' + cursor : base;
    const data = await fetchJson(url);
    all = all.concat(data.items);
    cursor = data.hasMore ? data.nextCursor : null;
  } while (cursor);

  console.log('Total published spots:', all.length);

  // Check duplicates by name
  const names = {};
  all.forEach(s => {
    const k = s.name.toLowerCase().trim();
    if (!names[k]) names[k] = [];
    names[k].push({ id: s.id.slice(0, 8), lat: s.lat, lng: s.lng });
  });

  const dups = Object.entries(names).filter(([k, v]) => v.length > 1);
  if (dups.length === 0) {
    console.log('No duplicates found!');
  } else {
    console.log('Duplicates remaining:', dups.length);
    dups.forEach(([name, entries]) => {
      console.log('  ' + name + ': ' + entries.map(e => e.id).join(', '));
    });
  }
}

main().catch(console.error);
