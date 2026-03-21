// Build cleanup payload from verify-results.json + duplicate analysis
// Outputs two JSON files: unpublish-ids.json and coord-fixes.json
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'verify-results.json'), 'utf8'));
const results = data.results;

// Step 1: Group spots by name to find duplicates
const nameGroups = {};
results.forEach(r => {
  const key = r.name.toLowerCase().trim();
  if (!nameGroups[key]) nameGroups[key] = [];
  nameGroups[key].push(r);
});

// Also group similar names (Myeongdong / Myeongdong Shopping Street)
const mergeNames = {
  'myeongdong shopping street': 'myeongdong',
  'haeundae beach': 'haeundae beach',  // Korean name varies
};

// Step 2: For each duplicate group, pick the best one to keep
const toUnpublish = [];
const toKeep = new Set();

Object.entries(nameGroups).forEach(([name, spots]) => {
  if (spots.length <= 1) return;

  // Sort: prefer spots with lowest distance (most accurate coords),
  // then older createdAt (TravelKo Team entries are from 03-08~03-10)
  spots.sort((a, b) => {
    // Prefer entries with geocoded data
    const aDist = a.distanceMeters != null ? a.distanceMeters : 999999;
    const bDist = b.distanceMeters != null ? b.distanceMeters : 999999;
    return aDist - bDist;
  });

  // Keep the first (most accurate), unpublish the rest
  const keeper = spots[0];
  toKeep.add(keeper.id);
  console.log(`\n[${name}] (${spots.length} entries) → KEEP: ${keeper.id.slice(0,8)} (${keeper.distanceMeters || '?'}m)`);

  for (let i = 1; i < spots.length; i++) {
    toUnpublish.push(spots[i].id);
    console.log(`  DELETE: ${spots[i].id.slice(0,8)} (${spots[i].distanceMeters || '?'}m)`);
  }
});

// Handle cross-name duplicates: Myeongdong / Myeongdong Shopping Street
const myeongdong = nameGroups['myeongdong'];
const myeongdongShopping = nameGroups['myeongdong shopping street'];
if (myeongdong && myeongdongShopping) {
  myeongdongShopping.forEach(s => {
    if (!toUnpublish.includes(s.id)) {
      toUnpublish.push(s.id);
      console.log(`\n[cross-name] Myeongdong Shopping Street → DELETE: ${s.id.slice(0,8)}`);
    }
  });
}

// N Seoul Tower / Namsan Seoul Tower
const nSeoul = nameGroups['n seoul tower'];
const namsanSeoul = nameGroups['namsan seoul tower'];
if (nSeoul && namsanSeoul) {
  // Keep one, unpublish the other
  namsanSeoul.forEach(s => {
    if (!toUnpublish.includes(s.id)) {
      toUnpublish.push(s.id);
      console.log(`\n[cross-name] Namsan Seoul Tower → DELETE: ${s.id.slice(0,8)}`);
    }
  });
}

// Step 3: Coord fixes - spots we're keeping that have >500m error
const coordFixes = [];
results.forEach(r => {
  if (toUnpublish.includes(r.id)) return; // skip items being deleted
  if (r.status !== 'mismatch') return;
  if (r.distanceMeters == null || r.distanceMeters < 500) return;
  if (!r.geocodedLat || !r.geocodedLng) return;

  coordFixes.push({
    id: r.id,
    name: r.name,
    distanceMeters: r.distanceMeters,
    oldLat: r.storedLat,
    oldLng: r.storedLng,
    lat: r.geocodedLat,
    lng: r.geocodedLng,
  });
});

// Sort coord fixes by distance descending
coordFixes.sort((a, b) => b.distanceMeters - a.distanceMeters);

console.log('\n\n=== SUMMARY ===');
console.log(`Spots to unpublish: ${toUnpublish.length}`);
console.log(`Spots to fix coords: ${coordFixes.length}`);

// Write output files
fs.writeFileSync(path.join(__dirname, 'unpublish-ids.json'), JSON.stringify(toUnpublish, null, 2));
fs.writeFileSync(path.join(__dirname, 'coord-fixes.json'), JSON.stringify(coordFixes, null, 2));

console.log('\nFiles written: unpublish-ids.json, coord-fixes.json');
