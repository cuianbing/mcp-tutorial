import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

// ---------- 内存数据（重启即清空，教学用） ----------
interface Todo {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
}

const todos: Todo[] = [];
let nextId = 1;

// ---------- 工具注册 ----------
// 注意：本函数会被 serveStdio 在需要时重复调用，每次都要返回全新实例
function createServer() {
  const server = new McpServer({ name: "todo", version: "1.0.0" });

  server.registerTool(
    "add_todo",
    {
      title: "新增待办",
      description: "向待办清单中添加一条新待办事项",
      inputSchema: z.object({
        text: z.string().min(1).describe("待办内容，例如：给客户发周报"),
      }),
    },
    async ({ text }) => {
      const todo: Todo = {
        id: nextId++,
        text,
        done: false,
        createdAt: new Date().toISOString(),
      };
      todos.push(todo);
      return {
        content: [
          { type: "text", text: `已添加 [${todo.id}] ${text}` },
        ],
      };
    },
  );

  server.registerTool(
    "list_todos",
    {
      title: "列出待办",
      description: "列出当前所有待办事项，可按完成状态过滤",
      inputSchema: z.object({
        filter: z
          .enum(["all", "open", "done"])
          .default("all")
          .describe("过滤条件：all=全部，open=未完成，done=已完成"),
      }),
    },
    async ({ filter }) => {
      const rows = todos.filter((t) =>
        filter === "all" ? true : filter === "done" ? t.done : !t.done,
      );
      if (rows.length === 0) {
        return { content: [{ type: "text", text: "（清单是空的）" }] };
      }
      const lines = rows.map(
        (t) => `[${t.id}] ${t.done ? "✅" : "⬜"} ${t.text}`,
      );
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "complete_todo",
    {
      title: "完成待办",
      description: "把指定编号的待办标记为已完成",
      inputSchema: z.object({
        id: z.number().int().positive().describe("待办编号（list_todos 返回的 [n]）"),
      }),
    },
    async ({ id }) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        return {
          content: [{ type: "text", text: `找不到编号为 ${id} 的待办` }],
          isError: true,
        };
      }
      todo.done = true;
      return { content: [{ type: "text", text: `已完成 [${id}] ${todo.text}` }] };
    },
  );

  server.registerTool(
    "delete_todo",
    {
      title: "删除待办",
      description: "删除指定编号的待办事项",
      inputSchema: z.object({
        id: z.number().int().positive().describe("待办编号"),
      }),
    },
    async ({ id }) => {
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) {
        return {
          content: [{ type: "text", text: `找不到编号为 ${id} 的待办` }],
          isError: true,
        };
      }
      const [removed] = todos.splice(index, 1);
      return { content: [{ type: "text", text: `已删除 [${id}] ${removed.text}` }] };
    },
  );

  return server;
}

// ---------- 启动（stdio 传输，日志只能走 stderr） ----------
serveStdio(createServer, {
  onerror: (error) => console.error("todo MCP server error:", error),
});
console.error("todo MCP server running on stdio");
