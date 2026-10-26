import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Markdown from './Markdown.jsx';
import { k } from '../lib/keys.js';
import { extractHeadings, stripTitle, oneLine, titleOf, shortTitle, hasPrimer } from '../lib/md.js';
import {
  IconCheck,
  IconStar,
  IconEdit,
  IconSpark,
  IconClock,
  IconList,
  IconClose,
  IconArrowLeft,
  IconArrowRight,
} from './Icons.jsx';

function SelectionBubble({ onAsk }) {
  const [bubble, setBubble] = useState(null);

  useEffect(() => {
    const onUp = (e) => {
      if (e.target.closest?.('.ask-bubble')) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (!text || text.length < 8 || !sel.rangeCount) return setBubble(null);
      // Answers in the floating quick-ask panel are .md too, but they have their own actions.
      if (!e.target.closest?.('.md') || e.target.closest?.('.floating-ask')) return setBubble(null);

      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setBubble({
        text,
        top: Math.max(8, rect.top - 46),
        left: Math.min(window.innerWidth - 250, Math.max(8, rect.left + rect.width / 2 - 110)),
      });
    };
    const onDown = (e) => {
      if (!e.target.closest?.('.ask-bubble')) setBubble(null);
    };

    document.addEventListener('mouseup', onUp);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  if (!bubble) return null;

  const fire = (mode) => {
    onAsk(mode, bubble.text);
    setBubble(null);
    window.getSelection()?.removeAllRanges();
  };

  return createPortal(
    <div className="ask-bubble" style={{ top: bubble.top, left: bubble.left }}>
      <button onClick={() => fire('explain')}>
        <IconSpark width={13} height={13} /> Explain
      </button>
      <button onClick={() => fire('example')}>Example</button>
      <button onClick={() => fire('why')}>Why?</button>
    </div>,
    document.body
  );
}

export default function Reader({
  file,
  meta,
  completed,
  bookmarked,
  onToggleComplete,
  onToggleBookmark,
  onEdit,
  onRunCode,
  onAsk,
  onQuickAsk,
  prev,
  next,
  onOpen,
  onCompleteNext,
}) {
  const [activeId, setActiveId] = useState(null);
  // Scroll progress is written straight to the bar's style: going through React state would
  // re-render the whole lesson on every scroll frame.
  const barRef = useRef(null);
  const setBar = (p) => {
    const bar = barRef.current;
    if (!bar) return;
    bar.style.setProperty('--p', p);
    bar.style.opacity = p > 0 ? '1' : '0';
  };
  const [showToc, setShowToc] = useState(() => localStorage.getItem('showToc') !== '0');
  const mainRef = useRef(null);

  useEffect(() => localStorage.setItem('showToc', showToc ? '1' : '0'), [showToc]);

  const headings = useMemo(() => extractHeadings(file.content), [file.content]);
  const body = useMemo(() => stripTitle(file.content), [file.content]);
  const title = titleOf(file.content, file.path.split('/').pop());

  // Scroll spy over the rendered headings.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll('h2[id], h3[id]')];
    if (!nodes.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0 }
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
  }, [body]);

  // The pane scrolls, not the reader. On open: jump back to where you stopped (unless the
  // lesson is finished), otherwise start at the top. While reading: track progress.
  const completedRef = useRef(completed);
  completedRef.current = completed;
  useEffect(() => {
    const scroller = mainRef.current?.closest('.content');
    if (!scroller) return;
    const key = `scroll:${file.path}`;
    const read = () => {
      try {
        return Number(localStorage.getItem(key)) || 0;
      } catch {
        return 0;
      }
    };

    const saved = completedRef.current ? 0 : read();
    scroller.scrollTo({ top: 0 });
    setBar(0);
    // Markdown lays out after this effect, so retry once the content has height.
    const t = saved > 200 ? [0, 150].map((ms) => setTimeout(() => scroller.scrollTo({ top: saved }), ms)) : [];

    let save;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const max = scroller.scrollHeight - scroller.clientHeight;
      setBar(max > 0 ? Math.min(1, scroller.scrollTop / max) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
      clearTimeout(save);
      save = setTimeout(() => {
        try {
          localStorage.setItem(key, String(Math.round(scroller.scrollTop)));
        } catch {
          /* storage unavailable */
        }
      }, 250);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      t.forEach(clearTimeout);
      clearTimeout(save);
    };
  }, [file.path]);

  // A finished lesson should reopen at the top, not wherever you stopped.
  useEffect(() => {
    if (!completed) return;
    try {
      localStorage.removeItem(`scroll:${file.path}`);
    } catch {
      /* storage unavailable */
    }
  }, [completed, file.path]);

  const askAbout = (mode, text) => {
    const snippet = oneLine(text);
    const prompts = {
      explain: `In @${file.path}, explain this in more depth, from first principles: "${snippet}"`,
      example: `Give me a concrete worked example of this from @${file.path}: "${snippet}"`,
      why: `Why is this true / why does it work this way? From @${file.path}: "${snippet}"`,
    };
    onAsk(prompts[mode] || prompts.explain);
  };

  // Stable callbacks keep <Markdown> from re-rendering the whole lesson when only the TOC's
  // active heading (or other Reader state) changes.
  const latest = useRef({});
  latest.current = { onAsk, onRunCode, path: file.path };
  const askCode = useCallback(
    (raw) =>
      latest.current.onAsk(
        `Walk me through this snippet from @${latest.current.path} line by line: "${oneLine(raw, 700)}"`
      ),
    []
  );
  const runCode = useCallback((lang, code) => latest.current.onRunCode?.(lang, code), []);

  const jump = (id) => (e) => {
    e.preventDefault();
    const el = mainRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  const primer = hasPrimer(body);
  const jumpToPrimer = () => {
    const box = mainRef.current?.querySelector('details.prime');
    if (!box) return;
    box.open = true;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasToc = headings.length > 2;

  return (
    <div className={`reader ${hasToc && showToc ? 'with-toc' : ''}`}>
      <div className="read-progress" aria-hidden="true">
        <i ref={barRef} />
      </div>
      <div className="reader-main" ref={mainRef}>
        <header className="reader-head">
          <div className="reader-kicker">
            {meta && (
              <>
                <span className={`chip ${meta.kind}`}>{meta.kind}</span>
                <span>Day {meta.day}{meta.sub ? `.${meta.sub}` : ''}</span>
                <span className="crumb-sep">·</span>
              </>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconClock width={13} height={13} />
              {meta ? `${meta.minutes} min read` : file.path}
            </span>
            {meta?.qaCount > 0 && (
              <>
                <span className="crumb-sep">·</span>
                <span>{meta.qaCount} Q&A</span>
              </>
            )}
          </div>

          <h1>{title}</h1>

          <div className="reader-tools">
            <div className="tool-group">
              <button className={`btn sm ${completed ? 'on' : ''}`} onClick={onToggleComplete}>
                <IconCheck width={13} height={13} />
                {completed ? 'Completed' : 'Mark complete'}
              </button>
              <button className={`btn sm ${bookmarked ? 'on' : ''}`} onClick={onToggleBookmark}>
                <IconStar width={13} height={13} />
                {bookmarked ? 'Saved' : 'Save'}
              </button>
              <button className="btn sm" onClick={onEdit}>
                <IconEdit width={13} height={13} /> Edit
              </button>
              {hasToc && (
                <button
                  className={`btn sm ${showToc ? 'on' : ''}`}
                  onClick={() => setShowToc((v) => !v)}
                  title="Toggle the on-this-page outline"
                >
                  <IconList width={13} height={13} /> Contents
                </button>
              )}
            </div>

            <div className="tool-group end">
              <button className="btn sm" onClick={() => onAsk(`Quiz me on @${file.path}. Ask one question at a time.`)}>
                Quiz me
              </button>
              <button
                className="btn sm"
                onClick={() => onAsk(`Summarise the key takeaways from @${file.path} in 5 bullets.`)}
              >
                Recap
              </button>
              <button className="btn sm primary" onClick={onQuickAsk} title={`Quick question  ${k('/')}`}>
                <IconSpark width={13} height={13} /> Ask Claude
              </button>
            </div>
          </div>
        </header>

        <Markdown source={body} onRunCode={onRunCode ? runCode : undefined} onAskCode={askCode} />

        {primer && (
          <aside className="recall">
            <div>
              <b>Back to the questions</b>
              <p>Close the page in your head — can you answer them now, without scrolling up?</p>
            </div>
            <div className="recall-acts">
              <button className="btn sm" onClick={jumpToPrimer}>
                Re-read them
              </button>
              <button
                className="btn sm primary"
                onClick={() =>
                  onAsk(
                    `Quiz me on @${file.path}, starting with its "Before you read" questions. One at a time; tell me where I'm wrong.`
                  )
                }
              >
                <IconSpark width={13} height={13} /> Quiz me on these
              </button>
            </div>
          </aside>
        )}

        {(prev || next) && (
          <footer className="lesson-nav">
            {prev ? (
              <button className="lesson-nav-btn prev" onClick={() => onOpen(prev.path)}>
                <IconArrowLeft width={15} height={15} />
                <span>
                  <small>Previous</small>
                  {shortTitle(prev.title)}
                </span>
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button
                className={`lesson-nav-btn next ${completed ? '' : 'primary'}`}
                onClick={() => (completed ? onOpen(next.path) : onCompleteNext(next.path))}
              >
                <span>
                  <small>{completed ? 'Next' : 'Mark complete & continue'}</small>
                  {shortTitle(next.title)}
                </span>
                <IconArrowRight width={15} height={15} />
              </button>
            ) : (
              !completed && (
                <button className="lesson-nav-btn next primary" onClick={onToggleComplete}>
                  <span>
                    <small>Last lesson</small>
                    Mark complete
                  </span>
                  <IconCheck width={15} height={15} />
                </button>
              )
            )}
          </footer>
        )}

      </div>

      {hasToc && showToc && (
        <nav className="toc">
          <div className="toc-label">
            On this page
            <button className="toc-hide" onClick={() => setShowToc(false)} title="Hide">
              <IconClose width={12} height={12} />
            </button>
          </div>
          {headings.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              className={`${h.level === 3 ? 'h3' : ''} ${activeId === h.id ? 'active' : ''}`}
              onClick={jump(h.id)}
            >
              {h.text}
            </a>
          ))}
        </nav>
      )}

      <SelectionBubble onAsk={askAbout} />
    </div>
  );
}
