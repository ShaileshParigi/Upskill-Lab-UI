import { spawn } from 'node:child_process';
import { CONTENT_ROOT, CLAUDE_BIN, IS_WIN } from '../config.js';
import { track } from './progress.js';

const TIMEOUT_MS = Number(process.env.ASK_TIMEOUT_MS || 120000);
const MAX_TURNS = 6;
const MAX_ANSWER_CHARS = 2000;

// One line, no double quotes or percent signs: on Windows this travels through
// cmd.exe (the claude shim is a .cmd), which mangles all three.
const SYSTEM =
  'Quick-question mode inside a study app. Answer the question directly, in plain words, ' +
  'and match the length to the question: a one-line question gets a short answer, and nothing goes past about 150 words ' +
  'unless the reader asks to go deeper. Add a code snippet only when it clarifies more than prose would, and skip the recap. ' +
  'If a lesson file is named and the question depends on it, read it for context. ' +
  'Do not write or edit any files, do not append to the lesson, and do not use the full lesson format. ' +
  'The reader decides separately whether an answer is saved to the lesson.';

function buildPrompt({ path, history = [], question }) {
  const parts = [];
  if (path) parts.push(`The reader is looking at the lesson file ${path} (relative to your working directory).`);

  const turns = history.slice(-MAX_TURNS).filter((t) => t?.q && t?.a);
  if (turns.length) {
    parts.push(
      'Earlier in this conversation:\n' +
        turns.map((t) => `Q: ${t.q}\nA: ${String(t.a).slice(0, MAX_ANSWER_CHARS)}`).join('\n\n')
    );
  }
  parts.push(`Question: ${question}`);
  return parts.join('\n\n');
}

/** Same trick as the terminal: ConPTY-style launchers cannot run a .cmd shim directly. */
function launch(args) {
  if (IS_WIN && /\.(cmd|bat)$/i.test(CLAUDE_BIN)) return ['cmd.exe', ['/d', '/s', '/c', CLAUDE_BIN, ...args]];
  return [CLAUDE_BIN, args];
}

function cleanEnv() {
  const drop = (k) =>
    k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_AGENT_SDK_VERSION' || k === 'CLAUDE_EFFORT' || k === 'CLAUDE_PID';
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !drop(k)));
}

/**
 * Runs one headless `claude -p` turn and reports it through callbacks.
 * Read-only tools, no session saved, so a quick question can never edit a
 * lesson and never shows up in `claude --resume`. Returns a cancel function.
 */
export function askClaude({ path, history, question }, { onStatus, onDelta, onDone, onError }) {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--tools', 'Read,Grep,Glob',
    '--append-system-prompt', SYSTEM,
  ];
  const [cmd, cmdArgs] = launch(args);

  let finished = false;
  let gotText = false;
  let stderr = '';
  let buf = '';

  const finish = (fn, ...a) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    fn?.(...a);
  };

  let proc;
  try {
    proc = spawn(cmd, cmdArgs, { cwd: CONTENT_ROOT, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    onError?.(`Could not start claude: ${e.message}`);
    return () => {};
  }

  const timer = setTimeout(() => {
    proc.kill();
    finish(onError, 'Claude took too long to answer — try a narrower question.');
  }, TIMEOUT_MS);

  proc.on('error', (e) =>
    finish(onError, e.code === 'ENOENT' ? `Could not find the claude CLI (${CLAUDE_BIN}). Set CLAUDE_BIN.` : e.message)
  );

  proc.stderr.on('data', (d) => {
    stderr += d;
  });

  const handle = (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.type === 'stream_event') {
      const ev = msg.event;
      if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        gotText = true;
        onDelta?.(ev.delta.text);
      } else if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
        onStatus?.(ev.content_block.name === 'Read' ? 'Reading the lesson…' : 'Looking through the notes…');
      }
    } else if (msg.type === 'result') {
      if (msg.is_error) {
        finish(onError, msg.result || 'Claude returned an error.');
      } else {
        // Nothing streamed (e.g. a very short reply) — fall back to the final text.
        if (!gotText && msg.result) onDelta?.(msg.result);
        track('asks');
        finish(onDone);
      }
    }
  };

  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) handle(line);
    }
  });

  proc.on('close', (code) => {
    if (buf.trim()) handle(buf.trim());
    if (!finished) {
      finish(onError, stderr.trim().split('\n').pop() || `claude exited with code ${code} before answering.`);
    }
  });

  proc.stdin.on('error', () => {});
  proc.stdin.end(buildPrompt({ path, history, question }));

  return () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    proc.kill();
  };
}
