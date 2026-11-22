import { spawn } from 'node:child_process';
import path from 'node:path';

const directory = path.resolve(process.argv[2] || '');
const root = path.resolve('.test-data') + path.sep;
if (!directory.startsWith(root) || !path.basename(directory).startsWith('tour-')) throw Error('Expected an isolated tour test cluster');
const command = path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
const child = spawn(command, ['-D', directory, '-m', 'fast', '-w', '-t', '15', 'stop'], { windowsHide:true, stdio:'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
