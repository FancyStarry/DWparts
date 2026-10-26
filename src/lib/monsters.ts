/**
 * 魔物卡加载与构建期标准化。
 *
 * content/monsters/*.html 是手写、可单文件预览的完整 HTML 文档；
 * 这里只做四件事：抽取 <article>、按 tags.yaml 校验、补全 <img>、收集筛选索引。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, serializeOuter } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { Taxonomy } from './taxonomy.ts';
import { webpSize } from './webp.ts';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
export const MONSTERS_DIR = join(process.cwd(), 'content', 'monsters');
export const PUBLIC_DIR = join(process.cwd(), 'public');

export interface MonsterIndex {
  id: string;
  name: string;
  race: string;
  level: string;
  /** 该魔物所有部件命中过的标签：{ attr: [valueId] } */
  tags: Record<string, string[]>;
  parts: number;
  /** 供客户端显示的顺序（与 DOM 一致） */
  order: number;
}

export interface Monster {
  index: MonsterIndex;
  /** 标准化后的 <article> HTML（不含外层文档壳） */
  html: string;
}

export interface Issue { file: string; line?: number; level: 'error' | 'warn'; message: string }

/* ────────── parse5 小工具 ────────── */
const A = (n: Element) => Object.fromEntries((n.attrs ?? []).map((a) => [a.name, a.value]));
const cls = (n: Element) => (A(n).class ?? '').split(/\s+/).filter(Boolean);
const has = (n: Element, c: string) => cls(n).includes(c);
const elKids = (n: Node): Element[] =>
  ((n as { childNodes?: Node[] }).childNodes ?? []).filter((c): c is Element => Boolean((c as Element).tagName));
const walk = (n: Node, fn: (e: Element) => void) => { for (const c of elKids(n)) { fn(c); walk(c, fn); } };
const find = (n: Node, pred: (e: Element) => boolean): Element | null => {
  let r: Element | null = null;
  walk(n, (c) => { if (!r && pred(c)) r = c; });
  return r;
};
const textOf = (n: Node): string =>
  ((n as { childNodes?: Node[] }).childNodes ?? [])
    .map((c) => ((c as Element).tagName ? textOf(c) : ((c as { value?: string }).value ?? '')))
    .join('');

/* ────────── 主流程 ────────── */
export interface LoadOptions {
  /**
   * 站点根路径，必须以 / 结尾（默认 '/'）。
   *
   * 遮罩图 URL 写在 CSS 变量里由 CSS 消费，相对路径会相对"样式表"解析而不是页面，
   * 因此只能给绝对路径；这里统一拼上 base，子路径部署时自动正确。
   */
  base?: string;
}

export function loadMonsters(tax: Taxonomy, opts: LoadOptions = {}): { monsters: Monster[]; issues: Issue[] } {
  const base = opts.base?.endsWith('/') ? opts.base : `${opts.base ?? ''}/`;
  const issues: Issue[] = [];
  let autoAlt = 0;
  const files = readdirSync(MONSTERS_DIR).filter((f) => f.endsWith('.html')).sort();
  if (!files.length) throw new Error(`content/monsters/ 下没有 .html 文件`);

  const monsters: Monster[] = [];
  const seenIds = new Set<string>();

  files.forEach((file, order) => {
    const path = join(MONSTERS_DIR, file);
    const src = readFileSync(path, 'utf8');
    const doc = parse(src, { sourceCodeLocationInfo: true });
    const article = find(doc, (n) => has(n, 'monster'));

    if (!article) {
      issues.push({ file, level: 'error', message: '缺少 <article class="monster"> 根元素' });
      return;
    }

    /* ---- 属性校验 ---- */
    const a = A(article);
    const id = a['data-id'] ?? a.id;
    if (!id) issues.push({ file, level: 'error', message: 'article 缺少 data-id' });
    else if (seenIds.has(id)) issues.push({ file, level: 'error', message: `重复的 data-id: ${id}` });
    else seenIds.add(id);

    if (a['data-name'] === undefined) issues.push({ file, level: 'error', message: 'article 缺少 data-name' });

    const tags: Record<string, string[]> = {};
    for (const g of tax.groups.filter((x) => x.scope === 'monster')) {
      const raw = a[`data-${g.attr}`];
      if (raw === undefined) {
        issues.push({ file, level: 'error', message: `article 缺少 data-${g.attr}（${g.label}）` });
        continue;
      }
      const vals = raw.split(/\s+/).filter(Boolean);
      if (!vals.length) issues.push({ file, level: 'error', message: `data-${g.attr} 为空` });
      for (const v of vals) {
        if (!g.values.some((x) => x.id === v)) {
          issues.push({ file, level: 'error', message: `data-${g.attr}="${v}" 不在 tags.yaml 的 ${g.id} 组内（可选：${g.values.map((x) => x.id).join(' ')}）` });
        }
      }
      tags[g.attr] = vals;
    }

    /* ---- 部件校验 ---- */
    const partGroups = tax.groups.filter((x) => x.scope === 'part');
    const partList = find(article, (n) => has(n, 'parts'));
    const parts = partList ? elKids(partList).filter((n) => has(n, 'part')) : elKids(article).filter((n) => has(n, 'part'));
    if (!parts.length) issues.push({ file, level: 'error', message: '没有任何 <li class="part">' });
    for (const [i, p] of parts.entries()) {
      const pa = A(p);
      if (!pa['data-part']) issues.push({ file, level: 'error', message: `第 ${i + 1} 个部件缺少 data-part` });
      if (!find(p, (n) => has(n, 'part__name'))) issues.push({ file, level: 'warn', message: `第 ${i + 1} 个部件缺少 .part__name` });
      for (const g of partGroups) {
        const attr = g.id === 'check' ? 'check' : g.attr;
        const raw = pa[`data-${attr}`];
        if (raw === undefined) continue;
        // data-save / data-hit 是复合值，不参与枚举校验
        if (g.id === 'check') {
          for (const v of raw.split(/\s+/).filter(Boolean)) {
            if (!g.values.some((x) => x.id === v)) {
              issues.push({ file, level: 'error', message: `data-check="${v}" 不在 tags.yaml 的 check 组内` });
            }
            (tags[attr] ??= []).push(v);
          }
          continue;
        }
        for (const v of raw.split(/\s+/).filter(Boolean)) {
          if (!g.values.some((x) => x.id === v)) {
            issues.push({ file, level: 'error', message: `部件 ${i + 1}: data-${attr}="${v}" 不在 ${g.id} 组内（可选：${g.values.map((x) => x.id).join(' ')}）` });
          }
          (tags[attr] ??= []).push(v);
        }
      }
      if (pa['data-hit'] && !/^(str|dex|con|int|wis|cha)$/.test(pa['data-hit'])) {
        issues.push({ file, level: 'error', message: `部件 ${i + 1}: data-hit="${pa['data-hit']}" 必须是六项属性之一` });
      }
      if (pa['data-save'] && !/^[a-z]{3}:\d+$/.test(pa['data-save'])) {
        issues.push({ file, level: 'error', message: `部件 ${i + 1}: data-save="${pa['data-save']}" 应形如 "wis:12"` });
      }
    }

    /* ---- 图片标准化 ---- */
    const html = rewriteImages(article, A(article)['data-name'] ?? id ?? file, issues, file, base);

    monsters.push({
      index: {
        id: id ?? file.replace(/\.html$/, ''),
        name: a['data-name'] ?? '',
        race: tags.race?.[0] ?? '',
        level: tags.level?.[0] ?? '',
        tags: Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, [...new Set(v)]])),
        parts: parts.length,
        order,
      },
      html,
    });
  });

  if (autoAlt) issues.push({ file: '(自动修复)', level: 'warn', message: `${autoAlt} 处 <img> 缺 alt，构建时已补全（建议回写源文件）` });

  return { monsters, issues };
}

