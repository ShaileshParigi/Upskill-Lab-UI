import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const THEME = {
  background: '#1b1918',
  foreground: '#e5deda',
  cursor: '#f5a97f',
  cursorAccent: '#1b1918',
  selectionBackground: 'rgba(143,168,255,0.32)',
  black: '#3d3733',
  red: '#ff8a8a',
  green: '#7ddba3',
  yellow: '#e8d27a',
  blue: '#7c9cff',
  magenta: '#c589ff',
  cyan: '#7fd4e8',
  white: '#c8cfdd',
  brightBlack: '#6c7689',
  brightRed: '#ffa5a5',
  brightGreen: '#98e8bb',
  brightYellow: '#f2e29a',
  brightBlue: '#9db4ff',
  brightMagenta: '#d6a6ff',
  brightCyan: '#a0e3f2',
  brightWhite: '#f2f5fa',
};

/**
 * An xterm view bound to a server-side pty session. Sessions are keyed by id
 * and outlive this component, so switching tabs or reloading the page
 * reattaches to the same Claude conversation instead of restarting it.
 */
const MAX_AUTO_RETRIES = 4;

export default function TerminalPane({ profile, sessionId, visible, queue, onConsumed, quickActions }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const wsRef = useRef(null);
  const readyRef = useRef(false);
  const retriesRef = useRef(0);
  const [status, setStatus] = useState('connecting');
  // Bumping this re-runs the socket effect without tearing down the terminal,
  // so a reconnect keeps whatever scrollback is already on screen.
  const [generation, setGeneration] = useState(0);

  const reconnect = () => {
    retriesRef.current = 0;
    setStatus('connecting');
    setGeneration((g) => g + 1);
  };

  // --- boot xterm once, independently of the socket ---
  useEffect(() => {
    const term = new XTerm({
      theme: THEME,
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 12000,
      allowProposedApi: true,
      convertEol: false,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);

    termRef.current = term;
    fitRef.current = fit;

    try {
      fit.fit();
    } catch {
      /* host not laid out yet */
    }

    // Typed input is routed to whatever socket is current, so this survives a
    // reconnect. Silently dropping keystrokes into a dead socket is exactly
    // the failure this component used to have.
    const onData = term.onData((d) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d }));
    });

    const ro = new ResizeObserver(() => {
      if (!hostRef.current?.offsetParent) return;
      try {
        fit.fit();
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'r', cols: term.cols, rows: term.rows }));
        }
      } catch {
        /* mid-layout */
      }
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      onData.dispose();
      term.dispose();
    };
  }, [profile, sessionId]);

  // --- connect (and reconnect) the websocket ---
  useEffect(() => {
    const term = termRef.current;
    if (!term) return undefined;

    let retryTimer = null;
    let disposed = false;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws/terminal?profile=${profile}&id=${encodeURIComponent(
      sessionId
    )}&cols=${term.cols}&rows=${term.rows}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
      setStatus('live');
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'ready') {
        if (msg.replay) term.write(msg.replay);
        // A cold session needs time for the CLI to draw its prompt before it
        // will accept typed input; a reattached one is ready immediately.
        setTimeout(() => {
          readyRef.current = true;
        }, msg.fresh ? 2200 : 150);
      } else if (msg.t === 'o') {
        term.write(msg.d);
      } else if (msg.t === 'exit') {
        setStatus('exited');
        term.write(`\r\n\x1b[38;5;245m── session ended (code ${msg.code}) ──\x1b[0m\r\n`);
        readyRef.current = false;
      } else if (msg.t === 'fatal') {
        setStatus('error');
        term.write(`\r\n\x1b[31m${msg.d}\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => {
      if (disposed) return;
      readyRef.current = false;
      setStatus((s) => {
        // The process ending is a normal outcome, not a lost connection.
        if (s === 'exited' || s === 'error') return s;
        // Most often the server was restarted — retry a few times, then leave
        // it to the user rather than reconnecting forever.
        if (retriesRef.current < MAX_AUTO_RETRIES) {
          const attempt = retriesRef.current + 1;
          retriesRef.current = attempt;
          retryTimer = setTimeout(() => setGeneration((g) => g + 1), Math.min(1000 * 2 ** (attempt - 1), 8000));
          return 'reconnecting';
        }
        return 'closed';
      });
    };

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws.close();
    };
  }, [profile, sessionId, generation]);

  // --- refit + focus when this pane becomes visible ---
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const ws = wsRef.current;
        const term = termRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'r', cols: term.cols, rows: term.rows }));
        }
        term?.focus();
      } catch {
        /* ignore */
      }
    }, 60);
    return () => clearTimeout(id);
  }, [visible]);

  // --- flush queued prompts from elsewhere in the app ---
  useEffect(() => {
    if (!queue?.length) return;
    let cancelled = false;

    const flush = () => {
      if (cancelled) return;
      const ws = wsRef.current;
      if (!readyRef.current || ws?.readyState !== WebSocket.OPEN) {
        setTimeout(flush, 250);
        return;
      }
      for (const text of queue) ws.send(JSON.stringify({ t: 'ask', d: text }));
      onConsumed?.();
    };

    flush();
    return () => {
      cancelled = true;
    };
  }, [queue, onConsumed]);

  const runQuick = (text) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ask', d: text }));
    termRef.current?.focus();
  };

  // Anything other than a live socket means typing goes nowhere, so say so.
  const offline = status === 'closed' || status === 'exited' || status === 'error';
  const notice =
    status === 'exited'
      ? { title: 'Session ended', body: 'The process exited.', action: 'Start a new session' }
      : status === 'error'
        ? { title: 'Terminal unavailable', body: 'The server could not start a session.', action: 'Retry' }
        : { title: 'Disconnected', body: 'Lost the connection — the lab server was probably restarted.', action: 'Reconnect' };

  return (
    <div className="term-wrap" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="term-host" ref={hostRef} />

      {status === 'reconnecting' && <div className="term-banner">Reconnecting…</div>}

      {offline && (
        <div className="term-offline">
          <div>
            <strong style={{ display: 'block', marginBottom: 6, color: 'var(--text-dim)' }}>{notice.title}</strong>
            {notice.body}
            <div style={{ marginTop: 12 }}>
              <button className="btn sm primary" onClick={reconnect}>
                {notice.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {quickActions?.length > 0 && (
        <div className="term-actions">
          {quickActions.map((a) => (
            <button key={a.label} className="quick" title={a.prompt} onClick={() => runQuick(a.prompt)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
