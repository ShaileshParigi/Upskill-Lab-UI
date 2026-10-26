import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { sql } from '@codemirror/lang-sql';
import { cpp } from '@codemirror/lang-cpp';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { java } from '@codemirror/legacy-modes/mode/clike';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { api } from '../api.js';
import { IconPlay, IconSpark, IconClose } from './Icons.jsx';
import { k } from '../lib/keys.js';

const EXT = {
  java: () => StreamLanguage.define(java),
  python: () => python(),
  javascript: () => javascript(),
  sql: () => sql(),
  postgres: () => sql(),
  c: () => cpp(),
  cpp: () => cpp(),
  bash: () => StreamLanguage.define(shell),
};

const ORDER = ['java', 'postgres', 'bash', 'python', 'javascript', 'sql', 'c', 'cpp'];
// Shown when the open lesson has no runnable code (dashboard, quizzes, plain notes).
const CORE = ['java', 'bash', 'postgres'];
const draftKey = (lang) => `lab:draft:${lang}`;

export default function Lab({ languages, hints = [], theme, onAsk, pending, onPendingConsumed }) {
  const [lang, setLang] = useState('java');
  const [added, setAdded] = useState([]); // languages pulled in from the "+" menu
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const [code, setCode] = useState('');
  const [stdin, setStdin] = useState('');
  const [showStdin, setShowStdin] = useState(false);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  const langs = useMemo(
    () => ORDER.filter((id) => languages[id]).map((id) => languages[id]),
    [languages]
  );

  // Tabs: what this lesson uses (or the core set), plus the current language and anything added.
  // Everything else stays reachable through "+", so the bar isn't eight tabs wide.
  const shown = useMemo(() => {
    const base = hints.length ? hints : CORE;
    return [...new Set([...base, lang, ...added])].filter((id) => languages[id]);
  }, [hints, lang, added, languages]);
  const more = ORDER.filter((id) => languages[id] && !shown.includes(id));

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !moreRef.current?.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [moreOpen]);

  // Load a per-language draft, falling back to the starter snippet.
  const loadLang = (id) => {
    setLang(id);
    const saved = localStorage.getItem(draftKey(id));
    setCode(saved ?? languages[id]?.starter ?? '');
    setResult(null);
  };

  useEffect(() => {
    // Open on the lesson's main language if it's installed; otherwise prefer Java, then
    // whichever toolchain is actually installed.
    const fromLesson = hints.find((id) => languages[id]?.available);
    const firstReady = ORDER.find((id) => languages[id]?.available);
    loadLang(fromLesson || (languages.java?.available ? 'java' : firstReady || 'java'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languages]);

  useEffect(() => {
    if (code) localStorage.setItem(draftKey(lang), code);
  }, [code, lang]);

  // Code sent over from a lesson's code block.
  useEffect(() => {
    if (!pending) return;
    setLang(pending.language);
    setCode(pending.code);
    setResult(null);
    onPendingConsumed?.();
  }, [pending, onPendingConsumed]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await api.run({ language: lang, code: codeRef.current, stdin });
      setResult(res);
    } catch (err) {
      setResult({ ok: false, stderr: String(err.message), exitCode: -1, ms: 0, phase: 'run' });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const extensions = useMemo(() => [EXT[lang]?.() ?? []], [lang]);

  const askAboutOutput = () => {
    const out = (result?.stderr || result?.stdout || '').slice(0, 600);
    onAsk(
      `I ran this ${lang} snippet in my scratchpad and got this output. Explain what's happening: CODE: ${codeRef.current
        .replace(/\s+/g, ' ')
        .slice(0, 700)} OUTPUT: ${out.replace(/\s+/g, ' ')}`
    );
  };

  return (
    <div className="lab">
      <div className="lab-bar">
        <div className="lang-tabs">
          {shown.map((id) => {
            const l = languages[id];
            return (
              <button
                key={id}
                className={`lang-tab ${lang === id ? 'active' : ''}`}
                disabled={!l?.available}
                title={l?.available ? l.label : `${l?.label || id} not installed`}
                onClick={() => loadLang(id)}
              >
                {l?.label || id}
              </button>
            );
          })}
        </div>

        {more.length > 0 && (
          <div className="lang-more" ref={moreRef}>
            <button
              className={`btn sm ghost ${moreOpen ? 'on' : ''}`}
              title="Other languages"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
            >
              + {more.length} more
            </button>
            {moreOpen && (
              <div className="lang-menu" role="menu">
                {more.map((id) => {
                  const l = languages[id];
                  return (
                    <button
                      key={id}
                      role="menuitem"
                      className="lang-menu-item"
                      disabled={!l.available}
                      title={l.available ? l.label : `${l.label} not installed`}
                      onClick={() => {
                        setAdded((a) => [...a, id]);
                        loadLang(id);
                        setMoreOpen(false);
                      }}
                    >
                      {l.label}
                      {!l.available && <small>not installed</small>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="lab-actions">
          <button className={`btn sm ${showStdin ? 'on' : ''}`} onClick={() => setShowStdin((s) => !s)}>
            stdin
          </button>
          <button
            className="btn sm"
            onClick={() => {
              localStorage.removeItem(draftKey(lang));
              setCode(languages[lang]?.starter || '');
              setResult(null);
            }}
          >
            Reset
          </button>
          <button className="btn sm primary" onClick={run} disabled={running}>
            {running ? <span className="spin" /> : <IconPlay width={12} height={12} />}
            {running ? 'Running' : 'Run'}
            <span className="kbd" style={{ marginLeft: 2 }}>{k('Enter')}</span>
          </button>
        </div>
      </div>

      <div className="lab-split">
        <div className="lab-editor">
          <CodeMirror
            value={code}
            height="100%"
            theme={theme === 'dark' ? githubDark : githubLight}
            extensions={extensions}
            onChange={setCode}
            basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: true, highlightActiveLine: true }}
          />
        </div>

        <div className="lab-out">
          {showStdin && (
            <div className="stdin-box">
              <textarea
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder="stdin — piped into the program"
              />
            </div>
          )}

          <div className="lab-out-head">
            <strong style={{ fontSize: 11.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
              Output
            </strong>
            {result && (
              <>
                <span className={result.ok ? 'badge-ok' : 'badge-bad'}>
                  {result.timedOut
                    ? 'timed out'
                    : result.phase === 'build'
                      ? 'build failed'
                      : `exit ${result.exitCode}`}
                </span>
                <span style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>{result.ms} ms</span>
                {result.truncated && <span style={{ color: 'var(--warn)' }}>truncated</span>}
                <div style={{ flex: 1 }} />
                <button className="btn ghost sm" onClick={askAboutOutput}>
                  <IconSpark width={12} height={12} /> Explain
                </button>
                <button className="btn ghost sm" onClick={() => setResult(null)}>
                  <IconClose width={12} height={12} />
                </button>
              </>
            )}
          </div>

          <div className="lab-out-body">
            {!result && <span className="out-empty">Run the snippet to see output here.</span>}
            {result?.stdout && <span>{result.stdout}</span>}
            {result?.stderr && <span className="out-stderr">{result.stderr}</span>}
            {result && !result.stdout && !result.stderr && (
              <span className="out-empty">
                {result.timedOut ? 'Killed after the time limit.' : 'No output.'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
