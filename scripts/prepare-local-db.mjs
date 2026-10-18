import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const prefix = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state'];
const query = spawnSync(process.execPath, [...prefix, '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'", '--json'], { encoding: 'utf8', env: process.env });
if (query.status !== 0) { process.stderr.write(query.stderr || 'Não foi possível verificar o banco local.\n'); process.exit(query.status || 1); }
const result = JSON.parse(query.stdout);
if (result.some(item => item.results?.some(row => row.name === 'workspaces'))) {
  console.log('Banco local já configurado. Registros preservados.');
} else {
  const migration = spawnSync(process.execPath, [...prefix, '--file', 'drizzle/0000_reflective_ezekiel_stane.sql'], { stdio: 'inherit', env: process.env });
  if (migration.status !== 0) process.exit(migration.status || 1);
}
