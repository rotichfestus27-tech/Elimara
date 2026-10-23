const fs = require("node:fs");
const path = require("node:path");

// Load .env fallback if present
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../.env"),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      const m = trimmed.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
      }
    }
  }
}

const targetDatabaseUrl = process.env.TARGET_DATABASE_URL || process.env.RESTORED_DATABASE_URL;
const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
const s3Bucket = process.env.BACKUP_S3_BUCKET;
const s3AccessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
const s3Endpoint = process.env.BACKUP_S3_ENDPOINT;
const s3Region = process.env.BACKUP_S3_REGION || "auto";
const s3Prefix = process.env.BACKUP_S3_PREFIX || "backups/";

if (!targetDatabaseUrl) {
  console.error(
    "❌ TARGET_DATABASE_URL (or RESTORED_DATABASE_URL) environment variable is required.",
  );
  console.error("   Specify an isolated non-production database URL.");
  process.exit(1);
}

if (!encryptionKey) {
  console.error("❌ BACKUP_ENCRYPTION_KEY environment variable is required.");
  process.exit(1);
}

if (!s3Bucket || !s3AccessKeyId || !s3SecretAccessKey) {
  console.error(
    "❌ S3 storage credentials missing (BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY).",
  );
  process.exit(1);
}

const dbPackage = require(path.resolve(__dirname, "../dist/index.js"));
const { BackupService } = dbPackage;

async function main() {
  const service = new BackupService({
    databaseUrl: targetDatabaseUrl,
    encryptionKey,
    storage: {
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      endpoint: s3Endpoint,
      region: s3Region,
      prefix: s3Prefix,
    },
  });

  try {
    const result = await service.restoreBackupToTarget(targetDatabaseUrl);
    console.log("✅ Backup restored successfully to target database.");
    console.log(`   Target:   ${result.targetDatabase}`);
    console.log(`   Duration: ${result.durationMs} ms`);
  } catch (err) {
    console.error("❌ Backup restoration failed:", err.message);
    process.exit(1);
  }
}

main();
