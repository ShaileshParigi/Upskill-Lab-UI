import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { CONTENT_ROOT, CLAUDE_BIN, IS_WIN } from '../config.js';
import { track } from './progress.js';

let pty = null;
try {
  pty = (await import('node-pty')).default;
} catch {
  console.warn('[terminal] node-pty unavailable — terminal panel will be disabled');
}

const SCROLLBACK_CAP = 400 * 1024;

/**
 * Long-lived pty sessions keyed by id. They outlive websocket connections so a
 * browser refresh reattaches to the same Claude conversation instead of
 * starting a new one.
 */
const sessions = new Map();

/**
 * ConPTY launches processes with CreateProcess, which cannot execute a `.cmd`
 * or `.bat` shim — those are scripts, not images. Wrap them in cmd.exe.
 */
function winLaunch(cmd, args = []) {
  if (!IS_WIN) return [cmd, args];
  return /\.(cmd|bat)$/i.test(cmd) ? ['cmd.exe', ['/d', '/s', '/c', cmd, ...args]] : [cmd, args];
}

function firstExisting(...paths) {
  return paths.find((p) => p && fs.existsSync(p)) || null;
}

/** The native shell: PowerShell on Windows, the login shell everywhere else. */
function nativeShell() {
  if (!IS_WIN) return [process.env.SHELL || 'bash', ['-l']];
  const root = process.env.SystemRoot || 'C:\\Windows';
  const pwsh = firstExisting(
    path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe')
  );
  if (pwsh) return [pwsh, ['-NoLogo']];
  return [path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoLogo']];
}

/** Git Bash — a real POSIX shell on Windows, without WSL's path translation. */
function gitBash() {
  const root = process.env.ProgramW6432 || process.env.PROGRAMFILES || 'C:\\Program Files';
  return firstExisting(
    path.join(root, 'Git', 'bin', 'bash.exe'),
    path.join('C:\\Program Files', 'Git', 'bin', 'bash.exe')
  );
}

const PROFILES = {
  claude: {
    title: 'Claude',
    build: () => winLaunch(CLAUDE_BIN),
  },
  shell: {
    title: IS_WIN ? 'PowerShell' : 'Shell',
    build: () => nativeShell(),
  },
  // Windows-only extras. `wsl` is where the Linux phases actually happen —
  // lessons say `apt`, `systemctl`, `/proc`, and those need a real distro.
  ...(IS_WIN
    ? {
        wsl: {
          title: 'Ubuntu (WSL)',
          build: () => [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wsl.exe'), []],
        },
        gitbash: {
          title: 'Git Bash',
          build: () => {
            const bin = gitBash();
            return bin ? [bin, ['-i', '-l']] : nativeShell();
          },
        },
      }
    : {}),
};

/** Profiles the UI may offer on this OS. */
export function listProfiles() {
  return Object.entries(PROFILES).map(([id, p]) => ({ id, title: p.title }));
}

/**
 * If this server was itself launched from inside a Claude Code session, the CLI
 * we spawn inherits that session's internal markers and starts degraded — it
 * treats itself as a child session and turns transcript saving off. Drop those
 * markers so the embedded terminal is always a clean top-level session.
 * Auth (`ANTHROPIC_*`) and user config are deliberately left alone.
 */
function cleanEnv() {
  const drop = (k) =>
    k === 'CLAUDECODE' ||
    k.startsWith('CLAUDE_CODE_') ||
    k === 'CLAUDE_AGENT_SDK_VERSION' ||
    k === 'CLAUDE_EFFORT' ||
    k === 'CLAUDE_PID';

  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !drop(k)));
}

export function terminalAvailable() {
  return pty !== null;
}

function createSession(id, profileId, { cols = 100, rows = 30 } = {}) {
  const profile = PROFILES[profileId] || PROFILES.shell;
  const [cmd, args] = profile.build();

  const proc = pty.spawn(cmd, args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: CONTENT_ROOT,
    // ConPTY is the modern Windows backend; winpty is the fallback on builds
    // that lack it. Ignored on POSIX.
    useConpty: process.env.UPSKILL_NO_CONPTY !== '1',
    env: {
      ...cleanEnv(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      // Tell the CLI it's inside the lab; harmless if unused.
      UPSKILL_LAB: '1',
    },
  });

  const session = {
    id,
    profile: profileId,
    title: profile.title,
    proc,
    cols,
    rows,
    buffer: '',
    clients: new Set(),
    alive: true,
    startedAt: Date.now(),
  };

  proc.onData((data) => {
    session.buffer += data;
    if (session.buffer.length > SCROLLBACK_CAP) {
      session.buffer = session.buffer.slice(-SCROLLBACK_CAP);
    }
    broadcast(session, { t: 'o', d: data });
  });

  proc.onExit(({ exitCode, signal }) => {
    session.alive = false;
    broadcast(session, { t: 'exit', code: exitCode, signal });
    sessions.delete(id);
  });

  sessions.set(id, session);
  return session;
}

function broadcast(session, msg) {
  const payload = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({
    id: s.id,
    profile: s.profile,
    title: s.title,
    alive: s.alive,
    clients: s.clients.size,
    startedAt: s.startedAt,
  }));
}

export function killSession(id) {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.proc.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(id);
  return true;
}

/**
 * Returns a `noServer` websocket server. The caller routes upgrades to it —
 * binding several WebSocketServers to one http server makes each destroy the
 * sockets meant for the others.
 */
export function createTerminalWss() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, req) => {
    if (!pty) {
      ws.send(JSON.stringify({ t: 'fatal', d: 'node-pty is not installed on the server' }));
      ws.close();
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const profileId = url.searchParams.get('profile') || 'claude';
    const id = url.searchParams.get('id') || `${profileId}-1`;
    const cols = Number(url.searchParams.get('cols')) || 100;
    const rows = Number(url.searchParams.get('rows')) || 30;

    let session = sessions.get(id);
    const fresh = !session;
    if (!session) session = createSession(id, profileId, { cols, rows });

    session.clients.add(ws);

    ws.send(
      JSON.stringify({
        t: 'ready',
        id: session.id,
        profile: session.profile,
        fresh,
        replay: fresh ? '' : session.buffer,
      })
    );

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (msg.t) {
        case 'i':
          if (session.alive) session.proc.write(msg.d);
          break;
        case 'r':
          if (session.alive && msg.cols > 0 && msg.rows > 0) {
            session.cols = msg.cols;
            session.rows = msg.rows;
            try {
              session.proc.resize(msg.cols, msg.rows);
            } catch {
              /* pty may have just exited */
            }
          }
          break;
        case 'ask':
          // A prompt composed by the UI: type it, then submit on a short delay
          // so the CLI's input handler sees paste-then-enter, not one blob.
          if (session.alive) {
            session.proc.write(msg.d);
            if (msg.submit !== false) setTimeout(() => session.alive && session.proc.write('\r'), 60);
            track('asks');
          }
          break;
        case 'clear':
          session.buffer = '';
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      session.clients.delete(ws);
    });
  });

  return wss;
}
