// 把仓库根目录的 Markdown 教程同步为 VitePress 站点内容。
// 规则：章节文件名转成英文 slug，站内 .md 链接改写成站点路由，lab 代码复制到 public。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const siteRoot = path.resolve(here, '..')
const sourceRoot = path.resolve(siteRoot, '..')
const guideDir = path.join(siteRoot, 'guide')

const chapters = [
  { src: '01-认识MCP.md', slug: '01-intro', title: '01 认识 MCP：AI 世界的 USB-C 接口' },
  { src: '02-第一个MCPServer.md', slug: '02-first-server', title: '02 第一个 MCP Server' },
  { src: '03-协议内核JSONRPC与消息流.md', slug: '03-jsonrpc', title: '03 协议内核：JSON-RPC 与消息流' },
  { src: '04-传输层stdio与StreamableHTTP.md', slug: '04-transport', title: '04 传输层：stdio 与 Streamable HTTP' },
  { src: '05-服务器进阶三大原语深入.md', slug: '05-primitives', title: '05 服务器进阶：三大原语深入' },
  { src: '06-进阶交互Elicitation与MRTR.md', slug: '06-elicitation', title: '06 进阶交互：Elicitation、MRTR 与长任务' },
  { src: '07-客户端开发实战.md', slug: '07-client', title: '07 客户端开发实战' },
  { src: '08-安全专题.md', slug: '08-security', title: '08 安全专题' },
  { src: '09-生态发布与多语言.md', slug: '09-ecosystem', title: '09 生态、发布与多语言' },
  { src: '10-Linux部署MCP服务器.md', slug: '10-linux-deploy', title: '10 Linux 部署实战' },
  { src: '11-多用户隔离与无状态扩展.md', slug: '11-multiuser', title: '11 多用户隔离与无状态扩展' },
  { src: '12-分页取消与大结果多模态.md', slug: '12-pagination', title: '12 分页、取消与大结果' },
  { src: '13-测试与质量保障.md', slug: '13-testing', title: '13 测试与质量保障' },
  { src: '14-MCPApps与扩展生态.md', slug: '14-apps', title: '14 MCP Apps 与扩展生态' },
  { src: '15-生产级数据库集成.md', slug: '15-database', title: '15 生产级数据库集成' },
]

const chapterMap = new Map(chapters.map((c) => [c.src, `/guide/${c.slug}`]))

function rewriteLinks(markdown) {
  return markdown.replace(/\]\(([^)\s]+\.md)(#[^)]*)?\)/g, (match, target, hash = '') => {
    const clean = target.replace(/^\.\//, '')
    if (clean === 'README.md') return `](/guide/${hash})`
    const route = chapterMap.get(clean)
    if (route) return `](${route}${hash})`
    return match
  }).replace(/\]\(lab\//g, '](/lab/')
}

function withFrontmatter(markdown, title) {
  const fm = ['---', `title: ${JSON.stringify(title)}`, '---', '', ''].join('\n')
  return fm + markdown.replace(/^\uFEFF/, '')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

// 清理并重建 guide 目录（只清理本脚本生成的内容）
ensureDir(guideDir)
for (const name of fs.readdirSync(guideDir)) {
  fs.rmSync(path.join(guideDir, name), { force: true })
}

// 教程总览：README.md -> /guide/
const readme = fs.readFileSync(path.join(sourceRoot, 'README.md'), 'utf8')
fs.writeFileSync(
  path.join(guideDir, 'index.md'),
  withFrontmatter(rewriteLinks(readme), '教程总览与学习路线'),
)

// 各章节
for (const chapter of chapters) {
  const srcPath = path.join(sourceRoot, chapter.src)
  if (!fs.existsSync(srcPath)) {
    console.warn(`[warn] 缺少源文件：${chapter.src}`)
    continue
  }
  const markdown = fs.readFileSync(srcPath, 'utf8')
  fs.writeFileSync(
    path.join(guideDir, `${chapter.slug}.md`),
    withFrontmatter(rewriteLinks(markdown), chapter.title),
  )
}

// 配套代码：lab 源码复制到 public/lab，站内链接可用
const labSrc = path.join(sourceRoot, 'lab')
const labDst = path.join(siteRoot, 'public', 'lab')
if (fs.existsSync(labSrc)) {
  fs.rmSync(labDst, { recursive: true, force: true })
  ensureDir(labDst)
  for (const file of ['package.json', 'tsconfig.json']) {
    const from = path.join(labSrc, file)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(labDst, file))
  }
  const srcDir = path.join(labSrc, 'src')
  if (fs.existsSync(srcDir)) {
    ensureDir(path.join(labDst, 'src'))
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(labDst, 'src', file))
    }
  }
}

console.log(`[sync] 已生成 ${chapters.length} 篇章节 + 教程总览，代码已复制到 public/lab`)
