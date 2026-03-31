import { afterAll, describe, expect, it } from "vitest";
import { access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { BrowserOpsService } from "../../src/session/service.js";

const service = new BrowserOpsService();

afterAll(async () => {
  await service.dispose();
});

describe("browser-ops smoke flow", () => {
  it("opens, snapshots, fills, selects, clicks, extracts, and screenshots", async () => {
    const fixturePath = path.resolve("tests/fixtures/demo.html");
    const outputPath = path.join(os.tmpdir(), `browser-ops-smoke-${Date.now()}.png`);

    await service.open({
      url: pathToFileURL(fixturePath).toString(),
      sessionId: "smoke"
    });

    const firstSnapshot = await service.snapshot({ sessionId: "smoke" });
    const nameInput = firstSnapshot.elements.find((element) => element.name === "Name");
    const roleSelect = firstSnapshot.elements.find((element) => element.name === "Role");
    expect(nameInput?.ref).toBeTruthy();
    expect(roleSelect?.ref).toBeTruthy();

    await service.fill({
      sessionId: "smoke",
      snapshotId: firstSnapshot.snapshotId,
      ref: nameInput!.ref,
      text: "Ada"
    });

    const secondSnapshot = await service.snapshot({ sessionId: "smoke" });
    const selectElement = secondSnapshot.elements.find((element) => element.name === "Role");
    await service.select({
      sessionId: "smoke",
      snapshotId: secondSnapshot.snapshotId,
      ref: selectElement!.ref,
      value: "analyst"
    });

    const thirdSnapshot = await service.snapshot({ sessionId: "smoke" });
    const submitButton = thirdSnapshot.elements.find((element) => element.role === "button");
    await service.click({
      sessionId: "smoke",
      snapshotId: thirdSnapshot.snapshotId,
      ref: submitButton!.ref
    });

    await service.waitFor({
      sessionId: "smoke",
      text: "Submitted Ada as analyst"
    });

    const extraction = await service.extract({
      sessionId: "smoke",
      mode: "text"
    });
    expect(extraction.content).toContain("Submitted Ada as analyst");

    const screenshot = await service.screenshot({
      sessionId: "smoke",
      path: outputPath
    });
    await access(screenshot.path);

    const closeResult = await service.close({ sessionId: "smoke" });
    expect(closeResult.closed).toBe(true);
  }, 45_000);
});
