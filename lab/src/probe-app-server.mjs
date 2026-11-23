// MCP App 探针：工具声明 UI 资源 + 提供 ui:// HTML 资源
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

// 最小可用的交互卡片（真实项目用 React/Vue 模板，见 ext-apps 官方 examples）
const VIEW_HTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>待办视图</title>
<style>
  body{font-family:system-ui;margin:0;padding:12px}
  li{padding:4px 0}
</style></head>
<body>
  <h3>待办清单</h3>
  <ul id="list"></ul>
  <script>
    // MCP Apps 的双向通信由 host 注入的桥接层完成；
    // 这里仅演示静态渲染，真实项目用 ext-apps 的 App 类订阅工具数据。
    const items = ["示例 A", "示例 B"];
    document.getElementById("list").innerHTML =
      items.map((t) => "<li>⬜ " + t + "</li>").join("");
  </script>
</body></html>`;

function createServer() {
  const server = new McpServer({ name: "app-probe", version: "1.0.0" });

  // 关键：工具通过 _meta.ui.resourceUri 指向 UI 资源
  registerAppTool(
    server,
    "show_todos",
    {
      description: "以交互卡片展示当前待办（有 UI 的客户端会渲染卡片）",
      inputSchema: z.object({}),
      _meta: { ui: { resourceUri: "ui://todo/view.html" } },
    },
    async () => ({
      content: [{ type: "text", text: "共 2 条待办" }],
      structuredContent: { items: ["示例 A", "示例 B"] },
    }),
  );

  // UI 资源本身：必须是 text/html;profile=mcp-app
  registerAppResource(
    server,
    "Todo View",
    "ui://todo/view.html",
    {},
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: VIEW_HTML }],
    }),
  );

  return server;
}

serveStdio(createServer);
console.error("app-probe server on stdio");
