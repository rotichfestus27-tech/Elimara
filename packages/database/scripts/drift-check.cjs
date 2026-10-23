const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is required for drift check.");
  process.exit(1);
}

const dbDir = path.resolve(__dirname, "..");
const prismaBin = path.resolve(dbDir, "node_modules/prisma/build/index.js");
const schemaPath = path.resolve(dbDir, "prisma/schema.prisma");

if (!fs.existsSync(prismaBin)) {
  console.error(`❌ Prisma CLI binary not found at ${prismaBin}`);
  process.exit(1);
}

console.log("🔍 Checking for unexpected schema drift against PostgreSQL database...");

// Known expected differences:
// 1. Custom partial unique indexes maintained via PostgreSQL migrations that Prisma schema cannot express.
// 2. Foreign key constraint naming differences between raw SQL migrations and Prisma datamodel defaults.
// 3. Drop default on permissions.description (added with temporary default for migration backfill).
const EXPECTED_PARTIAL_INDEX_PATTERNS = [
  /RENAME CONSTRAINT/i,
  /ALTER TABLE "permissions" ALTER COLUMN "description" DROP DEFAULT/i,
  /CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"class_streams_school_id_id_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"staff_employments_school_staff_active_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"staff_subject_assignments_unique_active_class"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"staff_subject_assignments_unique_active_stream"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"staff_class_assignments_unique_active"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"timetables_one_published_per_year_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_registers_student_daily_class_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_registers_student_daily_stream_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_registers_student_lesson_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_registers_staff_daily_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_records_unique_student_per_register"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"attendance_records_unique_staff_per_register"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"library_loans_active_copy_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"library_reservations_active_student_item_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"library_reservations_active_staff_item_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"library_reservations_ready_copy_key"/i,
  /DROP INDEX (?:CONCURRENTLY )?(?:IF EXISTS )?(?:"public"\.)?"school_subscriptions_one_current_per_school_key"/i,
];

try {
  const output = execFileSync(
    process.execPath,
    [
      prismaBin,
      "migrate",
      "diff",
      "--from-url",
      databaseUrl,
      "--to-schema-datamodel",
      schemaPath,
      "--script",
    ],
    {
      cwd: dbDir,
      encoding: "utf8",
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));

  const unexpectedStatements = lines.filter((line) => {
    return !EXPECTED_PARTIAL_INDEX_PATTERNS.some((pattern) => pattern.test(line));
  });

  if (unexpectedStatements.length > 0) {
    console.error("❌ Schema drift detected between PostgreSQL database and prisma/schema.prisma:");
    for (const stmt of unexpectedStatements) {
      console.error(`   ${stmt}`);
    }
    console.error("\nRun 'prisma migrate dev' or create a migration to reconcile the drift.");
    process.exit(1);
  }

  console.log(
    "✔ No unexpected schema drift detected. Database schema matches prisma/schema.prisma.",
  );
} catch (error) {
  console.error("❌ Failed to execute prisma migrate diff:", error.stderr || error.message);
  process.exit(1);
}
