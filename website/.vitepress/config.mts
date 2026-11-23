import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    lang: 'zh-CN',
    title: 'MCP 开发教程',
    description:
      'Model Context Protocol 开发实战教程：以 2026-07-28 最新协议为主线，从零基础到深入理解，11 篇完整闭环，代码全部实测可运行。',
    cleanUrls: true,
    base: process.env.BASE_URL || '/',
    ignoreDeadLinks: false,
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
      ['meta', { name: 'theme-color', content: '#2f6f62' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:title', content: 'MCP 开发教程' }],
      ['meta', {
        property: 'og:description',
        content: 'MCP 开发实战：从零基础到深入理解，11 篇完整闭环，代码实测可运行。',
      }],
    ],
    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'MCP 开发教程',
      nav: [
        { text: '教程总览', link: '/guide/' },
        { text: '从 01 开始', link: '/guide/01-intro' },
        { text: '协议内核', link: '/guide/03-jsonrpc' },
        { text: '配套代码', link: '/guide/#配套代码' },
      ],
      sidebar: [
        {
          text: '开始',
          items: [
            { text: '教程总览与学习路线', link: '/guide/' },
            { text: '01 认识 MCP', link: '/guide/01-intro' },
          ],
        },
        {
          text: '动手与协议',
          items: [
            { text: '02 第一个 MCP Server', link: '/guide/02-first-server' },
            { text: '03 协议内核：JSON-RPC 与消息流', link: '/guide/03-jsonrpc' },
            { text: '04 传输层：stdio 与 Streamable HTTP', link: '/guide/04-transport' },
          ],
        },
        {
          text: '进阶开发',
          items: [
            { text: '05 三大原语深入', link: '/guide/05-primitives' },
            { text: '06 Elicitation、MRTR 与长任务', link: '/guide/06-elicitation' },
            { text: '07 客户端开发实战', link: '/guide/07-client' },
          ],
        },
        {
          text: '安全与生态',
          items: [
            { text: '08 安全专题', link: '/guide/08-security' },
            { text: '09 生态、发布与多语言', link: '/guide/09-ecosystem' },
          ],
        },
        {
          text: '部署与扩展',
          items: [
            { text: '10 Linux 部署实战', link: '/guide/10-linux-deploy' },
            { text: '11 多用户隔离与无状态扩展', link: '/guide/11-multiuser' },
          ],
        },
      ],
      outline: { level: [2, 3], label: '本页目录' },
      docFooter: { prev: '上一篇', next: '下一篇' },
      returnToTopLabel: '回到顶部',
      sidebarMenuLabel: '目录',
      darkModeSwitchLabel: '主题',
      lightModeSwitchTitle: '切换到浅色模式',
      darkModeSwitchTitle: '切换到深色模式',
      search: {
        provider: 'local',
        options: {
          detailedView: true,
          translations: {
            button: { buttonText: '搜索教程', buttonAriaLabel: '搜索教程' },
            modal: {
              displayDetails: '显示详情',
              resetButtonTitle: '清除查询条件',
              backButtonTitle: '返回',
              noResultsText: '没有找到相关结果',
              footer: {
                selectText: '选择',
                navigateText: '切换',
                closeText: '关闭',
              },
            },
          },
        },
      },
      footer: {
        message: '基于 MCP 官方规范 2026-07-28 编写 · 代码实测于 Windows 10 + Node.js 22',
        copyright: 'MCP 开发系列教程',
      },
      socialLinks: [],
    },
    markdown: {
      lineNumbers: true,
      theme: { light: 'github-light', dark: 'github-dark' },
      languageAlias: { caddyfile: 'nginx' },
    },
    mermaid: { theme: 'neutral' },
    mermaidPlugin: { class: 'mermaid' },
  }),
)
