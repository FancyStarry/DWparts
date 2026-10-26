# content/

手写内容目录。项目其余部分为构建器或构建产物，日常编辑只涉及本目录。

```
content/
├─ tags.yaml           标签体系，全部合法取值的唯一来源
└─ monsters/           每个魔物一份 HTML 文档
```

## 文件约定

`content/monsters/` 下的每个 `.html` 文件既是完整的 HTML 文档，也是构建输入。
构建仅提取 `<article class="monster">` 元素，文档其余部分（`<!DOCTYPE>`、
`<head>`、`<body>` 外层）不参与输出。

因此以下两种写法均可：

```html
<!-- 完整文档：可脱离构建环境单独打开 -->
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>预览</title></head>
<body>
  <article class="monster" …>…</article>
</body>
</html>
```

```html
<!-- 片段：仅保留 article，构建结果相同 -->
<article class="monster" …>…</article>
```

开发服务器提供单卡预览路由 `/monsters/<ID>`，样式与构建产物一致，
无需手工编写 `<head>`。

### 采用 HTML 而非 YAML 或 JSON 的理由

卡片内容包含行内强调、行内图标与嵌套说明，例如
`<span class="blue">劣势</span>`、`<img class="ico" src="img/common/phy4.webp" alt="">`。
以结构化数据表示此类内容有两种结果：将 HTML 片段存为字符串字段，
或引入自定义标记语法。前者失去结构校验，后者增加学习成本且缺乏编辑器支持。
HTML 不需要额外语法，修改文案、调整强调、更换图标均直接编辑对应元素。

## article 元素属性

`scope: monster` 的标签组写于 `article` 元素：

```html
<article class="monster"
         id="BST101" data-id="BST101" data-name="拉塔托斯克"
         data-race="beast" data-level="1" data-dom="1"
         data-str="5" data-dex="12" data-con="6" data-int="7" data-wis="10" data-cha="8"
         data-hp="10" data-ac="8">
```

| 属性 | 必需 | 取值 |
| --- | --- | --- |
| `id`、`data-id` | 是 | 全局唯一，采用立绘文件名，如 `BST101` |
| `data-name` | 是 | 显示名称 |
| `data-race` | 是 | `beast`、`elf`、`undead` |
| `data-level` | 是 | `1` 至 `9` |
| `data-dom` | 否 | 支配力 |
| `data-str` 至 `data-cha` | 是 | 六项属性值，整数 |
| `data-hp`、`data-ac` | 是 | 最大生命值、护甲等级 |

## li.part 元素属性

`scope: part` 的标签组写于部件元素。多值以单个空格分隔。

```html
<li class="part" data-part="m" data-act="main"
    data-bonus="dc" data-dmg="phy4" data-mult="dex" data-dcbonus="cha"
    data-attack="ranged" data-check="hit save" data-hit="dex" data-save="wis:12">
```

| 属性 | 取值 |
| --- | --- |
| `data-part` | `basic`、`m`、`s1`、`s2` |
| `data-act` | `main`、`react`、`passive` |
| `data-bonus` | `str` `dex` `con` `int` `wis` `cha` `mhp` `ac` `ini` `hit` `dc`，可多值 |
| `data-dmg` | `phy4` `ele1` `ele2` `ele3` `ele7` `mag1` `mag2` `mag3` `mag4` `heal` `shield`，可多值 |
| `data-mult` | 六项属性缩写，伤害加值 |
| `data-dcbonus` | 六项属性缩写，豁免 DC 加值 |
| `data-attack` | `melee`、`ranged`、`spell`、`aoe`，可多值 |
| `data-check` | `hit`、`save`，可多值 |
| `data-hit` | 六项属性缩写之一，命中检定所用属性 |
| `data-save` | `<属性缩写>:<DC>`，例如 `wis:12` |

伤害类型取值为 `phy4`（物理）、`ele1` 至 `ele3`、`ele7`（自然）等游戏现存分类。
挥砍、穿刺、钝击在游戏内归入物理，雷鸣、强酸、毒素归入自然，
枚举中仅保留归并后的类别。

全部合法取值定义于 `content/tags.yaml`。取值越界时 `pnpm check` 报出
所属分组与可选取值列表。

## 卡片结构

