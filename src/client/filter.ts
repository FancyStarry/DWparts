/**
 * 筛选岛 —— 全站唯一的客户端脚本。
 *
 * 设计要点：
 *   1. 状态全部放在 URL query，可分享、可后退；
 *   2. 判定基于 data-* 属性词，不做文字匹配；
 *   3. 同组多选取 OR，跨组取 AND；
 *   4. 两级模式：整卡（魔物任一部件命中即显示整行） / 部件（只显示命中部件）。
 */
type Mode = 'card' | 'part';

interface GroupDef {
  id: string;
  attr: string;
  scope: 'monster' | 'part';
  values: { id: string; label: string }[];
}

interface Boot {
  groups: GroupDef[];
  total: number;
}

const REASON_NO_PART_FILTER = '当前只选了魔物级标签（种族/等级），所有部件都同等命中，无法细分为部件视图。先选动作、伤害类型等部件级标签。';

const root = document.documentElement;
const state = {
  /** groupId → Set<valueId> */
  picked: new Map<string, Set<string>>(),
  mode: 'card' as Mode,
  query: '',
};

/* ────────── URL <-> 状态 ────────── */
const PARAM_MODE = 'mode';
const PARAM_Q = 'q';

function readUrl(groups: GroupDef[]) {
  const params = new URLSearchParams(location.search);
  state.picked.clear();
  for (const g of groups) {
    const raw = params.get(g.id);
    if (!raw) continue;
    const vals = raw.split(',').map((v) => v.trim()).filter(Boolean);
    const valid = vals.filter((v) => g.values.some((x) => x.id === v));
    if (valid.length) state.picked.set(g.id, new Set(valid));
  }
  state.mode = params.get(PARAM_MODE) === 'part' ? 'part' : 'card';
  state.query = (params.get(PARAM_Q) ?? '').trim();
}

