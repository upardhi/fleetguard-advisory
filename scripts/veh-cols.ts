import { db } from "../app/_server/db/client";
type Row = Record<string, unknown>;
const cols = await (db as unknown as (s: TemplateStringsArray) => Promise<Row[]>)`SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicles' ORDER BY ordinal_position`;
console.log(cols.map((c: Row) => c.column_name).join(', '));
await (db as unknown as { end: () => Promise<void> }).end();
