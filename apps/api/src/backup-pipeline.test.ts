import { compressAndEncrypt, decryptAndDecompress, parseEncryptionKey } from "@elimara/database";
import { describe, expect, it } from "vitest";

describe("Automated Encrypted Offsite Backup Pipeline", () => {
  const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const testKey = parseEncryptionKey(testKeyHex);

  it("parses valid 256-bit hexadecimal encryption keys", () => {
    expect(testKey).toBeInstanceOf(Buffer);
    expect(testKey.length).toBe(32);
  });

  it("derivatively hashes non-hex or arbitrary passphrase keys into 256-bit keys", () => {
    const derived = parseEncryptionKey("short-passphrase");
    expect(derived.length).toBe(32);
  });

  it("compresses and encrypts payload with AES-256-GCM and computes SHA-256 digest", async () => {
    const rawSql = "INSERT INTO users (id, email) VALUES ('123', 'admin@elimara.org');\n".repeat(
      100,
    );
    const result = await compressAndEncrypt(rawSql, testKey);

    expect(result.encryptedBuffer).toBeInstanceOf(Buffer);
    expect(result.ivHex).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(result.authTagHex).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(result.sha256Hex).toHaveLength(64); // SHA-256 = 64 hex chars
    expect(result.uncompressedBytes).toBe(Buffer.byteLength(rawSql));
    expect(result.encryptedBytes).toBe(result.encryptedBuffer.length);

    // Gzip + encryption should compress repeated SQL text significantly
    expect(result.encryptedBytes).toBeLessThan(result.uncompressedBytes);
  });

  it("decrypts and decompresses payload cleanly matching original plaintext", async () => {
    const originalText =
      "SELECT * FROM schools WHERE active = true; -- Critical multi-tenant query";
    const encrypted = await compressAndEncrypt(originalText, testKey);

    const decrypted = await decryptAndDecompress(encrypted.encryptedBuffer, testKey);
    expect(decrypted.decryptedBuffer.toString("utf8")).toBe(originalText);
  });

  it("detects and rejects ciphertext tampering via AES-256-GCM authentication tag mismatch", async () => {
    const originalText = "CONFIDENTIAL STUDENT FINANCIAL ACCOUNT DATA";
    const encrypted = await compressAndEncrypt(originalText, testKey);

    // Tamper with a byte in the middle of ciphertext
    const tampered = Buffer.from(encrypted.encryptedBuffer);
    tampered[20] = tampered[20] ^ 0xff;

    await expect(decryptAndDecompress(tampered, testKey)).rejects.toThrow(
      /authentication tag mismatch or corrupted data/i,
    );
  });

  it("detects and rejects authentication tag tampering", async () => {
    const originalText = "CONFIDENTIAL STUDENT ATTENDANCE DATA";
    const encrypted = await compressAndEncrypt(originalText, testKey);

    // Tamper with the last byte (auth tag)
    const tampered = Buffer.from(encrypted.encryptedBuffer);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0x01;

    await expect(decryptAndDecompress(tampered, testKey)).rejects.toThrow(
      /authentication tag mismatch or corrupted data/i,
    );
  });

  it("detects and rejects initialization vector (IV) tampering", async () => {
    const originalText = "CONFIDENTIAL ASSESSMENT RESULT DATA";
    const encrypted = await compressAndEncrypt(originalText, testKey);

    // Tamper with the first byte (IV)
    const tampered = Buffer.from(encrypted.encryptedBuffer);
    tampered[0] = tampered[0] ^ 0xaa;

    await expect(decryptAndDecompress(tampered, testKey)).rejects.toThrow(
      /authentication tag mismatch or corrupted data/i,
    );
  });

  it("fails decryption if an incorrect encryption key is provided", async () => {
    const originalText = "ACADEMIC TIMETABLES AND CLASS DATA";
    const encrypted = await compressAndEncrypt(originalText, testKey);

    const wrongKey = parseEncryptionKey(
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    );
    await expect(decryptAndDecompress(encrypted.encryptedBuffer, wrongKey)).rejects.toThrow(
      /authentication tag mismatch or corrupted data/i,
    );
  });
});
