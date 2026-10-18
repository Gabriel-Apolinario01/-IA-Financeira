import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const nodeDir = path.dirname(process.execPath);
process.env.Path = nodeDir + path.delimiter + (process.env.Path || process.env.PATH || '');
const npmCandidates = [
  path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'nodejs/node_modules/npm/bin/npm-cli.js'),
  path.join(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
];
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 13)) throw new Error('Instale Node.js 22.13 ou superior para iniciar.');
if (!existsSync('node_modules/vinext')) {
  const npm = npmCandidates.find(existsSync);
  if (!npm) throw new Error('npm não encontrado. Instale Node.js com npm e execute npm ci nesta pasta.');
  console.log('Instalando as dependências. Isso é necessário apenas na primeira execução.');
  run([npm, 'ci', '--include=dev', '--include=optional', '--no-audit', '--no-fund']);
}
if (!existsSync('dist/server/wrangler.json')) run(['scripts/run-framework.mjs', 'build']);
console.log('Preparando o banco local e preservando os registros existentes...');
run(['scripts/prepare-local-db.mjs']);
console.log('\nIniciando o site. Aguarde aparecer "Local: http://127.0.0.1:5173/".');
console.log('Depois abra esse endereço no navegador e escolha Explorar demonstração.');
console.log('Mantenha esta janela aberta enquanto usa o aplicativo. Para encerrar, pressione Ctrl+C.\n');
run(['scripts/run-framework.mjs', 'dev']);
