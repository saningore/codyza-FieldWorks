import postgres from "postgres";

if (process.env.FIELDWORKS_USE_FIXTURES === "1") {
  throw new Error("FIELDWORKS_USE_FIXTURES=1 is refused. FieldWorks does not serve fixture data.");
}

const globalForSql = globalThis as unknown as { fieldworks?: postgres.Sql };

const databaseUrl = process.env.DATABASE_URL ?? "";
const pooled = /pooler\.supabase\.com|:6543|pgbouncer=true/i.test(databaseUrl);

export const sql =
  globalForSql.fieldworks ??
  postgres(databaseUrl, {
    max: pooled ? 1 : 8,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: !pooled,
    connection: { search_path: "public,extensions,app" },
  });

if (process.env.NODE_ENV !== "production") globalForSql.fieldworks = sql;

export type Tx = postgres.TransactionSql<Record<string, never>>;

export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', '', true)`;
    return fn(tx);
  });
}

export async function withOrg<T>(userId: string, orgId: string, fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
