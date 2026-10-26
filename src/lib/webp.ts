/** 读取 WebP 的像素尺寸（用于构建期补 width/height，防止 CLS） */
import { readFileSync } from 'node:fs';

export interface Size { width: number; height: number }

const cache = new Map<string, Size | null>();

export function webpSize(path: string): Size | null {
  if (cache.has(path)) return cache.get(path)!;
  let size: Size | null = null;
  try {
    const b = readFileSync(path);
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error('not webp');
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      size = { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
    } else if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      size = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    } else if (chunk === 'VP8 ') {
      size = { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
  } catch {
    size = null;
  }
  cache.set(path, size);
  return size;
}
