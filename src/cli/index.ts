#!/usr/bin/env node
import { Command } from "commander";
import { ensureDaemon, callDaemon, DAEMON_PORT } from "../daemon/process.js";
import { startDaemonServer } from "../daemon/http.js";
import { startMcpServer } from "../mcp/server.js";
import { printJson } from "../output/formatters.js";

const program = new Command();

program
  .name("browser-ops")
  .description("CLI and MCP server for stable browser automation with Playwright.")
  .version("0.1.0");

program
  .command("open")
  .argument("<url>", "URL to open")
  .option("--session <sessionId>", "Session ID", "default")
  .option("--headed", "Use a visible browser window", false)
  .action(withDaemon(async (url: string, options) => {
    printJson(await callDaemon("open", {
      url,
      sessionId: options.session,
      headed: options.headed
    }));
  }));

program
  .command("snapshot")
  .option("--session <sessionId>", "Session ID", "default")
  .action(withDaemon(async (options) => {
    printJson(await callDaemon("snapshot", {
      sessionId: options.session
    }));
  }));

program
  .command("click")
  .argument("<ref>", "Reference from the latest snapshot")
  .requiredOption("--snapshot <snapshotId>", "Snapshot ID")
  .option("--session <sessionId>", "Session ID", "default")
  .action(withDaemon(async (ref: string, options) => {
    printJson(await callDaemon("click", {
      sessionId: options.session,
      snapshotId: options.snapshot,
      ref
    }));
  }));

program
  .command("fill")
  .argument("<ref>", "Reference from the latest snapshot")
  .argument("<text>", "Text to type")
  .requiredOption("--snapshot <snapshotId>", "Snapshot ID")
  .option("--session <sessionId>", "Session ID", "default")
  .action(withDaemon(async (ref: string, text: string, options) => {
    printJson(await callDaemon("fill", {
      sessionId: options.session,
      snapshotId: options.snapshot,
      ref,
      text
    }));
  }));

program
  .command("select")
  .argument("<ref>", "Reference from the latest snapshot")
  .argument("<value>", "Value to select")
  .requiredOption("--snapshot <snapshotId>", "Snapshot ID")
  .option("--session <sessionId>", "Session ID", "default")
  .action(withDaemon(async (ref: string, value: string, options) => {
    printJson(await callDaemon("select", {
      sessionId: options.session,
      snapshotId: options.snapshot,
      ref,
      value
    }));
  }));

program
  .command("wait")
  .option("--session <sessionId>", "Session ID", "default")
  .option("--text <text>", "Wait for page text to appear")
  .option("--url-includes <fragment>", "Wait for the URL to include a fragment")
  .option("--ms <milliseconds>", "Wait for a duration", Number.parseInt)
  .action(withDaemon(async (options) => {
    printJson(await callDaemon("wait", {
      sessionId: options.session,
      text: options.text,
      urlIncludes: options.urlIncludes,
      ms: options.ms
    }));
  }));

program
  .command("extract")
  .option("--session <sessionId>", "Session ID", "default")
  .option("--mode <mode>", "text | markdown | links | forms", "text")
  .action(withDaemon(async (options) => {
    printJson(await callDaemon("extract", {
      sessionId: options.session,
      mode: options.mode
    }));
  }));

program
  .command("screenshot")
  .option("--session <sessionId>", "Session ID", "default")
  .option("--path <path>", "Output screenshot path")
  .option("--full-page", "Capture the full page", false)
  .action(withDaemon(async (options) => {
    const cwd = process.cwd();
    printJson(await callDaemon("screenshot", {
      sessionId: options.session,
      path: options.path,
      cwd,
      fullPage: options.fullPage
    }));
  }));

program
  .command("close")
  .option("--session <sessionId>", "Session ID", "default")
  .action(withDaemon(async (options) => {
    printJson(await callDaemon("close", {
      sessionId: options.session
    }));
  }));

program
  .command("serve-mcp")
  .description("Run the MCP server over stdio.")
  .action(async () => {
    await startMcpServer();
  });

program
  .command("internal-daemon")
  .description("Internal command used to run the local daemon.")
  .action(async () => {
    const handle = await startDaemonServer(DAEMON_PORT);
    const shutdown = async () => {
      await handle.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parseAsync(process.argv).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

function withDaemon<T extends unknown[]>(handler: (...args: T) => Promise<void>) {
  return async (...args: T): Promise<void> => {
    await ensureDaemon();
    await handler(...args);
  };
}
