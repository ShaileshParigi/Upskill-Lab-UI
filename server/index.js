import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';

import { ROOT, CONTENT_ROOT, PORT, HOST, IS_WIN, safeResolve, toRel } from './config.js';
import * as library from './lib/library.js';
import * as progress from './lib/progress.js';
import { runCode, detectLanguages } from './lib/runner.js';
import {
  createTerminalWss,
  terminalAvailable,
  listSessions,
  killSession,
  listProfiles,
} from './lib/terminal.js';
import { askClaude } from './lib/ask.js';
import { renderTemplate, fileNameFor, appendQA, TEMPLATE_KINDS } from './lib/templates.js';

const app = express();
app.use(express.json({ limit: '4mb' }));

const api = express.Router();

/* ---------------------------------------------------------------- content */

api.get('/tree', async (_req, res, next) => {
  try {
    res.json(await library.buildTree());
  } catch (e) {
    next(e);
  }
});

api.get('/file', async (req, res, next) => {
  try {
    const file = await library.readFile(req.query.path);
    if (req.query.track !== '0') progress.track('reads', { path: file.path });
    res.json(file);
  } catch (e) {
    next(e);
  }
});

api.put('/file', async (req, res, next) => {
  try {
    const { path: rel, content } = req.body || {};
    if (typeof rel !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content are required' });
    }
    const saved = await library.writeFile(rel, content);
    progress.track('writes', { path: saved.path });
    res.json(saved);
  } catch (e) {
    next(e);
  }
});

