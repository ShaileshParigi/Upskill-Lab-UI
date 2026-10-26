import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');

export const IS_WIN = process.platform === 'win32';

/**
 * The learning content repo — a sibling of this project. Linux is
 * case-sensitive, so try the usual spellings rather than guessing one.
 * Override with UPSKILL_DIR (see the README for per-shell syntax).
 */
function findContentRoot() {
  if (process.env.UPSKILL_DIR) return path.resolve(process.env.UPSKILL_DIR);
  const parent = path.join(ROOT, '..');
  for (const name of ['Upskill', 'upskill', 'UPSKILL']) {
    const candidate = path.join(parent, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(parent, 'Upskill');
}

export const CONTENT_ROOT = findContentRoot();

export const DATA_DIR = path.join(ROOT, 'data');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const SNIPPETS_DIR = path.join(DATA_DIR, 'snippets');
export const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');

export const PORT = Number(process.env.PORT || 4321);
export const HOST = process.env.HOST || '127.0.0.1';

/**
 * Command used for the embedded Claude terminal. npm on Windows installs a
 * `claude.cmd` shim; the bare name resolves to nothing CreateProcess can run.
 */
export const CLAUDE_BIN = process.env.CLAUDE_BIN || (IS_WIN ? 'claude.cmd' : 'claude');

/** Hard limits for the code runner. */
export const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 20000);
export const RUN_OUTPUT_CAP = Number(process.env.RUN_OUTPUT_CAP || 256 * 1024);

/** Target for the PostgreSQL scratchpad — a throwaway local server by default. */
export const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:admin@localhost:5432/postgres';

for (const dir of [DATA_DIR, RUNS_DIR, SNIPPETS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(CONTENT_ROOT)) {
  console.error(`\n  Content root not found: ${CONTENT_ROOT}`);
  console.error(`  Point UPSKILL_DIR at your Upskill folder:\n`);
  console.error(
    IS_WIN
      ? `    PowerShell   $env:UPSKILL_DIR = "D:\\Learn Daily\\Upskill"; npm start\n    cmd.exe      set "UPSKILL_DIR=D:\\Learn Daily\\Upskill" && npm start\n`
      : `    UPSKILL_DIR=/path/to/Upskill npm start\n`
  );
  process.exit(1);
}

/**
 * Resolve a client-supplied relative path inside CONTENT_ROOT.
 * Throws on traversal attempts or absolute paths escaping the root.
 */
export function safeResolve(relPath = '') {
  const cleaned = String(relPath).replace(/^[/\\]+/, '');
  const abs = path.resolve(CONTENT_ROOT, cleaned);
  const rel = path.relative(CONTENT_ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('Path escapes content root');
    err.status = 400;
    throw err;
  }
  return abs;
}

export function toRel(abs) {
  return path.relative(CONTENT_ROOT, abs).split(path.sep).join('/');
}
