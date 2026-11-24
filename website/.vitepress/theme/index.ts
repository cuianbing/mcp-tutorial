import DefaultTheme from 'vitepress/theme'
import { createMermaidRenderer } from 'vitepress-mermaid-renderer'
import './custom.css'

const mermaidToolbar = {
  showLanguageLabel: false,
  fullscreenMode: 'dialog' as const,
  desktop: {
    copyCode: 'disabled' as const,
    download: 'disabled' as const,
    toggleToolbar: 'disabled' as const,
    positions: { vertical: 'bottom' as const, horizontal: 'right' as const },
  },
  mobile: {
    zoomIn: 'enabled' as const,
    zoomOut: 'enabled' as const,
    copyCode: 'disabled' as const,
    download: 'disabled' as const,
    toggleToolbar: 'disabled' as const,
    positions: { vertical: 'bottom' as const, horizontal: 'right' as const },
  },
  fullscreen: {
    copyCode: 'disabled' as const,
    download: 'disabled' as const,
    toggleToolbar: 'disabled' as const,
    positions: { vertical: 'bottom' as const, horizontal: 'right' as const },
  },
  i18n: {
    localeIndex: 'zh-CN',
    tooltips: {
      zoomIn: '放大',
      zoomOut: '缩小',
      resetView: '重置视图',
      copyCode: '复制源码',
      copyCodeCopied: '已复制',
      toggleFullscreen: '全屏查看',
      download: '下载图表',
      renderErrorText: '图表渲染失败',
      toggleErrorDetailsText: '查看详情',
      toggleErrorDetailsHideText: '收起详情',
      toggleToolbarExpand: '展开工具栏',
      toggleToolbarCollapse: '收起工具栏',
    },
  },
}

function initMermaid() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const renderer = createMermaidRenderer({
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'neutral',
  })
  renderer.setToolbar(mermaidToolbar)
}

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof window === 'undefined') return

    // 等 VitePress 完成首屏水合后再接管 Mermaid 代码块
    window.setTimeout(initMermaid, 500)

    // 深浅色切换时重新渲染图表
    const observer = new MutationObserver(() => initMermaid())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
  },
}
