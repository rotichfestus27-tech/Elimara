const fs = require("node:fs");
const path = require("node:path");

const adminUrl = process.env.ADMIN_DATABASE_URL || process.env.DIRECT_URL;
if (!adminUrl) {
  console.error("❌ ADMIN_DATABASE_URL or DIRECT_URL environment variable is required.");
  process.exit(1);
}

const { createDatabaseClient } = require("../dist/index.js");
const prisma = createDatabaseClient(adminUrl);

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (char === "$" && nextChar === "$") {
      inDollarQuote = !inDollarQuote;
      current += "$$";
      i++;
      continue;
    }

    if (char === ";" && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith("--")) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const finalTrimmed = current.trim();
  if (finalTrimmed && !finalTrimmed.startsWith("--")) {
    statements.push(finalTrimmed);
  }

  return statements;
}

async function provisionRoles() {
  console.log(
    "🔐 Provisioning least-privilege PostgreSQL roles (elimara_migrator and elimara_app)...",
  );
  const sqlPath = path.resolve(__dirname, "neon-roles-provisioning.sql");
  const rawSql = fs.readFileSync(sqlPath, "utf8");
  const statements = splitStatements(rawSql);

  try {
    for (const stmt of statements) {
      if (!stmt || stmt.startsWith("--")) continue;
      await prisma.$executeRawUnsafe(stmt);
    }
    console.log(
      "✅ Roles 'elimara_migrator' and 'elimara_app' successfully provisioned with least-privilege boundaries.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

provisionRoles().catch((err) => {
  console.error("❌ Role provisioning failed:", err.message || err);
  process.exit(1);
});
