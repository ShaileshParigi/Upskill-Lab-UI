import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';
import { api, askStream } from '../api.js';
import { IconSpark, IconClose, IconChevron, IconCopy, IconCheck, IconTerminal, IconPlus } from './Icons.jsx';
import { k } from '../lib/keys.js';

const MAX_HISTORY = 6;

/**
 * A quick-question bar pinned to the bottom of the reading pane. Answers stream
 * in a panel above it and are never written anywhere on their own — saving one
 * into the lesson's Q&A is a separate, explicit click.
 */
export default function FloatingAsk({ path, title, canSave, focusToken, onRunCode, onOpenTerminal, toast }) {
  const [turns, setTurns] = useState([]);
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef(null);
  const bodyRef = useRef(null);
  const stickRef = useRef(true);
  const abortRef = useRef(null);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const patch = useCallback((id, fn) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...fn(t) } : t))), []);

  // Ctrl+/ (or the lesson's "Ask Claude" button) lands the cursor here.
  useEffect(() => {
    if (!focusToken) return;
    inputRef.current?.focus();
    if (turnsRef.current.length) setExpanded(true);
  }, [focusToken]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow the answer as it streams, unless the reader scrolled up to re-read.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [turns, expanded]);

  const onBodyScroll = (e) => {
    const el = e.currentTarget;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const stop = () => abortRef.current?.abort();

  const send = async () => {
    const question = text.trim();
    if (!question || busy) return;

    const id = Math.random().toString(36).slice(2);
    const history = turnsRef.current
      .filter((t) => t.a && !t.error)
      .slice(-MAX_HISTORY)
      .map((t) => ({ q: t.q, a: t.a }));

    setTurns((ts) => [...ts, { id, q: question, a: '', status: 'Thinking…', path, title, done: false }]);
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setExpanded(true);
    setBusy(true);
    stickRef.current = true;

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      await askStream(
        { path, question, history },
        (ev) => {
          if (ev.t === 'delta') patch(id, (t) => ({ a: t.a + ev.d, status: '' }));
          else if (ev.t === 'status') patch(id, () => ({ status: ev.d }));
          else if (ev.t === 'error') patch(id, () => ({ error: ev.d, status: '', done: true }));
          else if (ev.t === 'done') patch(id, () => ({ status: '', done: true }));
        },
        ctl.signal
      );
      patch(id, (t) => (t.done ? {} : { status: '', done: true }));
    } catch (e) {
      if (e.name === 'AbortError') patch(id, () => ({ status: '', done: true, stopped: true }));
      else patch(id, () => ({ error: e.message, status: '', done: true }));
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape') {
      if (busy) stop();
      else if (expanded) setExpanded(false);
      else e.currentTarget.blur();
    }
  };

  const saveToLesson = async (t) => {
    try {
      await api.addQA(t.path, t.q, t.a);
      patch(t.id, () => ({ saved: true }));
      toast?.('Added to this lesson’s Q&A');
    } catch (e) {
      toast?.(e.message, 'err');
    }
  };

  const copy = async (t) => {
    try {
      await navigator.clipboard.writeText(t.a);
      patch(t.id, () => ({ copied: true }));
      setTimeout(() => patch(t.id, () => ({ copied: false })), 1400);
    } catch {
      toast?.('Could not copy', 'err');
    }
  };

  const showPanel = expanded && turns.length > 0;

  return (
    <div className="floating-ask">
      {showPanel && (
        <section className="fa-panel" aria-label="Quick answers">
          <header className="fa-head">
            <IconSpark width={13} height={13} style={{ color: 'var(--primary)' }} />
            <span className="fa-head-title">Quick ask</span>
            {title && <span className="fa-head-ctx">· {title}</span>}
            <div style={{ flex: 1 }} />
            <button className="btn ghost sm" onClick={() => setTurns([])} disabled={busy} title="Clear this conversation">
              Clear
            </button>
            <button className="btn ghost sm" onClick={() => setExpanded(false)} title="Collapse  Esc">
              <IconClose width={13} height={13} />
            </button>
          </header>

          <div className="fa-body" ref={bodyRef} onScroll={onBodyScroll}>
            {turns.map((t) => (
              <div className="fa-turn" key={t.id}>
                <div className="fa-q">{t.q}</div>

                <div className="fa-a">
                  {t.a && <Markdown source={t.a} onRunCode={onRunCode} />}
                  {!t.done && (
                    <div className="fa-status">
                      <span className="spin" /> {t.status || 'Answering…'}
                    </div>
                  )}
                  {t.error && <div className="fa-error">{t.error}</div>}
                  {t.stopped && <div className="fa-note">Stopped.</div>}
                </div>

                {t.done && t.a && (
                  <div className="fa-actions">
                    <button
                      className={`btn ghost sm ${t.saved ? 'on' : ''}`}
                      disabled={t.saved || !t.path || !canSave}
                      onClick={() => saveToLesson(t)}
                      title={
                        !t.path
                          ? 'Open a lesson to save answers into it'
                          : !canSave
                            ? 'Close the editor first'
                            : 'Append this question and answer to the lesson’s Q&A section'
                      }
                    >
                      {t.saved ? <IconCheck width={13} height={13} /> : <IconPlus width={13} height={13} />}
                      {t.saved ? 'Added to lesson' : 'Add to lesson Q&A'}
                    </button>
                    <button className="btn ghost sm" onClick={() => copy(t)}>
                      {t.copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
                      {t.copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      className="btn ghost sm"
                      onClick={() => onOpenTerminal(t.path ? `About @${t.path}: ${t.q}` : t.q)}
                      title="Take this to the full Claude terminal"
                    >
                      <IconTerminal width={13} height={13} /> Continue in terminal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <form
        className={`fa-bar ${busy ? 'busy' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <IconSpark width={15} height={15} className="fa-icon" />
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            grow(e.target);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => turns.length && setExpanded(true)}
          placeholder={path ? 'Ask a quick question about this lesson…' : 'Ask Claude a quick question…'}
          aria-label="Ask Claude a quick question"
        />
        {!expanded && turns.length > 0 && (
          <button type="button" className="fa-count" onClick={() => setExpanded(true)} title="Show answers">
            {turns.length} {turns.length === 1 ? 'answer' : 'answers'}
          </button>
        )}
        {busy ? (
          <button type="button" className="btn sm" onClick={stop} title="Stop  Esc">
            Stop
          </button>
        ) : (
          <>
            <span className="kbd fa-kbd">{k('/')}</span>
            <button className="btn primary sm" type="submit" disabled={!text.trim()}>
              Ask <IconChevron width={13} height={13} />
            </button>
          </>
        )}
      </form>
    </div>
  );
}
