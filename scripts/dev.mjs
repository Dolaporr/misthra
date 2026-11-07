import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
const processes = [
  spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', env: { ...process.env, APP_ORIGIN: process.env.APP_ORIGIN || 'http://127.0.0.1:5173' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: root, stdio: 'inherit' }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return; closing = true;
  for (const child of processes) child.kill('SIGTERM');
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of processes) child.on('exit', code => { if (!closing) stop(code || 0); });
