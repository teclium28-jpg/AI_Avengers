import postgres from "postgres";

/** Diagnostic only: no business-table reads, writes or schema changes. */
export async function checkDatabaseTransaction(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "verify-full",
    connect_timeout: 5,
    idle_timeout: 5,
    fetch_types: false,
  });

  try {
    // Await sequentially: the transaction pooler does not support pipelining.
    const marker = crypto.randomUUID();
    const result = await sql.begin("read only", async (tx) => {
      await tx`select set_config('statement_timeout', '5000', true)`;
      await tx`select set_config('app.probe_marker', ${marker}, true)`;
      const [role] = await tx`
        select rolname, rolsuper, rolbypassrls,
          exists (
            select 1 from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where c.relowner = r.oid and n.nspname in ('public', 'fairshare')
              and c.relkind in ('r', 'p')
          ) as owns_app_tables
        from pg_catalog.pg_roles r where rolname = current_user
      `;
      if (!role || role.rolsuper || role.rolbypassrls || role.owns_app_tables ||
          ["postgres", "service_role", "supabase_admin"].includes(role.rolname)) {
        throw new Error("Database probe requires a restricted non-owner role");
      }
      const [row] = await tx`
        select 1::int as value,
          current_setting('app.probe_marker') as marker,
          current_setting('transaction_read_only') as read_only
      `;
      if (row?.value !== 1 || row.marker !== marker || row.read_only !== "on") {
        throw new Error("Transaction verification failed");
      }
      return { value: row.value as number, readOnly: true };
    });
    // begin() resolves only after COMMIT succeeds.
    return { status: "committed" as const, ...result };
  } finally {
    await sql.end({ timeout: 1 });
  }
}
