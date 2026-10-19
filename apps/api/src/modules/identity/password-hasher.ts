import argon2 from "argon2";
import type { PasswordHasher } from "./identity-store.js";

export const argon2PasswordHasher: PasswordHasher = {
  hash(password) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  },
  verify(hash, password) {
    return argon2.verify(hash, password);
  },
};
