import test from 'node:test';
import assert from 'node:assert/strict';
import { startDatabase } from './postgres.mjs';
test('all migrations install on native PostgreSQL and runtime has no privileged role', async () => {
  const db = await startDatabase(); const sql = db.connect();
  try {
    const [role] = await sql`select rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    assert.equal(role.rolsuper, false); assert.equal(role.rolbypassrls, false);
    assert.equal((await sql`select * from fairshare.planning_periods`).length, 0);
  } finally { await sql.end(); await db.stop(); }
});
