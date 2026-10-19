import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Helper to write valid PNG with solid color & gradient/icon pixels
function createPng(width, height, isMaskable = false) {
  // RGBA buffer
  const rowSize = width * 4;
  const rawData = Buffer.alloc((rowSize + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const maxR = width * 0.42;
  const safeR = isMaskable ? width * 0.35 : width * 0.42;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background gradient: dark slate-violet
      let r = 15;
      let g = 23;
      let b = 42;
      let a = 255;

      // Inner circular glowing hub
      if (dist < safeR) {
        // Gradient from indigo to violet
        const t = (x + y) / (width + height);
        r = Math.floor(99 * (1 - t) + 139 * t);
        g = Math.floor(102 * (1 - t) + 92 * t);
        b = Math.floor(241 * (1 - t) + 246 * t);

        // Arrow shape
        const nx = dx / (width * 0.5);
        const ny = dy / (height * 0.5);

        // Stem: |nx| < 0.12 and -0.45 < ny < 0.15
        const isStem = Math.abs(nx) < 0.12 && ny > -0.45 && ny < 0.15;
        // Head: triangle pointing down
        const isHead = ny >= 0.05 && ny <= 0.42 && Math.abs(nx) <= (0.42 - ny) * 0.9;
        // Cradle tray: ny between 0.48 and 0.62 and |nx| < 0.55
        const isCradle = ny >= 0.48 && ny <= 0.60 && Math.abs(nx) <= 0.55;

        if (isStem || isHead || isCradle) {
          r = 255;
          g = 255;
          b = 255;
        }
      } else if (dist < safeR + 8) {
        // glowing rim
        r = 56;
        g = 189;
        b = 248;
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Simple CRC32 for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(64, 64, false));

console.log('Successfully generated all PWA PNG icons!');
