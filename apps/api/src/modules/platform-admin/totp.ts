import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const periodSeconds = 30;
const digits = 6;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function createTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function generateTotpCode(secret: string, now: Date): string {
  const step = Math.floor(now.getTime() / (periodSeconds * 1000));
  return totpAtStep(secret, step);
}

export function encryptTotpSecret(secret: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(encrypted: string, keyHex: string): string {
  const [version, ivValue, tagValue, ciphertextValue, extra] = encrypted.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue || extra !== undefined) {
    throw new Error("Stored platform MFA secret has an invalid format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyHex, "hex"),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function matchingTotpStep(secret: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const currentStep = Math.floor(now.getTime() / (periodSeconds * 1000));
  for (const step of [currentStep + 1, currentStep, currentStep - 1]) {
    const expected = totpAtStep(secret, step);
    const suppliedBytes = Buffer.from(code);
    const expectedBytes = Buffer.from(expected);
    if (timingSafeEqual(suppliedBytes, expectedBytes)) return step;
  }
  return null;
}

export function totpProvisioningUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Elimara:${email}`);
  const query = new URLSearchParams({
    secret,
    issuer: "Elimara",
    algorithm: "SHA1",
    digits: String(digits),
    period: String(periodSeconds),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function totpAtStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function encodeBase32(bytes: Buffer): string {
  let value = 0;
  let bits = 0;
  let result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(value: string): Buffer {
  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Stored platform MFA secret is invalid.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