/* ────────── <img> 标准化 ────────── */
/**
 * 为 CSS 自定义属性中的 url() 补上站点前缀。
 *
 * `--badge-matte` 写在 span 的 style 上，其 url() 相对样式表解析，
 * 子路径部署时会落到 /_assets/ 之下，故必须转为绝对路径。
 * 该替换对所有元素生效，不限于 img。
 */
function withBase(attrs: string, base: string): string {
  return attrs.replace(
    /--badge-matte:url\((?!\/)([^)]+)\)/g,
    (_m, url: string) => `--badge-matte:url(${base}${url})`,
  );
}

function rewriteImages(root: Element, name: string, issues: Issue[], file: string, base = '/'): string {
  const out: string[] = [];
  const emit = (n: Node): string => {
    if ((n as Element).tagName === 'img') {
      const e = n as Element;
      const a = { ...A(e) };
      const src = a.src ?? '';
      if (!src) {
        issues.push({ file, level: 'error', message: '<img> 缺少 src' });
        return '';
      }
      if (a.alt === undefined) {
        // 承载信息的图补名字，装饰图标补空串（构建期修复，源文件仍建议写全）
        a.alt = /characters\//.test(src) ? name : '';
        autoAlt++;
      }
      if (!/^https?:|^data:/.test(src)) {
        const diskPath = join(PUBLIC_DIR, src.replace(/^\//, ''));
        const size = webpSize(diskPath);
        if (!size) {
          issues.push({ file, level: 'error', message: `图片不存在或不是 WebP: ${src}` });
        } else {
          a.width ??= String(size.width);
          a.height ??= String(size.height);
        }
      }
      // img/common 下的小图标统一挂 .ico，否则会按原始像素尺寸撑爆版式
      if (!a.class && /(^|\/)img\/common\//.test(src)) a.class = 'ico';
      // 装饰图统一解码策略；头像类不懒加载（首屏可视）
      a.decoding ??= 'async';
      if (!has(e, 'badge__portrait') && !has(e, 'monster__portrait') && !/characters\//.test(src)) a.loading ??= 'lazy';
      const attrStr = Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
      return `<img ${withBase(attrStr, base)}>`;
    }
    if ((n as Element).tagName) {
      const e = n as Element;
      const tag = e.tagName;
      const attrs = (e.attrs ?? []).map((x) => `${x.name}="${x.value}"`).join(' ');
      const attrStr = withBase(attrs, base);
      const open = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
      const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
      if (VOID.has(tag)) return open;
      const kidsHtml = ((e.childNodes ?? []) as Node[]).map(emit).join('');
      return `${open}${kidsHtml}</${tag}>`;
    }
    return ((n as { value?: string }).value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  };
  out.push(emit(root));
  return out.join('');
}
