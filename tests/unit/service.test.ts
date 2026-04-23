import { afterEach, describe, expect, it } from "vitest";
import { access, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserOpsService } from "../../src/session/service.js";

const service = new BrowserOpsService();

afterEach(async () => {
  await service.dispose();
});

describe("BrowserOpsService", () => {
  it("invalidates stale snapshots after a mutation", async () => {
    const fixture = pathToFileURL(path.resolve("tests/fixtures/extract.html")).toString();
    await service.open({ url: fixture, sessionId: "stale" });

    const snapshot = await service.snapshot({ sessionId: "stale" });
    const input = snapshot.elements.find((element) => element.name === "Name");
    expect(input?.ref).toBeTruthy();

    await service.fill({
      sessionId: "stale",
      snapshotId: snapshot.snapshotId,
      ref: input!.ref,
      text: "Ada"
    });

    await expect(
      service.click({
        sessionId: "stale",
        snapshotId: snapshot.snapshotId,
        ref: input!.ref
      })
    ).rejects.toMatchObject({
      code: "STALE_SNAPSHOT",
      message: "Snapshot is stale. Run snapshot again before interacting."
    });
  });

  it("extracts markdown, links, and forms with stable shape", async () => {
    const fixture = pathToFileURL(path.resolve("tests/fixtures/extract.html")).toString();
    await service.open({ url: fixture, sessionId: "extract" });

    const markdown = await service.extract({ sessionId: "extract", mode: "markdown" });
    expect(markdown.mode).toBe("markdown");
    expect(markdown.content).toContain("# Browser Ops Extract Fixture");
    expect(markdown.content).toContain("Paragraph alpha for markdown extraction.");

    const links = await service.extract({ sessionId: "extract", mode: "links" });
    expect(links.mode).toBe("links");
    expect(links.links).toHaveLength(2);
    expect(links.links?.[0]?.text).toBe("Docs");
    expect(links.links?.[0]?.href).toContain("example.com/docs");

    const forms = await service.extract({ sessionId: "extract", mode: "forms" });
    expect(forms.mode).toBe("forms");
    expect(forms.forms?.some((field) => field.name === "name")).toBe(true);
    expect(forms.forms?.some((field) => field.type === "button")).toBe(true);
  });

  it("reports button-like input elements as buttons in snapshots", async () => {
    const fixture = pathToFileURL(path.resolve("tests/fixtures/snapshot-input-types.html")).toString();
    await service.open({ url: fixture, sessionId: "snapshot-input-types" });

    const snapshot = await service.snapshot({ sessionId: "snapshot-input-types" });
    const rolesById = new Map(snapshot.elements.map((element) => [element.name, element.role]));

    expect(rolesById.get("button-input")).toBe("button");
    expect(rolesById.get("submit-input")).toBe("button");
    expect(rolesById.get("reset-input")).toBe("button");
    expect(rolesById.get("image-input")).toBe("button");
  });

  it("fails fast on invalid extract mode", async () => {
    const fixture = pathToFileURL(path.resolve("tests/fixtures/extract.html")).toString();
    await service.open({ url: fixture, sessionId: "invalid-mode" });

    await expect(
      service.extract({ sessionId: "invalid-mode", mode: "diagram" as never })
    ).rejects.toMatchObject({
      code: "INVALID_EXTRACT_MODE",
      message: "Unsupported extract mode 'diagram'. Use text, markdown, links, or forms."
    });
  });

  it("resolves screenshot paths against the caller cwd", async () => {
    const fixture = pathToFileURL(path.resolve("tests/fixtures/extract.html")).toString();
    const callerCwd = await mkdtemp(path.join(os.tmpdir(), "browser-ops-cwd-"));
    await service.open({ url: fixture, sessionId: "screenshot" });

    const result = await service.screenshot({
      sessionId: "screenshot",
      path: "artifacts/screenshot.png",
      cwd: callerCwd
    });

    expect(result.path).toBe(path.join(callerCwd, "artifacts", "screenshot.png"));
    await access(result.path);
  });
});
