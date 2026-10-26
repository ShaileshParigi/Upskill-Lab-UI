import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { RUNS_DIR, RUN_TIMEOUT_MS, RUN_OUTPUT_CAP, DATABASE_URL } from '../config.js';

const IS_WIN = process.platform === 'win32';

/** Compiled C/C++ output. Windows won't execute an extensionless file. */
const A_OUT = IS_WIN ? 'a.exe' : 'a.out';

/** `D:\a b\main.sh` -> `/mnt/d/a b/main.sh` (WSL's default mount layout). */
export function toWslPath(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (!m) return p.split('\\').join('/');
  return `/mnt/${m[1].toLowerCase()}/${m[2].split('\\').join('/')}`;
}

const isWsl = (argv) => /wsl(\.exe)?$/i.test(argv[0]);

/**
 * Bash on Windows, best first:
 *
 *  1. WSL — a real Ubuntu, which is where the Linux phases happen anyway. It
 *     also kills cleanly: Git Bash's MSYS layer orphans grandchildren at birth
 *     (a `sleep` is reparented off the tree before it ever runs), so a timeout
 *     can't reap them, while WSL tears the whole command down with the relay.
 *  2. Git Bash — always present with Git for Windows, no distro needed.
 *  3. Whatever `bash` resolves to on PATH.
 */
