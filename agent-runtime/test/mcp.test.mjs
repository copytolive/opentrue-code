import test from "node:test";
import assert from "node:assert/strict";
import {McpClient} from "../src/runtime.mjs";

test("built-in repository MCP server lists and calls tools",async()=>{
  const client=await new McpClient(process.execPath,["examples/mcp-repo-server.mjs"],process.cwd()).start();
  try{
    const list=await client.tools();assert.ok(list.tools.some(x=>x.name==="repo_status"));assert.ok(list.tools.some(x=>x.name==="repo_search"));assert.ok(list.tools.some(x=>x.name==="repo_semantic_search"));
    const status=await client.callTool("repo_status",{});assert.ok(Array.isArray(status.content));
    const search=await client.callTool("repo_search",{query:"runtime",limit:3});assert.ok(Array.isArray(search.structuredContent?.hits));
  }finally{client.stop();}
});
