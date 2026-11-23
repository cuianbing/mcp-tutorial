// 探针：应用层分页 + 多模态内容（image / resource_link / embedded resource）
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// 25 条演示数据
const ITEMS = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1,
  name: `item-${String(i + 1).padStart(2, "0")}`,
}));

// 1x1 红色 PNG（Base64）——演示 image 内容
const RED_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function createServer() {
  const server = new McpServer({ name: "content-probe", version: "1.0.0" });

  // ---------- 应用层分页：limit + cursor ----------
  server.registerTool(
    "list_items",
    {
      description: "分页列出条目。返回 nextCursor 表示还有下一页（传入它继续翻页）",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(10).default(5).describe("每页条数（1-10）"),
        cursor: z.string().optional().describe("上一页返回的 nextCursor；首页不传"),
      }),
      outputSchema: z.object({
        items: z.array(z.object({ id: z.number(), name: z.string() })),
        nextCursor: z.string().nullable().describe("下一页游标；null 表示已到末页"),
      }),
    },
    async ({ limit, cursor }) => {
      const start = cursor ? Number(Buffer.from(cursor, "base64url").toString()) : 0;
      const page = ITEMS.slice(start, start + limit);
      const nextStart = start + page.length;
      const nextCursor = nextStart < ITEMS.length
        ? Buffer.from(String(nextStart)).toString("base64url")
        : null;
      const structured = { items: page, nextCursor };
      const text = page.map((i) => `${i.id}. ${i.name}`).join("\n") +
        (nextCursor ? `\n--- 还有更多，nextCursor=${nextCursor}` : "\n--- 已到末页");
      return { content: [{ type: "text", text }], structuredContent: structured };
    },
  );

  // ---------- 多模态：image ----------
  server.registerTool(
    "get_image",
    {
      description: "返回一张 1x1 图片（演示 image 内容类型）",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        { type: "text", text: "这是一张 1x1 红色 PNG：" },
        { type: "image", data: RED_PNG_BASE64, mimeType: "image/png" },
      ],
    }),
  );

  // ---------- 多模态：resource_link（引用而不内联） ----------
  server.registerTool(
    "get_report_link",
    {
      description: "返回报告下载链接（演示 resource_link：让客户端按需再拉取）",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        {
          type: "resource_link",
          uri: "todo://report/2026-11",
          name: "2026年11月待办报告",
          mimeType: "text/markdown",
          description: "点击/按需读取才会传输内容，适合大文件",
        },
      ],
    }),
  );

  // ---------- 多模态：embedded resource（内联内容） ----------
  server.registerTool(
    "get_embedded_report",
    {
      description: "返回内联的报告内容（演示 embedded resource）",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        {
          type: "resource",
          resource: {
            uri: "todo://report/embedded",
            mimeType: "text/markdown",
            text: "# 待办报告\n\n- 完成 3 项\n- 未完成 5 项\n",
          },
        },
      ],
    }),
  );

  return server;
}

// 配套资源：让 resource_link 指向的 URI 真的可读
function createServerWithResource() {
  const server = createServer();
  server.registerResource(
    "report-2026-11",
    "todo://report/2026-11",
    { title: "2026年11月待办报告", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, text: "# 2026年11月待办报告\n\n（正文从资源读取）\n" }],
    }),
  );
  return server;
}

serveStdio(createServerWithResource);
console.error("content-probe server on stdio");
