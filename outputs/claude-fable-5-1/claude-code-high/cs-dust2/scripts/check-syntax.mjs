// Syntax-checks every .ts file under src using Node's TypeScript stripper (no tsc available offline).
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk('src');
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--check', f], { stdio: 'pipe' });
  } catch (e) {
    bad++;
    console.log('== ' + f);
    console.log(String(e.stderr).split('\n').slice(0, 12).join('\n'));
  }
}
console.log(`${files.length} .ts files checked, ${bad} with syntax errors`);
process.exit(bad ? 1 : 0);
