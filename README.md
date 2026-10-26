# DWparts

**English** | [简体中文](README.zh-CN.md)

Static reference site for the mobile game *Dungeon Within* (《地牢深处》, Game Coaster).
Covers monsters, attributes, actions and damage types, with tag-based filtering.

Output is a plain directory of files. No server-side runtime is involved.

## Requirements

Node.js 24.22.1, pnpm 11.

## Commands

| Command | Action |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the development server, with per-monster preview |
| `pnpm check` | Validate content without producing output |
| `pnpm build` | Validate, then build into `dist/` |
| `pnpm preview` | Serve the built output |
| `pnpm masks` | Generate badge masks from the PNG originals |
| `pnpm images` | Generate WebP from the PNG originals |

## Repository layout

```
content/                 Hand-written content, the only directory edited by hand
  tags.yaml              Single source of truth for the tag taxonomy
  monsters/*.html        One HTML document per monster
src/
  pages/index.astro      Renders the single page holding every monster card
  components/            Header, filter panel
  layouts/Base.astro
  lib/                   Loading, validation, image normalisation
  client/filter.ts       Client-side script
  styles/                tokens, base, layout, card
scripts/                 Validators, tests, mask and image generation
public/img/              WebP assets and badge masks, served as-is
assets-src/img/raw/      PNG originals, used only to generate WebP and masks
dist/                    Build output
```

The full editing specification for `content/` is in [content/README.md](content/README.md).

## Usage

The 筛选 button in the header opens the tag panel. The panel covers page content and
opens at any scroll position; Escape or an outside click closes it. The first entry of
each category, 全部, clears that category.

Values within one category combine with OR, categories combine with AND. Filter state is
written to the address bar, so links are shareable and browser navigation restores it.

The header search field matches monster names, part names and body text. `/` focuses it,
Escape clears it.

The 只看命中部件 button switches filter granularity. By default a matching monster is
shown whole; after switching, only the matching parts remain inside it. This mode
requires at least one part-level category to be active, since race and level apply to
the entire monster and produce no part-level subset.

## Contributing a monster

Adding a monster requires one HTML file in `content/monsters/` and no code changes.

### 1. Create the file

Name the file after the monster identifier, matching the portrait filename, for example
`BST101.html`. The content is one `<article class="monster">` element. A full HTML
document shell may wrap it; the shell is ignored during the build.

### 2. Fill in monster attributes

```html
<article class="monster"
         id="BST101" data-id="BST101" data-name="拉塔托斯克"
         data-race="beast" data-level="1" data-dom="1"
         data-str="5" data-dex="12" data-con="6" data-int="7" data-wis="10" data-cha="8"
         data-hp="10" data-ac="8">
```

`data-race` takes `beast`, `elf` or `undead`; `data-level` takes `1` to `9`.
The remaining attributes are described in [content/README.md](content/README.md).

### 3. Write the part cards

Each monster holds several `<li class="part">` elements, one for the basic attack and one
for each of M, S1 and S2:

```html
<li class="part" data-part="m" data-act="main" data-dmg="phy4" data-attack="melee">
```

`data-part` takes `basic`, `m`, `s1` or `s2`. Fill the remaining tag attributes according
to the in-game effect. Valid values are defined in `content/tags.yaml`.

### 4. Add images

Place portraits under `assets-src/img/raw/characters/` and icons under
`assets-src/img/raw/common/`, both as PNG. Run `pnpm images` to generate the WebP files
under `public/img/`. Reference paths are case-sensitive and must match the filenames.

### 5. Validate and preview

```bash
pnpm check          # tag values, class names, image references, size budget
pnpm dev            # open /monsters/BST101 for a single-card preview
```

Validation reports the filename and the specific problem. Frequent causes are a tag value
outside the enumeration, a case mismatch in an image path, and a `data-save` value not in
the `attribute:DC` form.

### 6. Extend the tag taxonomy

A new tag value must be added to `content/tags.yaml` before a card can use it. The same
file determines the categories and values shown in the filter panel, so no other file
requires edits.

## Verification

| Command | Scope |
| --- | --- |
| `pnpm check` | Content, class names, asset references, size budget |
| `pnpm build` | Production build |
| `pnpm test` | Filter logic under jsdom, 22 assertions |
| `pnpm visual` | Layout, image loading and contrast at four viewports |
| `pnpm layout` | Part grid, portrait and badge masking at seven viewports |
| `pnpm vertical` | Text alignment and heading-to-body spacing |
| `pnpm badge` | Badge surround matches the card background, pixel by pixel |
| `pnpm corners` | No rounded filled blocks outside the monster card |
| `pnpm contrast` | WCAG ratio for every text and background pairing |
| `pnpm palette` | Rendered colours match the design baseline |
| `pnpm panel` | Overlay coverage, open position, close direction |
| `pnpm blur` | Backdrop filter remains active throughout the panel animation |
| `pnpm mask` | Badge masking uses one mask layer and leaves no frame edge |

The browser-based checks require Chromium. `pnpm shot` writes screenshots to
`/tmp/shots`.

## Licensing

Source code (HTML, CSS, TypeScript) is MIT licensed. Game assets under `public/img/` and
`assets-src/img/raw/` are copyright Game Coaster and are excluded from the MIT grant.
Per-category terms are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
