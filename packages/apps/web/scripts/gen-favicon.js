/* Generate public/favicon.ico from public/tenorfi_logo.png — pure Node, no deps.
   Decodes the (8-bit RGBA, non-interlaced) PNG, fits it onto a centered
   256x256 transparent canvas, re-encodes as PNG, and wraps it in an ICO. */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const SRC = path.join(__dirname, "..", "public", "tenorfi_logo.png");
const OUT = path.join(__dirname, "..", "public", "favicon.ico");
const SIZE = 256; // square canvas
const PAD = 12; // transparent margin

// ---- CRC32 (for PNG chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- decode PNG (8-bit RGBA, non-interlaced) ----
function decodePNG(buf) {
  let pos = 8;
  let width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error("expected 8-bit RGBA PNG");
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let recon;
      switch (filter) {
        case 0: recon = v; break;
        case 1: recon = v + a; break;
        case 2: recon = v + b; break;
        case 3: recon = v + ((a + b) >> 1); break;
        case 4: recon = v + paeth(a, b, c); break;
        default: throw new Error("bad filter " + filter);
      }
      out[y * stride + x] = recon & 0xff;
    }
  }
  return { width, height, data: out };
}

// ---- bilinear resize RGBA ----
function resize(src, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * sh) / th - 0.5;
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - Math.floor(sy);
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * sw) / tw - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - Math.floor(sx);
      const di = (y * tw + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const p00 = src[(y0 * sw + x0) * 4 + ch];
        const p01 = src[(y0 * sw + x1) * 4 + ch];
        const p10 = src[(y1 * sw + x0) * 4 + ch];
        const p11 = src[(y1 * sw + x1) * 4 + ch];
        const top = p00 + (p01 - p00) * fx;
        const bot = p10 + (p11 - p10) * fx;
        out[di + ch] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return out;
}

// ---- encode PNG (8-bit RGBA) ----
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(rgba, w, h) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- main ----
const src = decodePNG(fs.readFileSync(SRC));
const avail = SIZE - PAD * 2;
const scale = Math.min(avail / src.width, avail / src.height);
const tw = Math.max(1, Math.round(src.width * scale));
const th = Math.max(1, Math.round(src.height * scale));
const scaled = resize(src.data, src.width, src.height, tw, th);

const canvas = Buffer.alloc(SIZE * SIZE * 4); // transparent
const ox = Math.floor((SIZE - tw) / 2);
const oy = Math.floor((SIZE - th) / 2);
for (let y = 0; y < th; y++) {
  for (let x = 0; x < tw; x++) {
    const s = (y * tw + x) * 4;
    const d = ((y + oy) * SIZE + (x + ox)) * 4;
    canvas[d] = scaled[s];
    canvas[d + 1] = scaled[s + 1];
    canvas[d + 2] = scaled[s + 2];
    canvas[d + 3] = scaled[s + 3];
  }
}

const png = encodePNG(canvas, SIZE, SIZE);

// ---- wrap in ICO (single PNG entry) ----
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
const dir = Buffer.alloc(16);
dir[0] = 0; // width 256
dir[1] = 0; // height 256
dir[2] = 0; // palette
dir[3] = 0; // reserved
dir.writeUInt16LE(1, 4); // planes
dir.writeUInt16LE(32, 6); // bpp
dir.writeUInt32LE(png.length, 8); // size
dir.writeUInt32LE(6 + 16, 12); // offset
fs.writeFileSync(OUT, Buffer.concat([header, dir, png]));
console.log(`favicon.ico written: ${SIZE}x${SIZE}, logo ${tw}x${th}, ${(6 + 16 + png.length)} bytes`);
