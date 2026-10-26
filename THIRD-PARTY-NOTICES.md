# Third-Party Notices

This repository contains original work, game assets and third-party code under
different terms. The MIT license in [LICENSE](LICENSE) covers only the original
code listed in the first section.

## Original work, MIT

| Path | Contents |
| --- | --- |
| `src/**` | Astro components, layout, TypeScript modules, stylesheets |
| `content/**` | Monster HTML documents, tag taxonomy |
| `scripts/**`, `tools/**` | Validation, testing and screenshot tooling |
| `.github/**` | Continuous integration configuration |

## Game assets, copyright Game Coaster

| Path | Contents | Files |
| --- | --- | --- |
| `public/img/common/` | Icons, UI elements, badge masks | 51 |
| `public/img/characters/` | Character portraits | 78 |
| `assets-src/img/raw/common/` | PNG originals for the above | 47 |
| `assets-src/img/raw/characters/` | PNG originals for the above | 78 |

Copyright in these files belongs to Game Coaster. They are included because this
site documents the game, and they are not covered by this repository's MIT license.
Four files under `public/img/common/mask-*.png` are derived from
`assets-src/img/raw/common/*_back.png` by inverting the alpha channel; the
derivation is mechanical and carries no independent authorship. Redistributing or
reusing this project for other purposes requires removing or independently
licensing these assets.

## Build dependencies

These are installed at development time only and are not redistributed in `dist/`.

| Package | License | Role |
| --- | --- | --- |
| [astro](https://github.com/withastro/astro) | MIT | Static site generation |
| [parse5](https://github.com/inikulin/parse5) | MIT | HTML parsing during build |
| [yaml](https://github.com/eemeli/yaml) | ISC | Tag taxonomy parsing |
| [zod](https://github.com/colinhacks/zod) | MIT | Schema validation |
| [lightningcss](https://github.com/parcel-bundler/lightningcss) | MPL-2.0 | CSS transformation and minification |
| [jsdom](https://github.com/jsdom/jsdom) | MIT | Filter logic tests |
| [pngjs](https://github.com/pngjs/pngjs) | MIT | Pixel assertions in tests |
| [puppeteer-core](https://github.com/puppeteer/puppeteer) | Apache-2.0 | Browser-driven layout tests |

The client bundle shipped in `dist/_assets/` is original code. No third-party
JavaScript is delivered to browsers.
