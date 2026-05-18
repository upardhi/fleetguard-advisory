import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __pg: Sql | undefined;
}

function connect(): Sql {
  const url = process.env.SUPABASE_POOLER_URL;
  if (!url) throw new Error("SUPABASE_POOLER_URL is not set");
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: { rejectUnauthorized: false },
    prepare: false,
  });
}

function client(): Sql {
  return (globalThis.__pg ??= connect());
}

export const db: Sql = new Proxy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (() => {}) as any,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(_, prop) { return (client() as any)[prop]; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply(_, _this, args) { return (client() as any)(...args); },
  },
) as Sql;
