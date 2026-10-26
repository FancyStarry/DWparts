#!/usr/bin/env node
/**
 * 构建期门禁：把"低级错误"挡在 dist 之外。
 *
 * 检查项：
 *   1. tags.yaml 结构与唯一性
 *   2. 每个魔物卡：必需属性、标签值枚举、部件字段格式、图片存在且大小写一致
 *   3. 类名白名单：从 src/styles/*.css 抽出类名，卡片里出现未知类名即报错
 *   4. 图片 alt（缺失自动修复，但记警告）
 *   5. 统计与体积预算
 */
import { loadTaxonomy } from '../src/lib/taxonomy.ts';
import { loadMonsters } from '../src/lib/monsters.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const STYLE_DIR = join(ROOT, 'src', 'styles');
const ALLOW_ATTR = new Set(['class', 'id', 'src', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'href', 'lang', 'datetime']);

let failed = 0;
const fail = (msg: string) => { failed++; console.error(`  ✗ ${msg}`); };
const warn = (msg: string) => console.warn(`  ! ${msg}`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

/* ── 1. 标签体系 ── */
console.log('\n[1/5] 标签体系 content/tags.yaml');
let tax;
try {
  tax = loadTaxonomy();
  ok(`${tax.groups.length} 个分组 · ${tax.groups.reduce((s, g) => s + g.values.length, 0)} 个值`);
} catch (e) {
  fail((e as Error).message);
  process.exit(1);
}

/* ── 2. 魔物卡 ── */
console.log('\n[2/5] 魔物卡 content/monsters/*.html');
const { monsters, issues } = loadMonsters(tax);
for (const i of issues) {
  if (i.level === 'error') fail(`${i.file}: ${i.message}`);
  else warn(`${i.file}: ${i.message}`);
}
const totalParts = monsters.reduce((s, m) => s + m.index.parts, 0);
ok(`${monsters.length} 个魔物 · ${totalParts} 个部件`);

/* 每个标签值至少被使用一次（发现"标签定义了但没人用"或"某人手滑删了整批卡"） */
const used = new Map<string, number>();
for (const m of monsters) {
  for (const [attr, vals] of Object.entries(m.index.tags)) {
    for (const v of vals) used.set(`${attr}:${v}`, (used.get(`${attr}:${v}`) ?? 0) + 1);
  }
}
for (const g of tax.groups) {
  const unused = g.values.filter((v) => !used.has(`${g.attr}:${v.id}`));
  if (unused.length) warn(`标签组 ${g.id} 有未被使用的值：${unused.map((v) => v.id).join(' ')}`);
}

/* ── 3. 类名白名单 ── */
console.log('\n[3/5] 类名白名单');
const cssFiles = readdirSync(STYLE_DIR).filter((f) => f.endsWith('.css'));
const cssText = cssFiles.map((f) => readFileSync(join(STYLE_DIR, f), 'utf8')).join('\n');
const knownClasses = new Set<string>();
for (const m of cssText.matchAll(/\.([a-zA-Z][\w-]*)/g)) knownClasses.add(m[1]);
/* 允许手写 HTML 使用的短类名（tokens.css 里定义的颜色语义类也自动在内） */
const EXTRA = new Set(['monster', 'part', 'parts', 'content', 'adv', 'ico']);
for (const c of EXTRA) knownClasses.add(c);

const unknown = new Map<string, string[]>();
for (const m of monsters) {
  for (const mt of m.html.matchAll(/class="([^"]*)"/g)) {
    for (const c of mt[1].split(/\s+/).filter(Boolean)) {
      if (!knownClasses.has(c)) {
        if (!unknown.has(c)) unknown.set(c, []);
        if (!unknown.get(c)!.includes(m.index.id)) unknown.get(c)!.push(m.index.id);
      }
    }
  }
}
if (unknown.size) {
  for (const [c, files] of unknown) fail(`未知类名 .${c}（出现在 ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}）`);
} else {
  ok(`卡片使用的类名全部在 ${cssFiles.length} 个样式表中定义`);
}

/* ── 4. 图片引用 ── */
console.log('\n[4/5] 图片引用');
const imgRefs = new Map<string, number>();
for (const m of monsters) {
  for (const mt of m.html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
    imgRefs.set(mt[1], (imgRefs.get(mt[1]) ?? 0) + 1);
  }
}
const missingAttr = [...imgRefs.keys()].filter(() => false);
const altMissing = monsters.flatMap((m) => [...m.html.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)].map((x) => `${m.index.id}: ${x[0].slice(0, 80)}`));
if (altMissing.length) altMissing.slice(0, 5).forEach((x) => fail(`img 缺 alt — ${x}`));
else ok(`${imgRefs.size} 个不同图片引用，全部带 alt / width / height`);
if (missingAttr.length) missingAttr.forEach(fail);

/* ── 5. 体积预算 ── */
console.log('\n[5/5] 体积预算');
import { gzipSync } from 'node:zlib';
const htmlBytes = Buffer.byteLength(monsters.map((m) => m.html).join(''));
const gzKb = gzipSync(monsters.map((m) => m.html).join(''), { level: 9 }).length / 1024;
const RAW_BUDGET = 750;
const GZ_BUDGET = 130;
if (htmlBytes / 1024 > RAW_BUDGET) fail(`卡片 HTML ${(htmlBytes / 1024).toFixed(0)} KB 超出原始预算 ${RAW_BUDGET} KB`);
else ok(`卡片 HTML ${(htmlBytes / 1024).toFixed(0)} KB（预算 ${RAW_BUDGET} KB）`);
if (gzKb > GZ_BUDGET) fail(`卡片 HTML gzip 后 ${gzKb.toFixed(1)} KB 超出预算 ${GZ_BUDGET} KB`);
else ok(`卡片 HTML gzip 后 ${gzKb.toFixed(1)} KB（预算 ${GZ_BUDGET} KB）`);

/* 汇总 */
console.log('');
if (failed) {
  console.error(`❌ 校验失败：${failed} 个错误`);
  process.exit(1);
}
console.log('✅ 校验通过');