function bashCandidates() {
  if (!IS_WIN) return [['bash']];
  const out = [[path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe'), '-e', 'bash']];
  const roots = [
    process.env.ProgramW6432,
    process.env.PROGRAMFILES,
    process.env['ProgramFiles(x86)'],
    'C:\\Program Files',
  ];
  const seen = new Set();
  for (const root of roots) {
    if (!root || seen.has(root)) continue;
    seen.add(root);
    out.push([path.join(root, 'Git', 'bin', 'bash.exe')]);
  }
  out.push(['bash']);
  return out;
}

/**
 * Java's public class name must match the filename, so the scratchpad names the
 * file after whatever class the snippet declares instead of forcing `Main`.
 */
function javaFileName(code) {
  const pub = code.match(/\bpublic\s+(?:final\s+|abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
  const any = code.match(/\bclass\s+([A-Za-z_$][\w$]*)/);
  return `${(pub || any)?.[1] || 'Main'}.java`;
}

/**
 * Each language lists candidate interpreters in preference order — the first
 * one that answers `versionArgs` with exit 0 wins and is cached. This is what
 * keeps Windows working: `python3.exe` there is usually the Microsoft Store
 * stub, which prints an ad and exits non-zero, so `python` has to come first.
 */
export const LANGUAGES = {
  java: {
    label: 'Java',
    ext: 'java',
    mode: 'java',
    candidates: [['javac']],
    versionArgs: ['-version'],
    fileName: javaFileName,
    build: (bin, f, dir) => [bin[0], [...bin.slice(1), '-d', dir, f]],
    run: (_bin, f, dir) => ['java', ['-cp', dir, path.basename(f, '.java')]],
    starter: `// Java scratchpad — name the class whatever you like.
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        var names = List.of("ada", "lin", "rae", "kai");

        var byLength = names.stream()
                .collect(Collectors.groupingBy(String::length));

        byLength.forEach((len, group) -> System.out.println(len + " -> " + group));
    }
}
`,
  },
  python: {
    label: 'Python',
    ext: 'py',
    mode: 'python',
    candidates: IS_WIN ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']],
    versionArgs: ['--version'],
    run: (bin, f) => [bin[0], [...bin.slice(1), '-u', f]],
    starter: `# Python scratchpad\nfor i in range(5):\n    print(i, i ** 2)\n`,
  },
  javascript: {
    label: 'Node.js',
    ext: 'mjs',
    mode: 'javascript',
    candidates: [['node']],
    versionArgs: ['--version'],
    run: (bin, f) => [bin[0], [...bin.slice(1), f]],
    starter: `// Node scratchpad\nconsole.log([1, 2, 3].map((n) => n * 2));\n`,
  },
  bash: {
    label: 'Bash',
    ext: 'sh',
    mode: 'shell',
    candidates: bashCandidates(),
    versionArgs: ['--version'],
    // `wsl -l -q` confirms a distro exists without booting one; asking wsl for
    // `--version` says nothing about whether there's a Linux to run bash in.
    probeArgsFor: (argv) => (isWsl(argv) ? ['-l', '-q'] : ['--version']),
    run: (bin, f) => [bin[0], [...bin.slice(1), isWsl(bin) ? toWslPath(f) : f]],
    starter: `#!/usr/bin/env bash\nset -euo pipefail\n\necho "hello from $(uname -sr)"\nls -la | head -5\n`,
  },
  sql: {
    label: 'SQLite',
    ext: 'sql',
    mode: 'sql',
    candidates: [['sqlite3']],
    versionArgs: ['--version'],
    // -box gives readable table output; the db is per-run and thrown away.
    run: (bin, f, dir) => [bin[0], [...bin.slice(1), '-box', path.join(dir, 'scratch.db'), `.read ${f.split(path.sep).join('/')}`]],
    starter: `CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, team TEXT);\nINSERT INTO users (name, team) VALUES ('ada', 'infra'), ('lin', 'infra'), ('rae', 'ml');\n\nSELECT team, COUNT(*) AS n FROM users GROUP BY team ORDER BY n DESC;\n`,
  },
  postgres: {
    label: 'PostgreSQL',
    ext: 'sql',
    mode: 'sql',
    candidates: [['psql']],
    versionArgs: ['--version'],
    // Runs against a live server — start one with the Compose file in the
    // Docker phase, or override DATABASE_URL.
    // The conninfo must be passed with -d: psql's grammar is
    // `psql [OPTION]... [DBNAME [USERNAME]]`, so a bare connection string is
    // positional and everything after it gets swallowed as extra arguments.
    run: (bin, f) => [bin[0], [...bin.slice(1), '-v', 'ON_ERROR_STOP=1', '-f', f, '-d', DATABASE_URL]],
    starter: `-- Runs against DATABASE_URL (default: postgres@localhost:5432/postgres).
-- Start one first:  docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

CREATE TEMP TABLE orders (id serial PRIMARY KEY, tenant text, total numeric);
INSERT INTO orders (tenant, total) VALUES ('acme', 120), ('acme', 80), ('globex', 45);

SELECT tenant, count(*) AS n, sum(total) AS revenue
FROM orders
GROUP BY tenant
ORDER BY revenue DESC;
`,
  },
  c: {
    label: 'C',
    ext: 'c',
    mode: 'cpp',
    candidates: [['gcc']],
    versionArgs: ['--version'],
    build: (bin, f, dir) => [bin[0], [...bin.slice(1), '-O0', '-g', '-Wall', f, '-o', path.join(dir, A_OUT)]],
    run: (_bin, _f, dir) => [path.join(dir, A_OUT), []],
    starter: `#include <stdio.h>\n\nint main(void) {\n    printf("hello from C\\n");\n    return 0;\n}\n`,
  },
  cpp: {
    label: 'C++',
    ext: 'cpp',
    mode: 'cpp',
    candidates: [['g++']],
    versionArgs: ['--version'],
    build: (bin, f, dir) => [bin[0], [...bin.slice(1), '-O0', '-g', '-std=c++17', f, '-o', path.join(dir, A_OUT)]],
    run: (_bin, _f, dir) => [path.join(dir, A_OUT), []],
    starter: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{1, 2, 3};\n    for (int n : v) std::cout << n * n << " ";\n    std::cout << "\\n";\n}\n`,
  },
};

/**
 * `.cmd`/`.bat` shims (mvn, gradle, npm) are not executables — CreateProcess
 * can't run them, and since Node 20 spawn refuses to unless a shell is asked
 * for explicitly.
 */
function spawnOpts(cmd, extra = {}) {
  const needsShell = IS_WIN && /\.(cmd|bat)$/i.test(cmd);
  return { ...extra, shell: needsShell, windowsHide: true };
}

let availability = null;

/** Probe each toolchain once at boot so the UI can grey out what's missing. */
export async function detectLanguages() {
  if (availability) return availability;

  // `probeArgsFor` replaces the whole argument list, so a candidate like
  // `wsl.exe -e bash` can be probed as `wsl.exe -l -q` instead.
  const tryCandidate = (argv, cfg) =>
    new Promise((resolve) => {
      const [cmd, ...pre] = argv;
      const args = cfg.probeArgsFor ? cfg.probeArgsFor(argv) : [...pre, ...cfg.versionArgs];
      let p;
      try {
        p = spawn(cmd, args, spawnOpts(cmd, { stdio: 'ignore' }));
      } catch {
        return resolve(false);
      }
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    });

  const entries = await Promise.all(
    Object.entries(LANGUAGES).map(async ([id, cfg]) => {
      let bin = null;
      for (const candidate of cfg.candidates) {
        if (await tryCandidate(candidate, cfg)) {
          bin = candidate;
          break;
        }
      }
      cfg.bin = bin;
      return [
        id,
        { id, label: cfg.label, ext: cfg.ext, mode: cfg.mode, available: bin !== null, starter: cfg.starter },
      ];
    })
  );

  availability = Object.fromEntries(entries);
  return availability;
}

function execute(cmd, args, { cwd, stdin, timeout, env }) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;

    let child;
    try {
      child = spawn(
        cmd,
        args,
        spawnOpts(cmd, {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          // POSIX: put the child in its own process group so the timeout can
          // kill the whole tree. Without it, `bash script.sh` running `sleep 30`
          // ignores SIGTERM until its foreground child finishes. Windows has no
          // process groups — `taskkill /T` walks the tree instead (see below).
          detached: !IS_WIN,
        })
      );
    } catch (err) {
      return resolve({ code: -1, stdout: '', stderr: String(err.message), ms: 0, timedOut: false });
    }

    const killTree = (signal) => {
      if (IS_WIN) {
        // /T kills the child and every descendant, /F skips the polite ask.
        // child.kill() alone is not enough: it terminates bash.exe but leaves
        // the `sleep` it was waiting on running, which then keeps going.
        try {
          const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
          // An unhandled 'error' event on a ChildProcess throws.
          tk.on('error', () => {
            try {
              child.kill();
            } catch {
              /* already reaped */
            }
          });
        } catch {
          try {
            child.kill();
          } catch {
            /* already reaped */
          }
        }
        // 'close' waits for EOF on the pipes, not just for the process to exit,
        // and a killed grandchild can leave the inherited stdout handle open —
        // that hangs the run for the full sleep. Let output flush, then force
        // the streams shut so the promise settles.
        setTimeout(() => {
          child.stdout?.destroy();
          child.stderr?.destroy();
        }, 300);
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          /* already reaped */
        }
      }
    };

    const cap = (buf, chunk) => {
      if (buf.length >= RUN_OUTPUT_CAP) {
        truncated = true;
        return buf;
      }
      return buf + chunk;
    };

    child.stdout.on('data', (d) => (stdout = cap(stdout, d.toString())));
    child.stderr.on('data', (d) => (stderr = cap(stderr, d.toString())));

    const timer = setTimeout(() => {
      timedOut = true;
      // SIGTERM first so the process can flush, then SIGKILL if it clings on.
      // taskkill is already forceful, so Windows only needs the one pass.
      killTree('SIGTERM');
      if (!IS_WIN) setTimeout(() => killTree('SIGKILL'), 1500);
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(err.message), ms: Date.now() - started, timedOut });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        code: code === null ? -1 : code,
        signal,
        stdout,
        stderr,
        truncated,
        timedOut,
        ms: Date.now() - started,
      });
    });

    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export async function runCode({ language, code, stdin = '', timeout = RUN_TIMEOUT_MS }) {
  const cfg = LANGUAGES[language];
  if (!cfg) {
    const err = new Error(`Unknown language: ${language}`);
    err.status = 400;
    throw err;
  }

  await detectLanguages();
  if (!cfg.bin) {
    const err = new Error(`${cfg.label} is not installed on this machine`);
    err.status = 400;
    throw err;
  }

  const dir = await fs.mkdtemp(path.join(RUNS_DIR, 'run-'));
  const name = typeof cfg.fileName === 'function' ? cfg.fileName(code) : `main.${cfg.ext}`;
  const file = path.join(dir, name);
  await fs.writeFile(file, code, 'utf8');

  const env = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    HOME: os.homedir(),
    TERM: 'dumb',
  };
  const limit = Math.min(Number(timeout) || RUN_TIMEOUT_MS, 120000);

  try {
    if (cfg.build) {
      const [bcmd, bargs] = cfg.build(cfg.bin, file, dir);
      const built = await execute(bcmd, bargs, { cwd: dir, timeout: limit, env });
      if (built.code !== 0) {
        return {
          phase: 'build',
          ok: false,
          exitCode: built.code,
          stdout: built.stdout,
          stderr: built.stderr || 'Compilation failed',
          ms: built.ms,
          timedOut: built.timedOut,
        };
      }
    }

    const [rcmd, rargs] = cfg.run(cfg.bin, file, dir);
    const res = await execute(rcmd, rargs, { cwd: dir, stdin, timeout: limit, env });
    return {
      phase: 'run',
      ok: res.code === 0 && !res.timedOut,
      exitCode: res.code,
      signal: res.signal,
      stdout: res.stdout,
      stderr: res.stderr,
      truncated: res.truncated,
      timedOut: res.timedOut,
      ms: res.ms,
    };
  } finally {
    // Windows keeps a lock on a just-exited .exe for a moment, so retry.
    fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}
