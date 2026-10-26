import { defineConfig } from 'astro/config';

/**
 * 纯静态输出：dist/ 里只有 HTML / CSS / JS / 图片，无服务端运行时。
 * - build.inlineStylesheets: 'auto' 让小体量样式表内联，避免多一次请求
 * - vite.css.transformer: lightningcss —— 自动前缀、nesting 降级、体积压缩
 */
export default defineConfig({
  /* 部署于 GitHub Pages 项目站点，路径前缀取仓库名。
     改用自定义域名时将 site 设为该域名，base 设为 '/'。 */
  site: 'https://fancystarry.github.io',
  base: '/DWparts',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
  vite: {
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: { chrome: 100 << 16, firefox: 100 << 16, safari: 15 << 16 },
        drafts: { customMedia: true },
      },
    },
    build: {
      cssMinify: 'lightningcss',
      target: 'es2022',
    },
  },
});
