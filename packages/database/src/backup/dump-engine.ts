import { spawn } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

export interface DumpResult {
  dumpBuffer: Buffer;
  appliedMigrationsCount: number;
  lastMigration: string | null;
  method: "pg_dump" | "internal_logical_exporter";
}

/**
 * Checks if pg_dump CLI is executable on PATH.
 */
function isPgDumpAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("pg_dump", ["--version"]);
      proc.on("error", () => resolve(false));
      proc.on("close", (code: number | null) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

/**
 * Executes native pg_dump against the target PostgreSQL database.
 */
function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      "--dbname",
      databaseUrl,
      "--no-owner",
      "--no-privileges",
      "--clean",
      "--if-exists",
      "--format=p",
      "--encoding=UTF8",
    ];

    const proc = spawn("pg_dump", args);
    const chunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    proc.stdout.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    proc.stderr.on("data", (chunk: Buffer | string) => stderrChunks.push(Buffer.from(chunk)));

    proc.on("error", (err: Error) =>
      reject(new Error(`Failed to execute pg_dump: ${err.message}`)),
    );
    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8");
        reject(new Error(`pg_dump exited with error code ${code}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

/**
 * Internal fallback logical SQL dump engine when pg_dump is not present.
 * Inspects all public tables, queries rows, and serializes into standard SQL.
 */
async function runInternalLogicalExporter(prisma: PrismaClient): Promise<Buffer> {
  const chunks: string[] = [];
  chunks.push("-- Elimara School OS Internal Logical Backup\n");
  chunks.push(`-- Generated: ${new Date().toISOString()}\n\n`);
  chunks.push("BEGIN;\n\n");

  // Query tables
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename ASC
  `;

  for (const { tablename } of tables) {
    if (tablename === "spatial_ref_sys") continue;

    // Fetch column metadata
    const columns = await prisma.$queryRaw<Array<{ column_name: string; data_type: string }>>`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = ${tablename}
      ORDER BY ordinal_position ASC
    `;

    if (columns.length === 0) continue;

    const colNames = columns.map((c) => `"${c.column_name}"`).join(", ");
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM "${tablename}";`,
    );

    chunks.push(`-- Table: ${tablename} (${rows.length} rows)\n`);
    for (const row of rows) {
      const values = columns.map((c) => {
        const val = row[c.column_name];
        if (val === null || val === undefined) return "NULL";
        if (typeof val === "number" || typeof val === "boolean") return String(val);
        if (val instanceof Date) return `'${val.toISOString()}'`;
        if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      chunks.push(`INSERT INTO "${tablename}" (${colNames}) VALUES (${values.join(", ")});\n`);
    }
    chunks.push("\n");
  }

  chunks.push("COMMIT;\n");
  return Buffer.from(chunks.join(""), "utf8");
}

/**
 * Generates a logical dump of the target database, automatically selecting
 * pg_dump if available or falling back to the internal logical exporter.
 */
export async function createDatabaseDump(
  databaseUrl: string,
  prisma: PrismaClient,
): Promise<DumpResult> {
  // Query migration metadata
  const migrations = await prisma.$queryRaw<
    Array<{ migration_name: string; finished_at: Date | null }>
  >`
    SELECT migration_name, finished_at FROM "_prisma_migrations" 
    WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL
    ORDER BY started_at ASC
  `;

  const appliedMigrationsCount = migrations.length;
  const lastMigration =
    migrations.length > 0 ? (migrations[migrations.length - 1]?.migration_name ?? null) : null;

  const hasPgDump = await isPgDumpAvailable();
  if (hasPgDump) {
    const dumpBuffer = await runPgDump(databaseUrl);
    return {
      dumpBuffer,
      appliedMigrationsCount,
      lastMigration,
      method: "pg_dump",
    };
  }

  const dumpBuffer = await runInternalLogicalExporter(prisma);
  return {
    dumpBuffer,
    appliedMigrationsCount,
    lastMigration,
    method: "internal_logical_exporter",
  };
}
