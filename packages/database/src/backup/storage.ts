import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
}

export interface BackupManifest {
  version: "1.0";
  timestamp: string;
  backupFile: string;
  sha256: string;
  encryptedBytes: number;
  uncompressedBytes: number;
  ivHex: string;
  authTagHex: string;
  cipher: "aes-256-gcm";
  database: {
    appliedMigrationsCount: number;
    lastMigration: string | null;
  };
}

export class S3BackupStorage {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix ? `${config.prefix.replace(/^\/|\/$/g, "")}/` : "backups/";

    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Cloudflare R2 & standard S3 path style
      forcePathStyle: Boolean(config.endpoint && !config.endpoint.includes("amazonaws.com")),
    });
  }

  /**
   * Uploads an encrypted backup file to S3 with metadata.
   */
  async uploadBackup(key: string, data: Buffer, metadata: Record<string, string>): Promise<void> {
    const fullKey = this.prefix + key.replace(/^\//, "");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: data,
        ContentType: "application/octet-stream",
        Metadata: metadata,
        ServerSideEncryption: "AES256",
      }),
    );
  }

  /**
   * Uploads the JSON manifest file for a backup.
   */
  async uploadManifest(key: string, manifest: BackupManifest): Promise<void> {
    const fullKey = this.prefix + key.replace(/^\//, "");
    const body = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: body,
        ContentType: "application/json",
        ServerSideEncryption: "AES256",
      }),
    );
  }

  /**
   * Downloads an object by key.
   */
  async getObject(key: string): Promise<Buffer> {
    const fullKey = key.startsWith(this.prefix) ? key : this.prefix + key.replace(/^\//, "");
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
      }),
    );

    if (!response.Body) {
      throw new Error(`S3 object '${fullKey}' returned empty body.`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  /**
   * Lists all backup files in the bucket.
   */
  async listBackups(): Promise<Array<{ key: string; lastModified: Date; size: number }>> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
      }),
    );

    const contents = response.Contents || [];
    return contents
      .filter((obj) => obj.Key?.endsWith(".dump.gz.enc"))
      .map((obj) => ({
        key: obj.Key ?? "",
        lastModified: obj.LastModified || new Date(),
        size: obj.Size || 0,
      }))
      .filter((obj) => obj.key.length > 0)
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  /**
   * Finds the latest backup manifest in the bucket.
   */
  async getLatestManifest(): Promise<{ key: string; manifest: BackupManifest } | null> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix,
      }),
    );

    const manifests = (response.Contents || [])
      .filter((obj) => obj.Key?.endsWith(".manifest.json"))
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    const latest = manifests[0];
    if (!latest?.Key) {
      return null;
    }

    const latestKey = latest.Key;
    const body = await this.getObject(latestKey);
    const manifest = JSON.parse(body.toString("utf8")) as BackupManifest;

    return { key: latestKey, manifest };
  }
}
