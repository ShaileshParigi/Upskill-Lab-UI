async function req(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body ? { 'content-type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  meta: () => req('/api/meta'),
  tree: () => req('/api/tree'),
  plan: () => req('/api/plan'),
  progress: () => req('/api/progress'),

  read: (path, { track = true } = {}) =>
    req(`/api/file?path=${encodeURIComponent(path)}${track ? '' : '&track=0'}`),
  write: (path, content) => req('/api/file', { method: 'PUT', body: { path, content } }),
  create: (body) => req('/api/file/new', { method: 'POST', body }),
  createPhase: (body) => req('/api/file/phase', { method: 'POST', body }),

  search: (q) => req(`/api/search?q=${encodeURIComponent(q)}`),

  complete: (path, done) => req('/api/progress/complete', { method: 'POST', body: { path, done } }),
  bookmark: (path) => req('/api/progress/bookmark', { method: 'POST', body: { path } }),

  // Only called when the reader chooses to keep an answer — asking never edits a lesson.
  addQA: (path, question, answer) => req('/api/file/qa', { method: 'POST', body: { path, question, answer } }),

  languages: () => req('/api/languages'),
  run: (body) => req('/api/run', { method: 'POST', body }),
};

/**
 * Quick question to Claude. Streams the answer: calls onEvent with
 * {t:'status'|'delta'|'done'|'error', d}. Abort the signal to stop it.
 */
export async function askStream(body, onEvent, signal) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {
          /* ignore a malformed frame */
        }
      }
    }
  }
}

/** Reconnecting websocket for filesystem change events. */
export function watchEvents(onEvent) {
  let ws;
  let timer;
  let closed = false;

  const connect = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/events`);
    ws.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onclose = () => {
      if (!closed) timer = setTimeout(connect, 1500);
    };
    ws.onerror = () => ws.close();
  };

  connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    ws?.close();
  };
}
