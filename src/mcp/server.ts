import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { callDaemon, ensureDaemon } from "../daemon/process.js";

export async function startMcpServer(): Promise<void> {
  await ensureDaemon();

  const server = new Server(
    { name: "browser-ops-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      tool("open_page", "Open a URL in the local browser daemon.", {
        type: "object",
        properties: {
          url: { type: "string" },
          sessionId: { type: "string" },
          headed: { type: "boolean" }
        },
        required: ["url"],
        additionalProperties: false
      }),
      tool("snapshot_page", "Capture the current interactive snapshot.", {
        type: "object",
        properties: {
          sessionId: { type: "string" }
        },
        additionalProperties: false
      }),
      tool("click_element", "Click an element from a snapshot.", elementInputSchema()),
      tool("fill_element", "Fill an element from a snapshot.", {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          snapshotId: { type: "string" },
          ref: { type: "string" },
          text: { type: "string" }
        },
        required: ["snapshotId", "ref", "text"],
        additionalProperties: false
      }),
      tool("select_option", "Select an option from a snapshot ref.", {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          snapshotId: { type: "string" },
          ref: { type: "string" },
          value: { type: "string" }
        },
        required: ["snapshotId", "ref", "value"],
        additionalProperties: false
      }),
      tool("wait_for", "Wait for text, URL fragment, or a duration.", {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          text: { type: "string" },
          urlIncludes: { type: "string" },
          ms: { type: "number" }
        },
        additionalProperties: false
      }),
      tool("extract_content", "Extract page content in text, markdown, links, or forms mode.", {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          mode: {
            type: "string",
            enum: ["text", "markdown", "links", "forms"]
          }
        },
        required: ["mode"],
        additionalProperties: false
      }),
      tool("take_screenshot", "Take a screenshot of the active page.", {
        type: "object",
          properties: {
            sessionId: { type: "string" },
            path: { type: "string" },
            cwd: { type: "string" },
            fullPage: { type: "boolean" }
          },
        additionalProperties: false
      }),
      tool("close_session", "Close the active session.", {
        type: "object",
        properties: {
          sessionId: { type: "string" }
        },
        additionalProperties: false
      })
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params.arguments ?? {};
    const result = await routeToolCall(request.params.name, params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function tool(name: string, description: string, inputSchema: Record<string, unknown>) {
  return { name, description, inputSchema };
}

function elementInputSchema() {
  return {
    type: "object",
    properties: {
      sessionId: { type: "string" },
      snapshotId: { type: "string" },
      ref: { type: "string" }
    },
    required: ["snapshotId", "ref"],
    additionalProperties: false
  };
}

async function routeToolCall(name: string, params: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "open_page":
      return callDaemon("open", params);
    case "snapshot_page":
      return callDaemon("snapshot", params);
    case "click_element":
      return callDaemon("click", params);
    case "fill_element":
      return callDaemon("fill", params);
    case "select_option":
      return callDaemon("select", params);
    case "wait_for":
      return callDaemon("wait", params);
    case "extract_content":
      return callDaemon("extract", params);
    case "take_screenshot":
      return callDaemon("screenshot", params);
    case "close_session":
      return callDaemon("close", params);
    default:
      throw new Error(`Unknown tool '${name}'.`);
  }
}
