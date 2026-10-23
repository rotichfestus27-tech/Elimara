import crypto from "node:crypto";
import { promisify } from "node:util";
import zlib from "node:zlib";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface EncryptionResult {
  encryptedBuffer: Buffer;
  ivHex: string;
  authTagHex: string;
  sha256Hex: string;
  uncompressedBytes: number;
  encryptedBytes: number;
}

export interface DecryptionResult {
  decryptedBuffer: Buffer;
  sha256Hex: string;
}

/**
 * Validates that an encryption key is a valid 32-byte (256-bit) buffer or 64-char hex string.
 */
export function parseEncryptionKey(keyStringOrHex: string): Buffer {
  const trimmed = keyStringOrHex.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const buf = Buffer.from(trimmed, "utf8");
  if (buf.length === 32) {
    return buf;
  }
  // If not exactly 32 bytes, hash with SHA-256 to derive a deterministic 256-bit key
  return crypto.createHash("sha256").update(buf).digest();
}

/**
 * Compresses data using gzip and encrypts using AES-256-GCM.
 * Layout: [16-byte IV] + [Ciphertext] + [16-byte Auth Tag]
 */
export async function compressAndEncrypt(
  plainData: Buffer | string,
  key: Buffer,
): Promise<EncryptionResult> {
  const inputBuffer = Buffer.isBuffer(plainData) ? plainData : Buffer.from(plainData, "utf8");
  const uncompressedBytes = inputBuffer.length;

  // 1. Gzip compression (maximum compression level 9)
  const compressed = await gzip(inputBuffer, { level: 9 });

  // 2. Generate random 16-byte IV for GCM
  const iv = crypto.randomBytes(16);

  // 3. Encrypt via AES-256-GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encryptedPayload = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // 4. Combine into final artifact: IV (16) + Ciphertext + Tag (16)
  const finalEncrypted = Buffer.concat([iv, encryptedPayload, authTag]);

  // 5. Compute SHA-256 checksum on final encrypted payload
  const sha256Hex = crypto.createHash("sha256").update(finalEncrypted).digest("hex");

  return {
    encryptedBuffer: finalEncrypted,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
    sha256Hex,
    uncompressedBytes,
    encryptedBytes: finalEncrypted.length,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload and decompresses via gunzip.
 * Expects layout: [16-byte IV] + [Ciphertext] + [16-byte Auth Tag]
 */
export async function decryptAndDecompress(
  encryptedData: Buffer,
  key: Buffer,
): Promise<DecryptionResult> {
  if (encryptedData.length < 32) {
    throw new Error("Invalid encrypted payload: buffer too short for AES-256-GCM header and tag.");
  }

  // Extract IV (first 16 bytes) and Auth Tag (last 16 bytes)
  const iv = encryptedData.subarray(0, 16);
  const authTag = encryptedData.subarray(encryptedData.length - 16);
  const ciphertext = encryptedData.subarray(16, encryptedData.length - 16);

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let compressed: Buffer;
  try {
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `AES-256-GCM decryption failed: authentication tag mismatch or corrupted data (${msg})`,
    );
  }

  // Decompress
  const decryptedBuffer = await gunzip(compressed);
  const sha256Hex = crypto.createHash("sha256").update(decryptedBuffer).digest("hex");

  return {
    decryptedBuffer,
    sha256Hex,
  };
}
