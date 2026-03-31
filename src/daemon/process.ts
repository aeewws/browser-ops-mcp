import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RpcRequest, RpcResponse } from "../types/api.js";

export const DAEMON_PORT = 47831;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

export async function ensureDaemon(): Promise<void> {
  if (await isDaemonAlive()) {
    return;
  }

  const cliEntrypoint = fileURLToPath(new URL("../cli/index.js", import.meta.url));
  const child = spawn(process.execPath, [cliEntrypoint, "internal-daemon"], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  const started = await waitFor(async () => isDaemonAlive(), 5_000, 150);
  if (!started) {
    throw new Error("Daemon did not start in time. Make sure the package is built before running CLI commands.");
  }
}

export async function callDaemon<T>(action: string, params?: unknown): Promise<T> {
  const response = await fetch(`${DAEMON_URL}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action,
      params
    } satisfies RpcRequest)
  });

  const payload = await response.json() as RpcResponse<T>;
  if (!payload.ok) {
    throw new Error(`${payload.error.code}: ${payload.error.message}`);
  }
  return payload.data;
}

async function isDaemonAlive(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    const response = await fetch(`${DAEMON_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