api.post('/file/new', async (req, res, next) => {
  try {
    const { phaseDir, kind = 'lesson', day, sub, title } = req.body || {};
    if (!phaseDir || !day || !title) {
      return res.status(400).json({ error: 'phaseDir, day and title are required' });
    }
    if (!TEMPLATE_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of ${TEMPLATE_KINDS.join(', ')}` });
    }

    const name = fileNameFor({ kind, day: Number(day), sub: sub ? Number(sub) : 0, title });
    const rel = `${phaseDir}/${name}`;
    if (await library.exists(rel)) {
      return res.status(409).json({ error: 'A file with that name already exists', path: rel });
    }

    const content = renderTemplate(kind, { day: Number(day), title });
    const saved = await library.writeFile(rel, content);
    progress.track('writes', { path: saved.path });
    res.json({ ...saved, content });
  } catch (e) {
    next(e);
  }
});

api.post('/file/phase', async (req, res, next) => {
  try {
    const { number, title } = req.body || {};
    if (!number || !title) return res.status(400).json({ error: 'number and title are required' });
    const dir = `phase-${Number(number)}-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    await fs.promises.mkdir(safeResolve(dir), { recursive: true });
    res.json({ dir });
  } catch (e) {
    next(e);
  }
});

api.post('/file/qa', async (req, res, next) => {
  try {
    const { path: rel, question, answer } = req.body || {};
    if (!rel || !question) return res.status(400).json({ error: 'path and question are required' });
    const { content } = await library.readFile(rel);
    const saved = await library.writeFile(rel, appendQA(content, question, answer));
    progress.track('writes', { path: saved.path });
    res.json(saved);
  } catch (e) {
    next(e);
  }
});

/**
 * Quick question to Claude. Streams newline-delimited JSON:
 *   {t:'status'|'delta'|'done'|'error', d?}
 * Nothing is written to the lesson — the client calls /file/qa if the reader
 * decides the answer is worth keeping.
 */
api.post('/ask', (req, res) => {
  const { path: rel, question, history } = req.body || {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (rel) safeResolve(rel);

  res.status(200).set({ 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
  res.flushHeaders();
  const send = (msg) => res.writable && res.write(`${JSON.stringify(msg)}\n`);

  const cancel = askClaude(
    { path: rel, history: Array.isArray(history) ? history : [], question: question.trim().slice(0, 4000) },
    {
      onStatus: (d) => send({ t: 'status', d }),
      onDelta: (d) => send({ t: 'delta', d }),
      onDone: () => {
        send({ t: 'done' });
        res.end();
      },
      onError: (d) => {
        send({ t: 'error', d });
        res.end();
      },
    }
  );
  // The reader closed the panel or sent a new question: stop paying for the old one.
  res.on('close', cancel);
});

api.get('/search', async (req, res, next) => {
  try {
    res.json(await library.search(req.query.q || ''));
  } catch (e) {
    next(e);
  }
});

api.get('/plan', async (_req, res, next) => {
  try {
    res.json(await library.parsePlan());
  } catch (e) {
    next(e);
  }
});

/* --------------------------------------------------------------- progress */

api.get('/progress', (_req, res) => res.json(progress.snapshot()));

api.post('/progress/complete', (req, res) => {
  const { path: rel, done = true } = req.body || {};
  if (!rel) return res.status(400).json({ error: 'path is required' });
  progress.setCompleted(rel, done);
  res.json(progress.snapshot());
});

api.post('/progress/bookmark', (req, res) => {
  const { path: rel } = req.body || {};
  if (!rel) return res.status(400).json({ error: 'path is required' });
  const added = progress.toggleBookmark(rel);
  res.json({ added, ...progress.snapshot() });
});

api.post('/progress/track', (req, res) => {
  const { kind = 'reads', ...meta } = req.body || {};
  res.json(progress.track(kind, meta));
});

/* ----------------------------------------------------------------- runner */

api.get('/languages', async (_req, res, next) => {
  try {
    res.json(await detectLanguages());
  } catch (e) {
    next(e);
  }
});

api.post('/run', async (req, res, next) => {
  try {
    const { language, code, stdin, timeout } = req.body || {};
    if (typeof code !== 'string') return res.status(400).json({ error: 'code is required' });
    const result = await runCode({ language, code, stdin, timeout });
    progress.track('runs', { language });
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/* -------------------------------------------------------------- terminals */

api.get('/terminals', (_req, res) =>
  res.json({ available: terminalAvailable(), profiles: listProfiles(), sessions: listSessions() })
);

api.delete('/terminals/:id', (req, res) => res.json({ killed: killSession(req.params.id) }));

/* ------------------------------------------------------------------- meta */

api.get('/meta', async (_req, res) => {
  res.json({
    contentRoot: CONTENT_ROOT,
    platform: process.platform,
    terminalAvailable: terminalAvailable(),
    profiles: listProfiles(),
    languages: await detectLanguages(),
  });
});

app.use('/api', api);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', err);
  res.status(status).json({ error: err.message || 'Internal error' });
});

/* --------------------------------------------------- static web + startup */

const dist = path.join(ROOT, 'web', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(503)
      .type('html')
      .send('<h1>UI not built</h1><p>Run <code>npm run build</code>, or <code>npm run dev</code> for hot reload.</p>')
  );
}

const server = http.createServer(app);

const terminals = createTerminalWss();
const events = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const target = pathname === '/ws/terminal' ? terminals : pathname === '/ws/events' ? events : null;
  if (!target) return socket.destroy();
  target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
});

/* Live file watching so the library refreshes when Claude writes a lesson. */
const watcher = chokidar.watch(CONTENT_ROOT, {
  ignored: /(^|[/\\])(\.|node_modules|__pycache__)/,
  ignoreInitial: true,
  depth: 3,
});
const notify = (type) => (file) => {
  const msg = JSON.stringify({ t: 'fs', type, path: toRel(file) });
  for (const ws of events.clients) if (ws.readyState === ws.OPEN) ws.send(msg);
};
watcher.on('add', notify('add')).on('change', notify('change')).on('unlink', notify('unlink'));

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`
  Port ${PORT} is already in use — the lab is probably already running.

    open http://${HOST}:${PORT}          use the instance that's up
`);
    console.error(
      IS_WIN
        ? `    $env:PORT=4323; npm run serve         start a second one
    Get-NetTCPConnection -LocalPort ${PORT} | Stop-Process -Id { $_.OwningProcess } -Force
                                          stop the old one
`
        : `    PORT=4323 npm run serve               start a second one
    kill $(lsof -ti tcp:${PORT})            stop the old one
`
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, async () => {
  const langs = await detectLanguages();
  const ready = Object.values(langs).filter((l) => l.available).map((l) => l.label);
  const missing = Object.values(langs).filter((l) => !l.available).map((l) => l.label);
  console.log(`
  upskill lab
  ───────────────────────────────────────────────
  UI          http://${HOST}:${PORT}
  Content     ${CONTENT_ROOT}
  Terminal    ${terminalAvailable() ? listProfiles().map((p) => p.title).join(' · ') : 'unavailable (node-pty missing)'}
  Runner      ${ready.join(', ') || 'none detected'}${missing.length ? `\n  Missing     ${missing.join(', ')}` : ''}
`);
});

// SIGBREAK is Ctrl+Break on Windows; SIGTERM is never raised there but
// registering it is harmless.
for (const sig of IS_WIN ? ['SIGINT', 'SIGBREAK', 'SIGTERM'] : ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    watcher.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  });
}
