// Generates the PWA icons: a full-bleed Ahi Red square with a poke bowl glyph.
// Full-bleed so it works as a maskable icon; the OS applies its own shape.
const fs = require("fs");
const zlib = require("zlib");

const RED = [0xee, 0x43, 0x5b];
const WHITE = [0xff, 0xff, 0xff];
const TEAL = [0x22, 0xb2, 0xb4];
const ORANGE = [0xfd, 0x9f, 0x27];
const CREAM = [0xf4, 0xed, 0xe3];

const SS = 4; // supersample factor, box-downsampled for antialiasing

function render(N) {
  const W = N * SS;
  const buf = Buffer.alloc(W * W * 3);
  const put = (x, y, c) => {
    const i = (y * W + x) * 3;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  };
  const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

  const cx = W / 2;
  const lipY = 0.56 * W;
  const bowlR = 0.27 * W;
  const rimHalf = 0.31 * W;
  const rimTop = 0.525 * W;
  const rimBot = 0.595 * W;
  const rimR = (rimBot - rimTop) / 2;
  const ing = [
    { x: 0.375 * W, y: 0.45 * W, r: 0.077 * W, c: TEAL },
    { x: 0.5 * W, y: 0.405 * W, r: 0.082 * W, c: CREAM },
    { x: 0.625 * W, y: 0.45 * W, r: 0.077 * W, c: ORANGE },
  ];

  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let c = RED;
      // ingredients sit behind the rim
      for (const g of ing) if (inCircle(x, y, g.x, g.y, g.r)) c = g.c;
      // the bowl's lip: a rounded horizontal bar
      const withinBar = x >= cx - rimHalf + rimR && x <= cx + rimHalf - rimR && y >= rimTop && y <= rimBot;
      const leftCap = inCircle(x, y, cx - rimHalf + rimR, rimTop + rimR, rimR);
      const rightCap = inCircle(x, y, cx + rimHalf - rimR, rimTop + rimR, rimR);
      if (withinBar || leftCap || rightCap) c = WHITE;
      // the bowl itself: lower half of a circle hanging off the lip
      if (y > rimTop + rimR && inCircle(x, y, cx, rimTop + rimR, bowlR)) c = WHITE;
      put(x, y, c);
    }
  }

  // box-downsample SS x SS blocks
  const out = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * W + (x * SS + dx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const n = SS * SS, o = (y * N + x) * 3;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  return out;
}

// --- minimal PNG writer (truecolour, 8-bit, no alpha) ---
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgb, N) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // truecolour
  const raw = Buffer.alloc(N * (N * 3 + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const N of [192, 512]) {
  const file = `icon-${N}.png`;
  fs.writeFileSync(file, png(render(N), N));
  console.log(file, (fs.statSync(file).size / 1024).toFixed(1) + "KB");
}
