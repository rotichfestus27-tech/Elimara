import { describe, expect, it } from "vitest";
import { argon2PasswordHasher } from "./password-hasher.js";

describe("Argon2id password hashing", () => {
  it("uses Argon2id with the configured work factors and verifies passwords", async () => {
    const password = "Correct Horse Battery Staple";
    const encodedHash = await argon2PasswordHasher.hash(password);

    expect(encodedHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(argon2PasswordHasher.verify(encodedHash, password)).resolves.toBe(true);
    await expect(argon2PasswordHasher.verify(encodedHash, "incorrect password")).resolves.toBe(
      false,
    );
    expect(encodedHash).not.toContain(password);
  });
});
