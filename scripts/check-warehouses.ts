import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.SUPABASE_POOLER_URL!, { ssl: { rejectUnauthorized: false }, prepare: false });
  const rows = await sql`SELECT name, city, state, lat, lng, org_id FROM warehouses LIMIT 20`;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main();
