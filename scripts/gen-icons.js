const sharp = require('sharp');
const path = require('path');

const icons = [
  { src: 'icon-192.svg', out: 'icon-192.png', size: 192 },
  { src: 'icon-512.svg', out: 'icon-512.png', size: 512 },
  { src: 'maskable-512.svg', out: 'maskable-512.png', size: 512 },
];

(async () => {
  for (const icon of icons) {
    const input = path.join(__dirname, '..', 'icons', icon.src);
    const output = path.join(__dirname, '..', 'icons', icon.out);
    await sharp(input)
      .resize(icon.size, icon.size)
      .png()
      .toFile(output);
    console.log(`Generated ${icon.out} (${icon.size}x${icon.size})`);
  }
})();
