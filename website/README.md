# MCP 开发教程 · VitePress 站点

把仓库根目录的 11 篇 Markdown 教程构建成在线教程站点。使用 VitePress 1.x + Mermaid 11，支持全文搜索、深色模式、代码高亮与流程图渲染。

## 快速开始

```powershell
cd website
npm install          # 首次运行
npm run dev          # 开发模式，默认 http://localhost:5173
```

构建与预览生产版本：

```powershell
npm run build        # 先同步内容，再产出静态站点到 .vitepress/dist
npm run preview      # 预览构建结果，默认 http://localhost:4173
```

## 目录结构

```
website/
├── .vitepress/
│   ├── config.mts           # 站点、导航、侧边栏、搜索、Mermaid 配置
│   └── theme/               # 自定义主题与样式
├── scripts/sync-content.mjs # 把仓库根目录教程同步成站点内容
├── guide/                   # 由脚本生成，勿手改
├── public/
│   ├── logo.svg
│   └── lab/                 # 由脚本从 ../lab 复制，供在线下载配套代码
├── index.md                 # 首页（Hero + 特性卡片）
└── package.json
```

## 内容同步规则

`npm run dev` / `npm run build` 都会先执行 `npm run sync`：

- `README.md` → `guide/index.md`（教程总览）
- 各章节 → 英文 slug：`01-intro`、`02-first-server`、`03-jsonrpc` ……（映射见 `scripts/sync-content.mjs`）
- 章节之间的 `.md` 相对链接自动改写为站点路由
- `lab/` 源码复制到 `public/lab/`，文中「配套代码」链接可直接下载

因此**请始终修改仓库根目录的原始 Markdown**，不要直接改 `guide/`；改完重新执行 `npm run build` 即可。

## 部署到 Netlify

仓库根目录已提供 `netlify.toml`，在 Netlify 导入仓库后无需手动填写：

| 配置项 | 值 |
|---|---|
| Base directory | `website` |
| Build command | `npm run build` |
| Publish directory | `.vitepress/dist` |
| Node.js | 22（已由 `netlify.toml` 指定） |

构建时会自动同步根目录教程 Markdown、生成 `guide/` 并复制 `lab` 源码，无需把生成内容提交到仓库。

## 部署到 Vercel

`website/vercel.json` 已固定构建命令与输出目录，项目 Root Directory 设为 `website` 即可：

| 配置项 | 值 |
|---|---|
| Root Directory | `website` |
| Build Command | `npm run build` |
| Output Directory | `.vitepress/dist` |
| Node.js | 22 |

配置中的 `cleanUrls: true` 会让访问地址不带 `.html`。如果之前在 Vercel 项目设置里手动填过 Output Directory（例如 `dist`），请清空或改为 `.vitepress/dist`，然后重新部署。

## 发布为在线站点

构建产物是纯静态文件，`website/.vitepress/dist/` 整个目录可直接部署到任意静态托管。

- **部署在子路径**（如 `https://example.com/mcp-tutorial/`）时，构建前设置环境变量：

  ```powershell
  $env:BASE_URL='/mcp-tutorial/'; npm run build
  ```

- **Nginx 示例**：

  ```nginx
  server {
      listen 80;
      server_name mcp.example.com;
      root /var/www/mcp-tutorial;
      index index.html;
      location / {
          try_files $uri $uri.html $uri/ =404;
      }
  }
  ```

- **GitHub Pages / Gitee Pages**：把构建产物推到 `gh-pages` 分支（或 Gitee Pages 指定目录）即可；若使用项目页地址，记得按上面的方式设置 `BASE_URL`。
- **对象存储 / OSS**：直接上传 `dist` 内全部文件，入口为 `index.html`。

## 维护提示

- 教程新增章节时，在 `scripts/sync-content.mjs` 的 `chapters` 数组和 `.vitepress/config.mts` 的 `sidebar` 中各加一项。
- Mermaid 图表在浏览器端渲染；深色模式下已加浅色底衬，保证节点文字可读。
- 站内搜索为 VitePress 本地搜索，构建时生成索引，无需额外服务。
