import postgres from "postgres";
const sql = postgres(process.env.DB_URL!, { ssl: { rejectUnauthorized: false }, prepare: false });
const r = await sql`UPDATE adv_watched_routes SET region_id = 'north', updated_at = now()
  WHERE name ILIKE '%Delhi%Kolkata%' AND is_active = true RETURNING name, region_id`;
console.log("Fixed:", r[0]?.name, "→", r[0]?.region_id);
// Final check
const all = await sql`SELECT name, region_id FROM adv_watched_routes WHERE is_active=true ORDER BY region_id, name`;
const byRegion: Record<string, string[]> = {};
all.forEach((r: {name:string;region_id:string}) => { (byRegion[r.region_id] = byRegion[r.region_id]||[]).push(r.name); });
Object.entries(byRegion).forEach(([k,v]) => { console.log("\n"+k.toUpperCase()+":"); v.forEach(n=>console.log("  ",n)); });
await sql.end();
