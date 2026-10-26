# DWparts

[English](README.md) | **简体中文**

手游《地牢深处》(Dungeon Within, Game Coaster) 的非官方资料站，收录魔物、属性、
动作与伤害类型，支持按标签组合筛选。

产物为普通静态文件目录，不含服务端运行时。

## 环境要求

Node.js 24.22.1，pnpm 11。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 启动开发服务器，含单卡预览 |
| `pnpm check` | 校验内容，不产出文件 |
| `pnpm build` | 先校验，再构建至 `dist/` |
| `pnpm preview` | 预览已构建的产物 |
| `pnpm masks` | 由 PNG 原图生成徽章遮罩 |
| `pnpm images` | 由 PNG 原图生成 WebP |

## 目录结构

```
content/                 手写内容，全项目唯一需要手工编辑的目录
  tags.yaml              标签体系的唯一真源
  monsters/*.html        每个魔物一份 HTML 文档
src/
  pages/index.astro      渲染承载全部魔物卡的单页
  components/            顶栏、筛选面板
  layouts/Base.astro
  lib/                   加载、校验、图片标准化
  client/filter.ts       客户端脚本
  styles/                tokens、base、layout、card
scripts/                 校验器、测试、遮罩与图片生成
public/img/              WebP 素材与徽章遮罩，原样发布
assets-src/img/raw/      PNG 原图，仅用于生成 WebP 与遮罩
dist/                    构建产物
```

`content/` 的完整编辑规范见 [content/README.md](content/README.md)。

## 使用

顶栏右侧的「筛选」按钮展开标签面板。面板覆盖页面内容，在任意滚动位置均可展开，
按 Esc 键或点击面板外部收起。面板内每个类别首项为「全部」，选中即清除该组条件。

同一类别内多值取并集，类别之间取交集。筛选条件写入地址栏，链接可直接分享，
浏览器的前进与后退保持状态。

顶栏搜索框匹配魔物名、部件名与正文文字，快捷键 `/` 聚焦，Esc 清空。

「只看命中部件」按钮切换筛选粒度。默认显示命中的整个魔物；切换后，命中卡内
仅保留满足条件的部件。该模式需要至少一个部件级标签组处于选中状态，
种族与等级作用于整个魔物，不产生部件级差异。

## 贡献魔物

新增魔物只需向 `content/monsters/` 放入一个 HTML 文件，无需修改任何代码。

### 1. 创建文件

文件名为魔物标识，与立绘文件名一致，例如 `BST101.html`。文件内容为一个
`<article class="monster">` 元素，可附带完整的 HTML 文档外壳，外壳不参与构建。

### 2. 填写魔物属性

```html
<article class="monster"
         id="BST101" data-id="BST101" data-name="拉塔托斯克"
         data-race="beast" data-level="1" data-dom="1"
         data-str="5" data-dex="12" data-con="6" data-int="7" data-wis="10" data-cha="8"
         data-hp="10" data-ac="8">
```

`data-race` 取 `beast`、`elf`、`undead`，`data-level` 取 `1` 至 `9`。
其余属性含义见 [content/README.md](content/README.md)。

### 3. 编写部件卡

每个魔物包含若干 `<li class="part">`，分别对应基础攻击与 M、S1、S2 部件：

```html
<li class="part" data-part="m" data-act="main" data-dmg="phy4" data-attack="melee">
```

`data-part` 取 `basic`、`m`、`s1`、`s2`。其余标签属性按实际效果填写，
取值以 `content/tags.yaml` 为准。

### 4. 放置图片

立绘置于 `assets-src/img/raw/characters/`，图标置于 `assets-src/img/raw/common/`，
均为 PNG 格式。执行 `pnpm images` 生成 `public/img/` 下的 WebP。
引用路径区分大小写，须与磁盘文件名一致。

### 5. 校验与预览

```bash
pnpm check          # 检查标签取值、类名、图片引用与体积
pnpm dev            # 浏览器打开 /monsters/BST101 单卡预览
```

校验报错会指出文件名与具体问题。常见原因为标签取值不在枚举内、
图片路径大小写不符、`data-save` 未采用 `属性:DC` 形式。

### 6. 修改标签体系

新增标签值须先写入 `content/tags.yaml`，卡片中方可使用。该文件同时决定
筛选面板的类别与取值，修改后无需改动其他文件。

## 检验

| 命令 | 范围 |
| --- | --- |
| `pnpm check` | 内容、类名、资源引用、体积预算 |
| `pnpm build` | 生产构建 |
| `pnpm test` | jsdom 下的筛选逻辑，22 项断言 |
| `pnpm visual` | 四种视口的布局、图片加载与对比度 |
| `pnpm layout` | 七种视口的部件网格、立绘与徽章遮罩 |
| `pnpm vertical` | 文字对齐与标题至正文的间距 |
| `pnpm badge` | 逐像素核对徽章外围与卡片底色一致 |
| `pnpm corners` | 魔物卡之外不存在圆角填充块 |
| `pnpm contrast` | 全部文字与背景组合的 WCAG 比值 |
| `pnpm palette` | 渲染配色与设计基准一致 |
| `pnpm panel` | 浮层的覆盖性、展开位置、收起方向 |
| `pnpm blur` | 面板动画全程背景滤镜是否持续生效 |
| `pnpm mask` | 徽章裁切为单层遮罩且边框无残留 |

依赖浏览器的检查需要 Chromium。`pnpm shot` 将截图写入 `/tmp/shots`。

## 许可

源代码（HTML、CSS、TypeScript）采用 MIT 许可。
`public/img/` 与 `assets-src/img/raw/` 下的游戏素材版权归 Game Coaster，
不在 MIT 授权范围内。逐项条款见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
