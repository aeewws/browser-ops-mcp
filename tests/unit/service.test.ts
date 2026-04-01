import { afterEach, describe, expect, it } from "vitest";
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
});
