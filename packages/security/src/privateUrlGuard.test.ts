import { describe, expect, it } from "vitest";
import {
  findPrivateReferences,
  isPrivateUrl,
  redactSensitiveReference,
  redactSensitiveText
} from "./privateUrlGuard.js";

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

  it("redacts sensitive query values while keeping a private-reference signal", () => {
    const redacted = redactSensitiveReference(
      "https://example.com/checkout/session?token=abc1234567890&step=confirm"
    );

    expect(redacted).toBe("https://example.com/checkout/session?step=confirm&redacted_sensitive_query=1");
    expect(redacted).not.toContain("abc1234567890");
    expect(isPrivateUrl(redacted)).toBe(true);
  });

  it("redacts sensitive values inside free text", () => {
    const redacted = redactSensitiveText(
      "See https://example.com/docs?token=abc1234567890 and token=supersecretvalue"
    );

    expect(redacted).toContain("https://example.com/docs?redacted_sensitive_query=1");
    expect(redacted).toContain("token=[REDACTED]");
    expect(redacted).not.toContain("abc1234567890");
    expect(redacted).not.toContain("supersecretvalue");
  });
});
