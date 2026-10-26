/**
 * 标签体系加载与校验。
 * content/tags.yaml 是唯一真源：筛选栏、卡片标签、构建期校验都从这里取。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

const TagValue = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  icon: z.string().optional(),
  color: z.string().optional(),
});

const TagGroup = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  attr: z.string().min(1),
  scope: z.enum(['monster', 'part']),
  values: z.array(TagValue).min(1),
});

const ChipSpec = z.object({
  key: z.string().min(1),
  from: z.string().min(1),
  prefix: z.string().optional(),
});

const TaxonomyFile = z.object({
  groups: z.array(TagGroup).min(1),
  chips: z.array(ChipSpec).default([]),
});

export type TagValueT = z.infer<typeof TagValue>;
export type TagGroupT = z.infer<typeof TagGroup>;
export type ChipSpecT = z.infer<typeof ChipSpec>;
export type Taxonomy = z.infer<typeof TaxonomyFile>;

/**
 * 构建产物会把服务端代码打包进 dist/.prerender，
 * 因此路径一律相对「执行构建时的工作目录」解析，不能用 import.meta.url。
 */
export const ROOT = process.cwd();
export const TAGS_PATH = join(ROOT, 'content', 'tags.yaml');

export function loadTaxonomy(path = TAGS_PATH): Taxonomy {
  const raw = YAML.parse(readFileSync(path, 'utf8'));
  const parsed = TaxonomyFile.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`content/tags.yaml 校验失败：\n${detail}`);
  }
  const tax = parsed.data;

  /* 结构一致性：id 唯一、chip 指向存在的组 */
  const seen = new Set<string>();
  for (const g of tax.groups) {
    if (seen.has(g.id)) throw new Error(`content/tags.yaml: 重复的 group id "${g.id}"`);
    seen.add(g.id);
    const vals = new Set<string>();
    for (const v of g.values) {
      if (vals.has(v.id)) throw new Error(`content/tags.yaml: ${g.id} 组重复的值 "${v.id}"`);
      vals.add(v.id);
    }
  }
  /* chips 的 from 可以指向标签组，也可以指向部件上的复合字段（hit / save） */
  const COMPOSITE = new Set(['hit', 'save']);
  for (const c of tax.chips) {
    if (!COMPOSITE.has(c.from) && !tax.groups.some((g) => g.id === c.from)) {
      throw new Error(`content/tags.yaml: chips 引用了不存在的分组 "${c.from}"（可用：${[...tax.groups.map((g) => g.id), ...COMPOSITE].join(' ')}）`);
    }
  }
  return tax;
}

/** 按 id 取组 */
export function group(tax: Taxonomy, id: string): TagGroupT {
  const g = tax.groups.find((x) => x.id === id);
  if (!g) throw new Error(`未知标签组: ${id}`);
  return g;
}

/** 取某组某个值的定义 */
export function value(tax: Taxonomy, groupId: string, valueId: string): TagValueT | undefined {
  return group(tax, groupId).values.find((v) => v.id === valueId);
}

/** 属性能力缩写 → 中文（力量/敏捷/…），供 chip 使用 */
export function abilityLabel(tax: Taxonomy, id: string): string {
  for (const gid of ['mult', 'bonus']) {
    const v = group(tax, gid).values.find((x) => x.id === id);
    if (v) return v.label;
  }
  return id;
}
