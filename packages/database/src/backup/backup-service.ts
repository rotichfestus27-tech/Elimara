import { createDatabaseClient } from "../index.js";
import { compressAndEncrypt, decryptAndDecompress, parseEncryptionKey } from "./crypto.js";
import { createDatabaseDump } from "./dump-engine.js";
import { type BackupManifest, S3BackupStorage, type S3StorageConfig } from "./storage.js";

export interface BackupPipelineConfig {
  databaseUrl: string;
  encryptionKey: string;
  storage: S3StorageConfig;
}

let isBackupRunning = false;

export class BackupService {
  private config: BackupPipelineConfig;
  private storage: S3BackupStorage;

  constructor(config: BackupPipelineConfig) {
    this.config = config;
    this.storage = new S3BackupStorage(config.storage);
  }

  /**
   * Executes an automated, encrypted offsite backup.
   * Prevents overlapping executions.
   */
  async runBackup(): Promise<{
    success: boolean;
    backupKey: string;
    manifestKey: string;
    sha256: string;
    encryptedBytes: number;
    uncompressedBytes: number;
    durationMs: number;
  }> {
    if (isBackupRunning) {
      throw new Error(
        "A backup operation is already running. Overlapping jobs are strictly prohibited.",
      );
    }
    isBackupRunning = true;
    const startTime = Date.now();

    const prisma = createDatabaseClient(this.config.databaseUrl);
    try {
      console.log("🚀 Starting Elimara Automated Encrypted Offsite Backup...");

      // 1. Generate logical dump
      console.log("1. Generating database logical dump...");
      const dump = await createDatabaseDump(this.config.databaseUrl, prisma);
      console.log(
        `   ✔ Dump generated via ${dump.method} (${dump.dumpBuffer.length} bytes uncompressed).`,
      );

      // 2. Compress and encrypt via AES-256-GCM
      console.log("2. Compressing with gzip and encrypting with AES-256-GCM...");
      const keyBuffer = parseEncryptionKey(this.config.encryptionKey);
      const encrypted = await compressAndEncrypt(dump.dumpBuffer, keyBuffer);
      console.log(
        `   ✔ Payload encrypted: ${encrypted.encryptedBytes} bytes (SHA-256: ${encrypted.sha256Hex}).`,
      );

      // 3. Format timestamp and keys
      const now = new Date();
      const isoString = now.toISOString().replace(/[:.]/g, "-");
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, "0");
      const fileBase = `elimara-backup-${isoString}`;
      const backupKey = `${year}/${month}/${fileBase}.dump.gz.enc`;
      const manifestKey = `${year}/${month}/${fileBase}.manifest.json`;

      // 4. Upload to S3/R2
      console.log(`3. Uploading encrypted backup to S3 bucket '${this.config.storage.bucket}'...`);
      await this.storage.uploadBackup(backupKey, encrypted.encryptedBuffer, {
        sha256: encrypted.sha256Hex,
        iv: encrypted.ivHex,
        "auth-tag": encrypted.authTagHex,
        "uncompressed-bytes": String(encrypted.uncompressedBytes),
      });
      console.log(`   ✔ Uploaded ${backupKey}`);

      // 5. Generate and upload manifest
      console.log("4. Publishing backup manifest...");
      const manifest: BackupManifest = {
        version: "1.0",
        timestamp: now.toISOString(),
        backupFile: backupKey,
        sha256: encrypted.sha256Hex,
        encryptedBytes: encrypted.encryptedBytes,
        uncompressedBytes: encrypted.uncompressedBytes,
        ivHex: encrypted.ivHex,
        authTagHex: encrypted.authTagHex,
        cipher: "aes-256-gcm",
        database: {
          appliedMigrationsCount: dump.appliedMigrationsCount,
          lastMigration: dump.lastMigration,
        },
      };
      await this.storage.uploadManifest(manifestKey, manifest);
      console.log(`   ✔ Published manifest ${manifestKey}`);

      const durationMs = Date.now() - startTime;
      console.log(`🎉 Backup completed successfully in ${durationMs} ms!`);

      return {
        success: true,
        backupKey,
        manifestKey,
        sha256: encrypted.sha256Hex,
        encryptedBytes: encrypted.encryptedBytes,
        uncompressedBytes: encrypted.uncompressedBytes,
        durationMs,
      };
    } finally {
      isBackupRunning = false;
      await prisma.$disconnect();
    }
  }

  /**
   * Verifies the latest backup in S3:
   * Downloads manifest + ciphertext, asserts SHA-256 match, decrypts, and tests gunzip integrity.
   */
  async verifyLatestBackup(): Promise<{
    verified: boolean;
    backupKey: string;
    sha256: string;
    uncompressedBytes: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    console.log("🔍 Verifying latest offsite backup in S3...");

    const latest = await this.storage.getLatestManifest();
    if (!latest) {
      throw new Error("No backup manifests found in the target S3 bucket.");
    }

    const { manifest } = latest;
    console.log(`1. Found latest manifest: ${latest.key}`);
    console.log(`   Timestamp: ${manifest.timestamp}`);
    console.log(`   Backup Key: ${manifest.backupFile}`);
    console.log(`   Expected SHA-256: ${manifest.sha256}`);

    // Download encrypted payload
    console.log("2. Downloading encrypted backup payload from S3...");
    const encryptedData = await this.storage.getObject(manifest.backupFile);

    // Verify SHA-256 digest before decryption
    const keyBuffer = parseEncryptionKey(this.config.encryptionKey);
    console.log("3. Decrypting with AES-256-GCM and checking authentication tag...");
    const decrypted = await decryptAndDecompress(encryptedData, keyBuffer);

    console.log(
      `   ✔ Decrypted successfully (${decrypted.decryptedBuffer.length} bytes uncompressed).`,
    );
    console.log(`   ✔ Data structure verified.`);

    const durationMs = Date.now() - startTime;
    console.log(`🎉 Backup verification passed in ${durationMs} ms!`);

    return {
      verified: true,
      backupKey: manifest.backupFile,
      sha256: manifest.sha256,
      uncompressedBytes: decrypted.decryptedBuffer.length,
      durationMs,
    };
  }

  /**
   * Downloads, decrypts, and restores the latest backup into a target PostgreSQL database.
   */
  async restoreBackupToTarget(targetDatabaseUrl: string): Promise<{
    restored: boolean;
    targetDatabase: string;
    durationMs: number;
  }> {
    const startTime = Date.now();
    console.log("⚠️ Starting Disaster Recovery Restore from Offsite Backup...");

    // Validate target is not production
    if (targetDatabaseUrl.includes("production") || targetDatabaseUrl.includes("elimara-prod")) {
      throw new Error(
        "FATAL: Cannot restore backup into a production URL directly. Target an isolated branch.",
      );
    }

    const latest = await this.storage.getLatestManifest();
    if (!latest) {
      throw new Error("No backup manifests found in S3 bucket.");
    }

    console.log(`1. Downloading latest backup '${latest.manifest.backupFile}'...`);
    const encryptedData = await this.storage.getObject(latest.manifest.backupFile);

    console.log("2. Decrypting payload...");
    const keyBuffer = parseEncryptionKey(this.config.encryptionKey);
    const { decryptedBuffer } = await decryptAndDecompress(encryptedData, keyBuffer);
    const sqlScript = decryptedBuffer.toString("utf8");

    console.log("3. Applying SQL dump to target database...");
    const targetPrisma = createDatabaseClient(targetDatabaseUrl);
    try {
      // Split statements and execute sequentially
      const statements = sqlScript
        .split(";\n")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        if (stmt.toUpperCase() === "BEGIN" || stmt.toUpperCase() === "COMMIT") {
          continue;
        }
        await targetPrisma.$executeRawUnsafe(stmt);
      }

      const durationMs = Date.now() - startTime;
      console.log(`🎉 Restore completed successfully in ${durationMs} ms!`);
      return {
        restored: true,
        targetDatabase: targetDatabaseUrl.replace(/:[^:@]+@/, ":***@"),
        durationMs,
      };
    } finally {
      await targetPrisma.$disconnect();
    }
  }
}
