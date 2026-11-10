import EmbeddedPostgres from 'embedded-postgres';
import postgres from 'postgres';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';

export async function startDatabase() {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const password = randomUUID();
  const databaseDir = await mkdtemp(join(tmpdir(), 'fairshare-pg-'));
  const server = new EmbeddedPostgres({ databaseDir, user: 'postgres', password, port,
    persistent: true, authMethod: 'scram-sha-256', postgresFlags: ['-h', '127.0.0.1'],
    autoRehydrateSymlinks: true, onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const admin = postgres({ host: '127.0.0.1', port, username: 'postgres', password, database: 'postgres', max: 4, onnotice: () => {} });
  try {
    await admin.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY)');
    const dir = new URL('../../supabase/migrations/', import.meta.url);
    const migrationConnection = await admin.reserve();
    try { for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) await migrationConnection.unsafe(await readFile(new URL(file, dir), 'utf8')); }
    finally { migrationConnection.release(); }
    // Generated fixture-only password, never written to logs or source.
    await admin.unsafe(`ALTER ROLE fairshare_runtime LOGIN PASSWORD '${password}'`);
  } catch (e) { await admin.end(); await server.stop(); throw e; }
  const connect = () => postgres({ host: '127.0.0.1', port, username: 'fairshare_runtime', password, database: 'postgres', max: 1, prepare: false, onnotice: () => {} });
  return { admin, connect, async stop() { await admin.end(); await server.stop(); } };
}