function writeUrl(groups: GroupDef[], { replace = false } = {}) {
  const params = new URLSearchParams();
  for (const g of groups) {
    const vals = state.picked.get(g.id);
    if (vals?.size) params.set(g.id, [...vals].join(','));
  }
  if (state.mode === 'part') params.set(PARAM_MODE, 'part');
  if (state.query) params.set(PARAM_Q, state.query);
  const qs = params.toString();
  const url = qs ? `${location.pathname}?${qs}${location.hash}` : `${location.pathname}${location.hash}`;
  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

/* ────────── 匹配 ────────── */
const words = (el: Element, attr: string): string[] =>
  (el.getAttribute(`data-${attr}`) ?? '').split(/\s+/).filter(Boolean);

/** 某部件是否满足全部已选条件 */
function partMatches(part: Element, groups: GroupDef[], monsterEl: Element): boolean {
  for (const g of groups) {
    const picked = state.picked.get(g.id);
    if (!picked?.size) continue;
    const src = g.scope === 'monster' ? monsterEl : part;
    const have = words(src, g.attr);
    if (![...picked].some((v) => have.includes(v))) return false;
  }
  return true;
}

/** 关键词匹配：魔物名 + 部件名 + 加成 + 正文 + 效果，文本在首次搜索时惰性索引 */
const searchIndex = new WeakMap<Element, string>();

function haystack(card: Element): string {
  let hay = searchIndex.get(card);
  if (hay === undefined) {
    // textContent 已包含所有可见文字；顺带收进标题属性（如图标 alt/title 中的属性名）
    const extra = Array.from(card.querySelectorAll('[title],[alt]'))
      .map((n) => `${n.getAttribute('title') ?? ''} ${n.getAttribute('alt') ?? ''}`)
      .join(' ');
    hay = `${card.textContent ?? ''} ${extra}`.toLowerCase().replace(/\s+/g, ' ');
    searchIndex.set(card, hay);
  }
  return hay;
}

function textMatches(card: Element, q: string): boolean {
  if (!q) return true;
  const hay = haystack(card);
  return q.split(/\s+/).every((t) => hay.includes(t));
}

/* ────────── 渲染 ────────── */
const els = {
  monsters: () => Array.from(document.querySelectorAll<HTMLElement>('.monster')),
  chip: (groupId: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(`.chip[data-group="${groupId}"]`)),
  empty: () => document.querySelector<HTMLElement>('[data-empty-state]'),
  count: () => document.querySelector<HTMLElement>('[data-result-count]'),
  search: () => document.querySelector<HTMLInputElement>('[data-search]'),
  searchClear: () => document.querySelector<HTMLElement>('[data-search-clear]'),
  modeBtn: () => document.querySelector<HTMLButtonElement>('[data-mode-toggle]'),
  filters: () => document.querySelector<HTMLElement>('[data-filters]'),
};

function apply(groups: GroupDef[]) {
  const q = state.query.toLowerCase();
  root.dataset.filterMode = state.mode;
  let visible = 0;
  let visibleParts = 0;
  let totalParts = 0;

  for (const card of els.monsters()) {
    const parts = Array.from(card.querySelectorAll<HTMLElement>('.part'));
    totalParts += parts.length;

    // 关键词优先级最高：不匹配则整卡隐藏
    if (!textMatches(card, q)) {
      card.hidden = true;
      continue;
    }

    const hitParts = parts.filter((p) => partMatches(p, groups, card));
    const anyFilter = groups.some((g) => state.picked.get(g.id)?.size);

    if (!anyFilter) {
      // 无筛选：全部显示，模式不生效
      card.hidden = false;
      card.dataset.hit = '';
      for (const p of parts) p.hidden = false;
      visible++;
      visibleParts += parts.length;
      continue;
    }

    if (state.mode === 'card') {
      const hit = hitParts.length > 0;
      card.hidden = !hit;
      card.dataset.hit = hit ? 'full' : '';
      for (const p of parts) p.hidden = false;   // 整卡模式下不隐藏部件
      if (hit) { visible++; visibleParts += parts.length; }
    } else {
      const hit = hitParts.length > 0;
      card.hidden = !hit;
      card.dataset.hit = hit ? 'part' : '';
      for (const p of parts) p.hidden = !hitParts.includes(p);
      if (hit) { visible++; visibleParts += hitParts.length; }
    }
  }

  if (els.count()) {
    els.count()!.textContent = state.mode === 'part'
      ? `${visible} 魔物 · ${visibleParts} 部件`
      : `${visible} / ${els.monsters().length} 魔物`;
  }
  if (els.empty()) els.empty()!.hidden = visible > 0;

  // 空选值的 chip 降低存在感（说明"当前其他条件下无此项"）
  for (const g of groups) {
    const chips = els.chip(g.id);
    for (const btn of chips) {
      const v = btn.dataset.value!;
      const alive = els.monsters().some((card) => {
        if (card.hidden) return false;
        const srcs = g.scope === 'monster' ? [card] : Array.from(card.querySelectorAll('.part'));
        return srcs.some((s) => words(s, g.attr).includes(v));
      });
      if (alive) delete btn.dataset.empty;
      else btn.dataset.empty = '';
    }
  }
}

function syncChips(groups: GroupDef[]) {
  for (const g of groups) {
    const picked = state.picked.get(g.id);
    for (const btn of els.chip(g.id)) {
      const v = btn.dataset.value ?? '';
      const on = v === '' ? !picked?.size : Boolean(picked?.has(v));
      btn.setAttribute('aria-pressed', String(on));
    }
  }
  const btn = els.modeBtn();
  if (btn) {
    // 只有"部件级"标签能切出差异；只选种族/等级时该模式无意义，禁用而非假装有效
    const partLevel = groups.some((g) => g.scope === 'part' && state.picked.get(g.id)?.size);
    const usable = partLevel;
    btn.disabled = !usable;
    btn.dataset.disabled = String(!usable);
    if (!usable && state.mode === 'part') state.mode = 'card';
    btn.setAttribute('aria-pressed', String(state.mode === 'part'));
    btn.title = !usable
      ? REASON_NO_PART_FILTER
      : state.mode === 'part'
        ? '当前：只显示命中的部件（点击切回整卡）'
        : '当前：命中即显示整个魔物（点击切换为只看部件）';
  }
  const s = els.search();
  if (s && s.value !== state.query) s.value = state.query;
  els.searchClear()?.toggleAttribute('data-visible', Boolean(state.query));
}

function update(groups: GroupDef[], opts?: { url?: boolean; replace?: boolean }) {
  syncChips(groups);
  apply(groups);
  if (opts?.url !== false) writeUrl(groups, { replace: opts?.replace });
}

/* ────────── 事件 ────────── */
function init() {
  const data = JSON.parse(document.getElementById('filter-boot')!.textContent!) as Boot;
  const { groups } = data;
  readUrl(groups);

  // chip 切换
  for (const g of groups) {
    for (const btn of els.chip(g.id)) {
      btn.addEventListener('click', () => {
        const v = btn.dataset.value ?? '';
        // 空值 = 「全部」：清空该组的选择
        if (v === '') {
          state.picked.delete(g.id);
          update(groups);
          return;
        }
        let set = state.picked.get(g.id);
        if (!set) { set = new Set(); state.picked.set(g.id, set); }
        if (set.has(v)) set.delete(v); else set.add(v);
        if (!set.size) state.picked.delete(g.id);
        update(groups);
      });
    }
  }

  // 模式切换
  els.modeBtn()?.addEventListener('click', (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (btn.disabled) return;
    state.mode = state.mode === 'card' ? 'part' : 'card';
    update(groups);
  });

  // 搜索（防抖）
  const search = els.search();
  let timer = 0;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.query = search.value.trim();
      update(groups, { replace: true });
    }, 120);
  });
  search?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { search.value = ''; state.query = ''; update(groups); }
  });
  els.searchClear()?.addEventListener('click', () => {
    if (search) search.value = '';
    state.query = '';
    search?.focus();
    update(groups);
  });

  /* 筛选面板：悬浮下拉，随时可开，不推挤内容。
     收起动画结束后才 hidden，保证过渡可见。 */
  const panel = els.filters();
  const toggle = document.querySelector<HTMLButtonElement>('[data-filters-toggle]');
  const isOpen = () => Boolean(panel?.hasAttribute('data-open'));
  let closeTimer = 0;

  const setPanel = (open: boolean) => {
    if (!panel) return;
    window.clearTimeout(closeTimer);
    toggle?.setAttribute('aria-expanded', String(open));
    if (open) {
      panel.hidden = false;
      // 强制一次回流，避免 hidden 取消后过渡被合并跳过
      void panel.offsetHeight;
      panel.setAttribute('data-open', '');
    } else {
      panel.removeAttribute('data-open');
      closeTimer = window.setTimeout(() => { if (!isOpen()) panel.hidden = true; }, 400);
    }
  };

  toggle?.addEventListener('click', () => setPanel(!isOpen()));

  // Esc 收起；点击面板与顶栏之外的区域也收起
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { setPanel(false); toggle?.focus(); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen()) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (panel?.contains(t) || toggle?.contains(t)) return;
    setPanel(false);
  });

  // 实测顶栏高度 → CSS 变量（sticky 偏移与锚点滚动都依赖它）
  const measure = () => {
    const bar = document.querySelector<HTMLElement>('.site-header');
    if (!bar) return;
    const h = Math.round(bar.getBoundingClientRect().height);
    root.style.setProperty('--header-h', `${h}px`);
    root.style.setProperty('--sticky-top', `${h}px`);
  };
  measure();
  const bar = document.querySelector('.site-header');
  if (bar && 'ResizeObserver' in window) new ResizeObserver(measure).observe(bar);
  window.addEventListener('resize', measure, { passive: true });

  // 浏览器前进/后退
  window.addEventListener('popstate', () => {
    readUrl(groups);
    update(groups, { url: false });
  });

  // 回到顶部
  const top = document.querySelector<HTMLElement>('[data-to-top]');
  if (top) {
    const onScroll = () => top.toggleAttribute('data-visible', window.scrollY > 900);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // 键盘：/ 聚焦搜索，Esc 清空
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== search && !(e.target as HTMLElement)?.closest('input,textarea')) {
      e.preventDefault();
      search?.focus();
    }
  });

  // 首次渲染：若 URL 已有筛选，不写历史
  update(groups, { url: false });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
