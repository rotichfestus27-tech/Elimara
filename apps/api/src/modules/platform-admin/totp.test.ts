import { describe, expect, it } from "vitest";
import {
  createTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  matchingTotpStep,
  totpProvisioningUri,
} from "./totp.js";

describe("platform TOTP", () => {
  it("matches the RFC 6238 SHA-1 vector with six-digit truncation", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(generateTotpCode(secret, new Date(59_000))).toBe("287082");
  });

  it("encrypts factor secrets with authenticated encryption", () => {
    const secret = createTotpSecret();
    const key = "a1".repeat(32);
    const encrypted = encryptTotpSecret(secret, key);

    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, key)).toBe(secret);
    expect(() => decryptTotpSecret(encrypted, "b2".repeat(32))).toThrow();
  });

  it("accepts only six-digit codes in the adjacent time window", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const now = new Date(59_000);
    const code = generateTotpCode(secret, now);

    expect(matchingTotpStep(secret, code, now)).toBe(1);
    expect(matchingTotpStep(secret, "bad-code", now)).toBeNull();
    expect(totpProvisioningUri(secret, "admin@example.test")).toContain("issuer=Elimara");
  });
});
