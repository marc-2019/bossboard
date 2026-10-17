// Compile the actual helper and its TypeScript tests into an isolated temporary directory.
import ts from 'typescript';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const dir = mkdtempSync(join(tmpdir(), 'bb-safe-redirect-'));
try {
  for (const file of ['src/lib/safe-redirect', 'tests/safe-redirect.test']) {
    const out = join(dir, `${file}.js`);
    mkdirSync(join(out, '..'), { recursive: true });
    writeFileSync(out, ts.transpileModule(readFileSync(new URL(`../${file}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText);
  }
  createRequire(import.meta.url)(join(dir, 'tests/safe-redirect.test.js'));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
