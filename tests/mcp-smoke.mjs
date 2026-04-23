import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({
  name: "browser-ops-mcp-smoke",
  version: "0.1.0"
});

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("dist/cli/index.js"), "serve-mcp"],
  cwd: process.cwd(),
  stderr: "pipe"
});

try {
  await client.connect(transport);

  const toolList = await client.listTools();
  const toolNames = toolList.tools.map((tool) => tool.name);
  assert(toolNames.includes("open_page"));
  assert(toolNames.includes("take_screenshot"));

  const sessionId = "mcp-smoke";
  const fixtureUrl = pathToFileURL(path.resolve("tests/fixtures/extract.html")).toString();
  await client.callTool({
    name: "open_page",
    arguments: {
      sessionId,
      url: fixtureUrl
    }
  });

  const outputDir = await mkdtemp(path.join(os.tmpdir(), "browser-ops-mcp-smoke-"));
  const screenshotResult = await client.callTool({
    name: "take_screenshot",
    arguments: {
      sessionId,
      cwd: outputDir,
      path: "artifacts/mcp-smoke.png"
    }
  });

  const screenshotPayload = screenshotResult.content.find((item) => item.type === "text");
  assert(screenshotPayload && typeof screenshotPayload.text === "string");
  const parsed = JSON.parse(screenshotPayload.text);
  assert.equal(parsed.path, path.join(outputDir, "artifacts", "mcp-smoke.png"));

  await client.callTool({
    name: "close_session",
    arguments: {
      sessionId
    }
  });
} finally {
  await transport.close();
}
