'use strict';

// Minimal dependency-free PNG encoder used to produce the toolbar icon:
// a plain red circle on a transparent background, at the sizes Chrome wants.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let crcTable;
function makeCrcTable() {
  crcTable = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
}

function crc32(buf) {
  if (!crcTable) makeCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function makePNG(size) {
  const W = size;
  const H = size;
  const channels = 4; // RGBA
  const stride = 1 + W * channels; // +1 for the per-scanline filter byte
  const raw = Buffer.alloc(stride * H);

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const radius = W / 2 - Math.max(1, Math.round(W * 0.08));
  const R = 237;
  const G = 28;
  const B = 36;

  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0; // filter type 0 (none)
    for (let x = 0; x < W; x++) {
      const o = y * stride + 1 + x * channels;
      const dist = Math.hypot(x - cx, y - cy);
      let alpha;
      if (dist <= radius - 0.5) alpha = 255;
      else if (dist >= radius + 0.5) alpha = 0;
      else alpha = Math.round(255 * (radius + 0.5 - dist)); // 1px anti-alias edge
      raw[o] = R;
      raw[o + 1] = G;
      raw[o + 2] = B;
      raw[o + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function generateIcons(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const size of [16, 48, 128]) {
    fs.writeFileSync(path.join(dir, `icon${size}.png`), makePNG(size));
  }
}

module.exports = { generateIcons };

// Allow running directly: `node scripts/generate-icons.js [outDir]`
if (require.main === module) {
  generateIcons(process.argv[2] || path.join('dist', 'icons'));
  console.log('Icons generated.');
}
