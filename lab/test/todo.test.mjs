// MCP 服务器集成测试（Node 内置 test runner，零额外依赖）
// 运行：node --test test/
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

// 每个测试文件共享一个客户端连接（stdio 服务器是有状态的，工具间有先后依赖）
let client;

before(async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["build/todo-server.js"],
  });
  client = new Client(
    { name: "test-runner", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

describe("工具清单", () => {
  test("暴露 4 个工具且都有描述", async () => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 4);
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["add_todo", "complete_todo", "delete_todo", "list_todos"]);
    for (const t of tools) {
      assert.ok(t.description && t.description.length > 0, `${t.name} 缺少描述`);
      assert.ok(t.inputSchema?.type === "object", `${t.name} inputSchema 应为 object`);
    }
  });

  test("add_todo 的 schema 声明了必填 text", async () => {
    const { tools } = await client.listTools();
    const add = tools.find((t) => t.name === "add_todo");
    assert.deepEqual(add.inputSchema.required, ["text"]);
    assert.equal(add.inputSchema.properties.text.type, "string");
  });
});

describe("工具调用", () => {
  test("add_todo 成功后 list_todos 能看到", async () => {
    const added = await client.callTool({ name: "add_todo", arguments: { text: "写测试" } });
    assert.ok(!added.isError, "add 不应失败");
    assert.match(added.content[0].text, /已添加 \[1\] 写测试/);

    const listed = await client.callTool({ name: "list_todos", arguments: { filter: "open" } });
    assert.match(listed.content[0].text, /写测试/);
  });

  test("complete_todo 改变状态", async () => {
    await client.callTool({ name: "add_todo", arguments: { text: "待完成" } });
    const done = await client.callTool({ name: "complete_todo", arguments: { id: 2 } });
    assert.ok(!done.isError);

    const open = await client.callTool({ name: "list_todos", arguments: { filter: "open" } });
    assert.doesNotMatch(open.content[0].text, /待完成/, "已完成的不应出现在 open 列表");

    const doneList = await client.callTool({ name: "list_todos", arguments: { filter: "done" } });
    assert.match(doneList.content[0].text, /待完成/);
  });
});

describe("错误语义（isError 而非抛异常）", () => {
  test("complete 不存在的 id 返回 isError", async () => {
    const r = await client.callTool({ name: "complete_todo", arguments: { id: 9999 } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /找不到编号为 9999 的待办/);
  });

  test("delete 不存在的 id 返回 isError", async () => {
    const r = await client.callTool({ name: "delete_todo", arguments: { id: 8888 } });
    assert.equal(r.isError, true);
  });
});

describe("参数校验（SDK 转为 isError，便于模型自我纠正）", () => {
  test("text 为空串 → isError 且说明原因", async () => {
    const r = await client.callTool({ name: "add_todo", arguments: { text: "" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /validation error/i);
    assert.match(r.content[0].text, />=1 characters/);
  });

  test("缺必填字段 → isError", async () => {
    const r = await client.callTool({ name: "add_todo", arguments: {} });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /expected string, received undefined/);
  });

  test("类型错（id 传字符串）→ isError", async () => {
    const r = await client.callTool({ name: "complete_todo", arguments: { id: "abc" } });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /expected number, received string/);
  });
});
