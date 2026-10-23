const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is required.");
  process.exit(1);
}

// Import database client and permissions catalog from compiled output
const dbPackage = require("../dist/index.js");
const { createDatabaseClient, SYSTEM_PERMISSIONS } = dbPackage;

const db = createDatabaseClient(databaseUrl);

async function runIntegrityChecks() {
  console.log("🛡️ Running PostgreSQL Database Integrity and Migration Gate Verification...");

  try {
    // 1. Verify Migration Chain & History in _prisma_migrations
    console.log("1. Verifying _prisma_migrations ledger...");
    const migrationsDir = path.resolve(__dirname, "../prisma/migrations");
    const migrationFolders = fs
      .readdirSync(migrationsDir)
      .filter((file) => fs.statSync(path.join(migrationsDir, file)).isDirectory())
      .sort();

    const appliedMigrations = await db.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM "_prisma_migrations"
      WHERE rolled_back_at IS NULL
      ORDER BY migration_name ASC
    `;

    assert(
      appliedMigrations.length >= migrationFolders.length,
      `Expected at least ${migrationFolders.length} applied migrations, found ${appliedMigrations.length}`,
    );

    const appliedNames = new Set(appliedMigrations.map((m) => m.migration_name));
    for (const folder of migrationFolders) {
      assert(
        appliedNames.has(folder),
        `Migration folder '${folder}' has not been applied to PostgreSQL database!`,
      );
    }

    for (const migration of appliedMigrations) {
      assert(
        migration.finished_at !== null,
        `Migration '${migration.migration_name}' has null finished_at!`,
      );
      assert(
        migration.rolled_back_at === null,
        `Migration '${migration.migration_name}' has been rolled back!`,
      );
      assert(
        migration.applied_steps_count === 1,
        `Migration '${migration.migration_name}' applied_steps_count is not 1!`,
      );
    }
    console.log(
      `   ✔ All ${migrationFolders.length} migrations cleanly recorded in _prisma_migrations.`,
    );

    // 2. Verify Authoritative Permissions
    console.log("2. Verifying authoritative system permissions...");
    const permissionRows = await db.$queryRaw`
      SELECT "key", "description" FROM "permissions"
    `;
    const permissionKeys = new Set(permissionRows.map((r) => r.key));

    assert(
      permissionRows.length >= SYSTEM_PERMISSIONS.length,
      `Expected at least ${SYSTEM_PERMISSIONS.length} permissions in database, found ${permissionRows.length}`,
    );

    for (const p of SYSTEM_PERMISSIONS) {
      assert(
        permissionKeys.has(p.key),
        `Authoritative permission '${p.key}' is missing from the database permissions table!`,
      );
    }
    console.log(`   ✔ All ${SYSTEM_PERMISSIONS.length} authoritative system permissions verified.`);

    // 3. Verify Compound Foreign Key Constraints
    console.log("3. Verifying compound foreign key constraints...");
    const foreignKeys = await db.$queryRaw`
      SELECT conname, relname
      FROM pg_constraint
      JOIN pg_class ON pg_constraint.conrelid = pg_class.oid
      WHERE contype = 'f'
    `;
    const fkNames = new Set(foreignKeys.map((fk) => fk.conname));

    assert(
      fkNames.has("library_loans_school_id_academic_class_id_fkey"),
      "Missing compound foreign key 'library_loans_school_id_academic_class_id_fkey' on library_loans",
    );
    assert(
      fkNames.has("library_reservations_school_id_academic_class_id_fkey"),
      "Missing compound foreign key 'library_reservations_school_id_academic_class_id_fkey' on library_reservations",
    );
    console.log("   ✔ Compound foreign keys for Library domain verified.");

    // 4. Verify Performance & Partial Unique Indexes
    console.log("4. Verifying performance foreign key indexes & partial unique indexes...");
    const indexRows = await db.$queryRaw`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    `;
    const indexNames = new Set(indexRows.map((i) => i.indexname));

    const requiredIndexes = [
      "assessments_school_grading_scale_idx",
      "attendance_records_school_reason_idx",
      "student_fee_charges_school_fee_structure_idx",
      "attendance_registers_school_date_type_idx",
      "financial_payments_school_received_idx",
      "student_fee_charges_school_created_idx",
      "library_loans_school_checkout_returned_idx",
      "school_subscriptions_one_current_per_school_key",
      "staff_employments_one_current_per_staff_key",
      "timetables_one_published_per_year_key",
      "library_loans_active_copy_key",
      "library_loans_school_academic_class_idx",
      "library_reservations_school_academic_class_idx",
    ];

    for (const idx of requiredIndexes) {
      assert(indexNames.has(idx), `Missing required index '${idx}' in PostgreSQL database!`);
    }
    console.log("   ✔ Required performance and partial unique indexes verified.");

    // 5. Verify Custom Triggers
    console.log("5. Verifying custom PostgreSQL database triggers...");
    const triggerRows = await db.$queryRaw`
      SELECT trigger_name FROM information_schema.triggers
    `;
    const triggerNames = new Set(triggerRows.map((t) => t.trigger_name));

    const requiredTriggers = [
      "attendance_records_register_type_trigger",
      "grading_bands_no_overlap",
      "assessment_results_consistency",
    ];

    for (const trig of requiredTriggers) {
      assert(
        triggerNames.has(trig),
        `Missing required custom trigger '${trig}' in PostgreSQL database!`,
      );
    }
    console.log("   ✔ Required custom PostgreSQL database triggers verified.");

    // 6. Smoke Test Tenant-Isolation Referential Integrity
    console.log("6. Verifying cross-school compound foreign key rejection...");
    const testSchoolAId = crypto.randomUUID();
    const testSchoolBId = crypto.randomUUID();
    const testClassId = crypto.randomUUID();
    const testYearId = crypto.randomUUID();
    const testItemId = crypto.randomUUID();
    const testCopyId = crypto.randomUUID();
    const testLoanId = crypto.randomUUID();

    try {
      // Create School A and School B
      await db.school.createMany({
        data: [
          { id: testSchoolAId, name: "Test School A" },
          { id: testSchoolBId, name: "Test School B" },
        ],
      });

      // Create Academic Year and Class in School A
      await db.academicYear.create({
        data: {
          id: testYearId,
          schoolId: testSchoolAId,
          name: "2026",
          nameKey: "2026",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-12-31"),
        },
      });

      await db.academicClass.create({
        data: {
          id: testClassId,
          schoolId: testSchoolAId,
          academicYearId: testYearId,
          name: "Grade 1A",
          nameKey: "grade-1a",
        },
      });

      // Create Library Item and Copy in School B
      await db.libraryItem.create({
        data: {
          id: testItemId,
          schoolId: testSchoolBId,
          title: "Introduction to Biology",
        },
      });

      await db.libraryCopy.create({
        data: {
          id: testCopyId,
          schoolId: testSchoolBId,
          itemId: testItemId,
        },
      });

      // Attempt to create a LibraryLoan in School B referencing AcademicClass in School A
      let crossSchoolRejected = false;
      try {
        await db.libraryLoan.create({
          data: {
            id: testLoanId,
            schoolId: testSchoolBId,
            itemId: testItemId,
            copyId: testCopyId,
            academicClassId: testClassId, // MISMATCHED SCHOOL CLASS!
            dueOn: new Date(Date.now() + 86400000),
          },
        });
      } catch {
        crossSchoolRejected = true;
      }

      assert(
        crossSchoolRejected,
        "Tenant isolation failure: Cross-school library loan creation was NOT rejected by compound foreign key!",
      );
      console.log("   ✔ Cross-school loan correctly rejected by compound foreign key constraint.");
    } finally {
      // Clean up test records in reverse order
      await db.libraryLoan
        .deleteMany({ where: { schoolId: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
      await db.libraryCopy
        .deleteMany({ where: { schoolId: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
      await db.libraryItem
        .deleteMany({ where: { schoolId: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
      await db.academicClass
        .deleteMany({ where: { schoolId: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
      await db.academicYear
        .deleteMany({ where: { schoolId: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
      await db.school
        .deleteMany({ where: { id: { in: [testSchoolAId, testSchoolBId] } } })
        .catch(() => {});
    }

    console.log("✅ All PostgreSQL database production-readiness checks PASSED successfully!");
  } finally {
    await db.$disconnect();
  }
}

runIntegrityChecks().catch((err) => {
  console.error("❌ Database integrity check failed:", err);
  process.exit(1);
});
