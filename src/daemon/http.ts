import http from "node:http";
import { BrowserOpsError, BrowserOpsService } from "../session/service.js";
import type { RpcFailure, RpcRequest, RpcResponse, RpcSuccess } from "../types/api.js";

export interface DaemonServerHandle {
  port: number;
  service: BrowserOpsService;
  server: http.Server;
  close: () => Promise<void>;
}

export async function startDaemonServer(port = 47831): Promise<DaemonServerHandle> {
  const service = new BrowserOpsService();
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method !== "POST" || request.url !== "/rpc") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Route not found." } }));
        return;
      }

      const body = await readBody(request);
      const rpcRequest = JSON.parse(body) as RpcRequest;
      const result = await dispatchRequest(service, rpcRequest);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(result));
    } catch (error) {
      const rpcError = toFailure(error);
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify(rpcError));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return {
    port,
    service,
    server,
    close: async () => {
      await service.dispose();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function dispatchRequest(service: BrowserOpsService, request: RpcRequest): Promise<RpcResponse<unknown>> {
  const { action, params = {} } = request;
  switch (action) {
    case "open":
      return success(await service.open(params as never));
    case "snapshot":
      return success(await service.snapshot(params as never));
    case "click":
      return success(await service.click(params as never));
    case "fill":
      return success(await service.fill(params as never));
    case "select":
      return success(await service.select(params as never));
    case "wait":
      return success(await service.waitFor(params as never));
    case "extract":
      return success(await service.extract(params as never));
    case "screenshot":
      return success(await service.screenshot(params as never));
    case "close":
      return success(await service.close(params as never));
    default:
      return {
        ok: false,
        error: {
          code: "UNKNOWN_ACTION",
          message: `Unknown action '${action}'.`
        }
      };
  }
}

function success<T>(data: T): RpcSuccess<T> {
  return {
    ok: true,
    data
  };
}

function toFailure(error: unknown): RpcFailure {
  if (error instanceof BrowserOpsError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message
      }
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        code: "UNEXPECTED_ERROR",
        message: error.message
      }
    };
  }

  return {
    ok: false,
    error: {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred."
    }
  };
}

function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("error", reject);
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
