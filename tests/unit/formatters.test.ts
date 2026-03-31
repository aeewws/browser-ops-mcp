import { describe, expect, it } from "vitest";
import { normalizeText } from "../../src/output/formatters.js";

describe("normalizeText", () => {
  it("collapses excess whitespace while preserving paragraph breaks", () => {
    expect(normalizeText("hello   world\n\n\nsecond line  \n")).toBe("hello   world\n\nsecond line");
  });
});
