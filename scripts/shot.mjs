/**
 * 视觉核对：用 headless Chromium 抓几张关键状态的图。
 * 需要系统里装了 chromium（apt install chromium）。
 *
 *   node scripts/shot.mjs [baseUrl] [outDir]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8088/';
const OUT = process.argv[3] ?? '/tmp/shots';
mkdirSync(OUT, { recursive: true });

const shots = [
  ['desktop-top',   ''],
  ['desktop-filter', '?race=undead&level=7'],
  ['part-mode',      '?act=react&mode=part'],
  ['mobile',         '', { w: 390, h: 1800 }],
];

for (const [name, qs, size] of shots) {
  const w = size?.w ?? 1440;
  const h = size?.h ?? 2600;
  const file = `${OUT}/${name}.png`;
  execFileSync('chromium', [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--window-size=${w},${h}`, '--virtual-time-budget=8000',
    '--force-device-scale-factor=1', `--screenshot=${file}`, BASE + qs,
  ], { stdio: 'ignore' });
  console.log('✓', file);
}