```html
<li class="part" data-part="m" data-act="main" data-dmg="phy4" data-attack="melee">
  <div class="part__head">
    <span class="badge">
      <img src="img/common/m.webp" class="badge__frame" alt="">
      <span class="badge__portrait" style="--badge-matte:url(/img/common/mask-m.png)"><img src="img/characters/BST101.webp" alt=""></span>
      <img src="img/common/mt.webp" class="badge__label" alt="">
    </span>
    <h3 class="part__name">嘲讽橡子</h3>
    <p class="part__bonus"><span>法术豁免难度+1</span></p>
  </div>
  <div class="part__body">
    <div class="dmg">
      <span class="dmg__die"><img src="img/common/dice.webp" alt=""></span>
      <span class="dmg__lines">
        <span class="dmg__line phy4">1d12 <img class="ico" src="img/common/phy4.webp" alt="">物理伤害<img class="ico" src="img/common/DEX.webp" alt="敏捷" title="敏捷"></span>
      </span>
    </div>
    <p class="part__desc">使目标陷入<span class="pink">嘲讽</span>状态。</p>
    <div class="effects">
      <p class="effect"><span class="effect__name">嘲讽</span>：选择攻击目标时，会被强制指定为嘲讽施放者。</p>
    </div>
  </div>
</li>
```

各段可省略。缺少 `.part__body` 时不渲染正文区；缺少 `.dmg`、`.effects`、
`.part__bonus` 时对应区块不出现。

### 可选区块

| 元素 | 作用 |
| --- | --- |
| `.part__bonus` | 标题下方加成摘要，每个 `<span>` 为一条 |
| `.dmg` | 伤害骰与伤害类型。`.dmg__line` 上附加伤害类型类名以获得配色 |
| `.part__desc` | 描述正文，可使用行内强调类 |
| `.effects` | 效果说明列表，每条为一个 `.effect` |

## 行内强调类

| 类名 | 用途 | 色值 |
| --- | --- | --- |
| `.pink` | 状态名、增益、减益 | `#ffbbff` |
| `.blue` | 规则术语 | `#55aaff` |
| `.lb` | 关键词高亮 | `#00ddff` |
| `.orange` | 警示 | `#ffcc00` |
| `.green` | 良性效果 | `#63a440` |
| `.red` | 负面效果 | `#ff5555` |
| `.lgreen` | 强化数值 | `#55ff55` |
| `.gold` | 数值、支配力 | `gold` |
| `.phy4` `.ele1` `.mag2` `.heal` 等 | 伤害类型配色 | 见 `src/styles/tokens.css` |
| `.ico` | 行内小图标，尺寸随字号 |  |

配色变量集中于 `src/styles/tokens.css`，修改该文件即改变全站对应颜色。

## 技能徽章

徽章由三层组成：`badge__frame` 为目标形状边框，`badge__portrait` 为立绘，
`badge__label` 为右下角部件标识（B、M、S1、S2）。

立绘须裁切为边框内孔的形状，四种部件的内孔形状互不相同：

| 部件 | 内孔形状 |
| --- | --- |
| `basic` | 正圆 |
| `m` | 菱形 |
| `s1` | 左侧斜带 |
| `s2` | 右侧斜带 |

因此固定形状的 `clip-path` 不适用。实现方式为使用预先取反的遮罩图：

```html
<span class="badge__portrait" style="--badge-matte:url(/img/common/mask-s1.png)">
```

遮罩图由 `pnpm masks` 生成。该脚本读取
`assets-src/img/raw/common/{b,m,s1,s2}_back.png`，将其 alpha 通道取反后
输出 `public/img/common/mask-{basic,m,s1,s2}.png`：内孔范围内不透明，
内孔范围外透明。CSS 仅需单层 `mask-image`。

取反在构建期完成，生成的遮罩图为单层，CSS 仅需一个 `mask-image`。
替换素材后须重新执行 `pnpm masks`，否则立绘裁切形状与新素材不符。

遮罩路径写于 CSS 自定义属性，`url()` 相对样式表解析。构建过程会将其
补全为站点绝对路径，源文件中无需添加前缀。

## 布局约束

卡片高度由布局层统一处理。宽屏一行四张时，同行高度对齐至最高者，
内容自顶部起始排列，多余空间留在卡片底部。单列布局下各卡高度随内容变化。
无需为对齐插入空行或占位元素。

## 图片

- 仅引用 `public/img/common/` 与 `public/img/characters/`。
- 原图置于 `assets-src/img/raw/`，修改后执行 `pnpm images` 重新生成 WebP。
- `alt` 属性必须存在。装饰性图片写 `alt=""`，承载信息的图片写内容描述。
  构建过程会为缺失的 `alt` 补默认值，但源文件应显式声明。
- 文件名区分大小写。GitHub Pages 使用区分大小写的文件系统，
  引用路径须与磁盘文件名完全一致，否则构建校验失败。
