#!/usr/bin/env node
/**
 * 生成徽章头像裁切用的「洞口」遮罩图。
 *
 * 为什么需要这一步：
 *   游戏原素材 `<kind>_back.png` 是一张"实心遮罩"，中间挖了洞口（alpha=0 处是洞口）。
 *   直接把它当 CSS mask 用会得到"反过来"的效果，需要 `mask-composite: exclude`
 *   再叠一层才能取反 —— 而这个属性兼容性很差，不支持的浏览器会把两层当并集，
 *   结果整块立绘露出来，看上去就是个方框。
 *
 *   所以在这里把 alpha 预先取反，得到"洞口内不透明、洞口外透明"的单层遮罩。
 *   CSS 只需一个 `mask-image`，无图层合成，所有浏览器一致。
 *
 * 用法：node scripts/build-masks.mjs
 * 输入：assets-src/img/raw/common/{b,m,s1,s2}_back.png
 * 输出：public/img/common/mask-{basic,m,s1,s2}.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'assets-src/img/raw/common');
const OUT = join(ROOT, 'public/img/common');

/* ────────── 极简 PNG 读写（只处理 8bit RGBA / 非隔行） ────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`仅支持 8bit 非隔行 RGBA/RGB，实际 depth=${bitDepth} type=${colorType} interlace=${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    line.copy(prev);
    for (let x = 0; x < width; x++) {
      const si = x * bpp, di = (y * width + x) * 4;
      out[di] = line[si];
      out[di + 1] = line[si + 1];
      out[di + 2] = line[si + 2];
      out[di + 3] = bpp === 4 ? line[si + 3] : 255;
    }
  }
  return { width, height, data: out };
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;                                  // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ────────── 取反 alpha，得到洞口遮罩 ────────── */
/* 部件类型 → 遮罩源文件。基础卡的素材前缀是 b，但 data-part 值是 basic，
   为免两套命名，输出统一跟 data-part 走：mask-basic / mask-m / mask-s1 / mask-s2 */
const KINDS = [
  { kind: 'basic', src: 'b' },
  { kind: 'm', src: 'm' },
  { kind: 's1', src: 's1' },
  { kind: 's2', src: 's2' },
];
for (const { kind, src: prefix } of KINDS) {
  const src = decodePng(readFileSync(join(SRC, `${prefix}_back.png`)));
  const { width, height, data } = src;
  const out = Buffer.alloc(width * height * 4);
  let holeCount = 0;
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    const inv = 255 - a;                       // 洞口(原 alpha 0) → 255；外圈 → 0
    out[i * 4] = 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = inv;
    if (inv > 128) holeCount++;
  }
  const file = join(OUT, `mask-${kind}.png`);
  writeFileSync(file, encodePng(width, height, out));
  const ratio = ((holeCount / (width * height)) * 100).toFixed(1);
  console.log(`  ✓ mask-${kind}.png  ${width}×${height}  洞口占比 ${ratio}%`);
}
console.log(`\n共生成 ${KINDS.length} 张洞口遮罩`);
