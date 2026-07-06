import { describe, expect, it } from "vitest";
import { findPrivateReferences, isPrivateUrl } from "./privateUrlGuard.js";

describe("private URL guard", () => {
  it("detects private routes", () => {
    expect(isPrivateUrl("https://example.com/admin/settings")).toBe(true);
    expect(isPrivateUrl("https://example.com/docs/getting-started")).toBe(false);
  });

  it("extracts private references from text", () => {
    expect(findPrivateReferences("See https://example.com/checkout/session?token=abc1234567890")).toContain(
      "https://example.com/checkout/session?token=abc1234567890"
    );
  });
});
