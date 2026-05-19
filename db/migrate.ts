import postgres from "postgres";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Uses direct (non-pooled) connection for DDL migrations
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: "require",
  max: 1,
  onnotice: () => {},
});

async function run() {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL      PRIMARY KEY,
      filename   TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const migrationsDir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const [applied] = await sql`
      SELECT id FROM _migrations WHERE filename = ${filename}
    `;
    if (applied) {
      console.log(`  skip  ${filename}`);
      continue;
    }

    console.log(`  apply ${filename} ...`);
    const content = readFileSync(join(migrationsDir, filename), "utf-8");

    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO _migrations (filename) VALUES (${filename})`;
    });

    console.log(`  done  ${filename}`);
  }

  await sql.end();
  console.log("\nAll migrations complete.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
