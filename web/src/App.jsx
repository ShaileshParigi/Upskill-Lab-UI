import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, watchEvents } from './api.js';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './components/Dashboard.jsx';
import Reader from './components/Reader.jsx';
import PhaseOverview from './components/PhaseOverview.jsx';
import ShortcutSheet from './components/ShortcutSheet.jsx';
import { k, isTyping } from './lib/keys.js';
import { lessonRunnerLangs } from './lib/md.js';
import TerminalPane from './components/Terminal.jsx';
import FloatingAsk from './components/FloatingAsk.jsx';

// CodeMirror is heavy and only needed once you actually edit or experiment.
const Editor = lazy(() => import('./components/Editor.jsx'));
const Lab = lazy(() => import('./components/Lab.jsx'));

const Loading = () => (
  <div className="empty">
    <div className="spin" />
  </div>
);
import Palette from './components/Palette.jsx';
import NewFileDialog from './components/NewFileDialog.jsx';
import {
  IconHome,
  IconBook,
  IconFlask,
  IconSearch,
  IconTerminal,
  IconSun,
  IconMoon,
  IconSpark,
  IconFlame,
  IconRefresh,
  IconLayout,
  IconExpand,
  IconCollapse,
  IconFocus,
  IconHelp,
  IconClose,
} from './components/Icons.jsx';

const VIEWS = [
  { id: 'today', label: 'Today', Icon: IconHome },
  { id: 'library', label: 'Library', Icon: IconBook },
];

const DOCK_COMPACT = 460;
const DOCK_WIDE = 860;

export default function App() {
  const [view, setView] = useState('today');
  const [tree, setTree] = useState(null);
  const [plan, setPlan] = useState([]);
  const [progress, setProgress] = useState(null);
  const [meta, setMeta] = useState(null);

  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(false);
  // A phase's overview page replaces the lesson in the pane while this is set.
  const [phaseDir, setPhaseDir] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebarOpen') !== '0');

  const [dockOpen, setDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState('claude');
  const [dockWidth, setDockWidth] = useState(() => Number(localStorage.getItem('dockWidth')) || DOCK_COMPACT);
  // The Lab keeps running once opened, so switching dock tabs never loses a draft.
  const [labMounted, setLabMounted] = useState(false);
  // A pane spawns its pty as soon as it mounts, so shells start on first visit
  // rather than booting WSL and PowerShell on every page load.
  const [openTerms, setOpenTerms] = useState(() => new Set(['claude']));

  const [promptQueue, setPromptQueue] = useState([]);
  const [labPending, setLabPending] = useState(null);
  // Lab shows only the languages the open lesson actually uses; the rest sit behind "+".
  const labHints = useMemo(() => lessonRunnerLangs(file?.content), [file?.content]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Focus mode hides every panel without touching their saved open/closed state.
  const [focus, setFocus] = useState(false);
  // Bumped to pull the cursor into the floating quick-ask bar.
  const [askFocus, setAskFocus] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  const filePathRef = useRef(null);
  filePathRef.current = file?.path;

  /* ---------------------------------------------------------- bootstrap */

  const refreshTree = useCallback(() => api.tree().then(setTree).catch(() => {}), []);
  const refreshProgress = useCallback(() => api.progress().then(setProgress).catch(() => {}), []);

  useEffect(() => {
    refreshTree();
    refreshProgress();
    api.plan().then(setPlan).catch(() => {});
    api.meta().then(setMeta).catch(() => {});
  }, [refreshTree, refreshProgress]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Entering the library with nothing open reopens the last lesson (without counting a new read).
  const resumed = useRef(false);
  const lastOpened = progress?.lastOpened;
  useEffect(() => {
    if (resumed.current || view !== 'library' || file || !lastOpened) return;
    resumed.current = true;
    api.read(lastOpened, { track: false }).then(setFile).catch(() => {});
  }, [view, file, lastOpened]);

  useEffect(() => localStorage.setItem('dockWidth', String(dockWidth)), [dockWidth]);

  useEffect(() => localStorage.setItem('sidebarOpen', sidebarOpen ? '1' : '0'), [sidebarOpen]);

  const toast = useCallback((msg, kind) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // The sidebar only exists in the library, so from the dashboard the shortcut
  // takes you there instead of toggling something you cannot see.
  const toggleSidebar = useCallback(() => {
    if (view !== 'library') {
      setView('library');
      setSidebarOpen(true);
      return;
    }
    setSidebarOpen((o) => !o);
  }, [view]);

  /* ------------------------------------------- live reload on fs change */

  useEffect(() => {
    return watchEvents((e) => {
      if (e.t !== 'fs') return;
      refreshTree();
      // Claude just rewrote the file being read — pull the new content in.
      if (e.path === filePathRef.current && e.type === 'change' && !editing) {
        api.read(e.path, { track: false }).then(setFile).catch(() => {});
        toast('Lesson updated');
      }
      if (e.type === 'add' && /day-\d+/.test(e.path)) toast(`New lesson: ${e.path.split('/').pop()}`);
    });
  }, [refreshTree, editing, toast]);

  /* --------------------------------------------------------- navigation */

  const openFile = useCallback(
    async (path) => {
      try {
        const f = await api.read(path);
        setFile(f);
        setPhaseDir(null);
        setEditing(false);
        setView('library');
        refreshProgress();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
    [refreshProgress, toast]
  );

  /* ------------------------------------------------------ claude prompts */

  const ask = useCallback((prompt) => {
    setDockOpen(true);
    setDockTab('claude');
    if (prompt && prompt.trim()) setPromptQueue((q) => [...q, prompt]);
  }, []);

  const consumeQueue = useCallback(() => setPromptQueue([]), []);

  /* ------------------------------------------------------------- lab */

  const openLab = useCallback(() => {
    setLabMounted(true);
    setDockOpen(true);
    setDockTab('lab');
  }, []);

  /* --------------------------------------------------------- terminals */

  // Which shells exist depends on the OS — Windows also offers WSL and Git Bash.
  const termProfiles = meta?.profiles?.length
    ? meta.profiles
    : [
        { id: 'claude', title: 'Claude' },
        { id: 'shell', title: 'Shell' },
      ];

  const openTerm = useCallback((id) => {
    setOpenTerms((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setDockOpen(true);
    setDockTab(id);
  }, []);

  // Sending a snippet to the Lab keeps you on the lesson — it lands in the dock.
  const runInLab = useCallback(
    (language, code) => {
      setLabPending({ language, code });
      openLab();
    },
    [openLab]
  );

  /* --------------------------------------------------------- file ops */

  const saveFile = async (content) => {
    try {
      await api.write(file.path, content);
      setFile((f) => ({ ...f, content }));
      toast('Saved');
      refreshTree();
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  // Finishing a lesson and moving on is the common case, so it is one click.
  const completeAndOpen = async (nextPath) => {
    try {
      if (file && !progress.completed[file.path]) setProgress(await api.complete(file.path, true));
      await openFile(nextPath);
    } catch (e) {
      toast(e.message, 'err');
    }
  };

  const toggleComplete = async () => {
    const done = !progress.completed[file.path];
    setProgress(await api.complete(file.path, done));
    toast(done ? 'Marked complete' : 'Marked incomplete');
  };

  const toggleBookmark = async () => {
    const res = await api.bookmark(file.path);
    setProgress(res);
  };

  /* ------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key === 'j') {
        e.preventDefault();
        setDockOpen((d) => !d);
      } else if (mod && e.key === 'e' && file) {
        e.preventDefault();
        setEditing((v) => !v);
      } else if (mod && e.key === 'l') {
        e.preventDefault();
        openLab();
      } else if (mod && e.key === '/') {
        e.preventDefault();
        setAskFocus((n) => n + 1);
      } else if (e.key === 'Escape' && focus) {
        setFocus(false);
      } else if (e.key === '?' && !mod && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setHelpOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, openLab, focus]);

  // Sidebar toggles listen in the capture phase so they still fire while the
  // terminal or an editor has focus — xterm swallows keys before they bubble.
  // e.code, not e.key: Ctrl+Alt is AltGr on Windows and can change the character.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === 'Period') {
        e.preventDefault();
        e.stopPropagation();
        setFocus((f) => !f);
        return;
      }
      if (e.code !== 'KeyB') return;
      e.preventDefault();
      e.stopPropagation();
      setFocus(false); // a panel shortcut means you want panels back
      if (e.altKey) setDockOpen((d) => !d);
      else if (e.shiftKey) setView((v) => (v === 'library' ? 'today' : 'library'));
      else toggleSidebar();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [toggleSidebar]);

  /* ------------------------------------------------------ dock resize */

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = dockWidth;
    const onMove = (ev) =>
      setDockWidth(Math.min(900, Math.max(320, startW - (ev.clientX - startX))));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!tree || !progress || !meta) {
    return (
      <div className="empty">
        <div className="spin" />
      </div>
    );
  }

  const orderedDays = tree.phases.flatMap((p) => p.days);
  const dayIndex = orderedDays.findIndex((d) => d.path === file?.path);
  const dayMeta = orderedDays[dayIndex];
  const prevDay = dayIndex > 0 ? orderedDays[dayIndex - 1] : null;
  const nextDay = dayIndex >= 0 ? orderedDays[dayIndex + 1] || null : null;
  const currentPhase = tree.phases.find((p) => file?.path?.startsWith(`${p.dir}/`));
  const openedPhase = phaseDir ? tree.phases.find((p) => p.dir === phaseDir) : null;

  const quickActions = [
    ...(file
      ? [
          { label: 'Explain this lesson', prompt: `Give me a first-principles walkthrough of @${file.path}` },
          { label: 'Quiz me', prompt: `Quiz me on @${file.path}. One question at a time.` },
          { label: 'Where am I wrong?', prompt: `Ask me 3 questions on @${file.path} to find gaps in my understanding.` },
        ]
      : []),
    { label: 'What should I learn today?', prompt: 'Looking at plan.md and what I have already covered, what should I learn today?' },
    { label: 'Review my progress', prompt: 'Look at the phase folders and tell me where my knowledge is thin.' },
  ];

  return (
    <div
      className={`app ${focus ? 'focus' : ''}`}
      style={{
        gridTemplateColumns: focus ? '0 0 1fr 0' : `var(--rail) auto 1fr ${dockOpen ? `${dockWidth}px` : '0px'}`,
      }}
    >
      {/* ------------------------------------------------------- rail */}
      <nav className="rail">
        <div className="rail-logo" title="Upskill Lab">
          ⚡
        </div>
        {VIEWS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`rail-btn ${view === id ? 'active' : ''}`}
            title={id === 'library' ? `Library  ${k('B')} (click again to hide list)` : label}
            onClick={() => {
              // Clicking Library while in it folds the list, so no separate toggle is needed.
              if (id === 'library' && view === 'library') setSidebarOpen((o) => !o);
              else {
                setView(id);
                if (id === 'library') setSidebarOpen(true);
              }
            }}
          >
            <Icon />
          </button>
        ))}

        <div className="rail-spacer" />

        <button
          className={`rail-btn ${dockOpen ? 'active' : ''}`}
          title={`Claude & Lab panel  ${k('J')} / ${k('Alt', 'B')}  ·  Lab: ${k('L')}`}
          onClick={() => setDockOpen((d) => !d)}
        >
          <IconLayout />
        </button>
        <button
          className="rail-btn"
          title="Toggle theme"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
      </nav>

      {/* ---------------------------------------------------- sidebar */}
      {view === 'library' ? (
        <Sidebar
          tree={tree}
          currentPath={phaseDir ? null : file?.path}
          activePhase={phaseDir}
          completed={progress.completed}
          hidden={!sidebarOpen}
          onOpen={openFile}
          onOpenPhase={(dir) => {
            setEditing(false);
            setPhaseDir(dir);
          }}
          onNew={() => setNewOpen(true)}
          onCollapse={() => setSidebarOpen(false)}
        />
      ) : (
        <div className="sidebar-slot" />
      )}

      {/* ------------------------------------------------------- main */}
      <main
        className={`main ${!editing ? 'has-ask' : ''} ${
          view === 'library' && sidebarOpen && !dockOpen ? 'side-only' : ''
        }`}
      >
        <div className="topbar">
          <div className="crumb">
            {view === 'today' && <b>Today</b>}
            {view === 'library' &&
              (openedPhase ? (
                <>
                  <span>Library</span>
                  <span className="crumb-sep">/</span>
                  <b>
                    Phase {openedPhase.number} · {openedPhase.title}
                  </b>
                </>
              ) : file ? (
                <>
                  {currentPhase && (
                    <>
                      <span>Phase {currentPhase.number}</span>
                      <span className="crumb-sep">/</span>
                    </>
                  )}
                  <b>{dayMeta?.title || file.path.split('/').pop()}</b>
                </>
              ) : (
                <b>Library</b>
              ))}
          </div>

          <div style={{ flex: 1 }} />

          <button className="search-btn" onClick={() => setPaletteOpen(true)}>
            <IconSearch width={14} height={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
            <span className="kbd">{k('K')}</span>
          </button>

          <div
            className={`streak-pill ${progress.streak.current ? '' : 'cold'}`}
            title={`Best streak: ${progress.streak.best} days`}
          >
            <IconFlame width={14} height={14} />
            {progress.streak.current}
          </div>

          <button className="btn ghost sm" title="Refresh library" onClick={() => { refreshTree(); refreshProgress(); }}>
            <IconRefresh width={15} height={15} />
          </button>
          <button
            className={`btn ghost sm ${focus ? 'on' : ''}`}
            title={focus ? `Exit focus mode  Esc / ${k('.')}` : `Focus mode — just the lesson  ${k('.')}`}
            onClick={() => setFocus((f) => !f)}
          >
            <IconFocus width={15} height={15} />
            {focus && 'Exit focus'}
          </button>
          <button className="btn ghost sm" title="Keyboard shortcuts  ?" onClick={() => setHelpOpen(true)}>
            <IconHelp width={15} height={15} />
          </button>
        </div>

        <div className="content">
          {view === 'today' && (
            <Dashboard
              tree={tree}
              plan={plan}
              progress={progress}
              onOpen={openFile}
              onAsk={ask}
              onNew={() => setNewOpen(true)}
              onLab={openLab}
            />
          )}

          {view === 'library' && openedPhase && (
            <PhaseOverview phase={openedPhase} completed={progress.completed} onOpen={openFile} onAsk={ask} />
          )}

          {view === 'library' &&
            !openedPhase &&
            (file ? (
              editing ? (
                <Suspense fallback={<Loading />}>
                  <Editor
                    file={file}
                    theme={theme}
                    onSave={saveFile}
                    onClose={() => setEditing(false)}
                    onAsk={ask}
                  />
                </Suspense>
              ) : (
                <Reader
                  file={file}
                  meta={dayMeta}
                  completed={!!progress.completed[file.path]}
                  bookmarked={progress.bookmarks.includes(file.path)}
                  onToggleComplete={toggleComplete}
                  onToggleBookmark={toggleBookmark}
                  onEdit={() => setEditing(true)}
                  onRunCode={runInLab}
                  onAsk={ask}
                  onQuickAsk={() => setAskFocus((n) => n + 1)}
                  prev={prevDay}
                  next={nextDay}
                  onOpen={openFile}
                  onCompleteNext={completeAndOpen}
                />
              )
            ) : (
              <div className="empty">
                <div className="empty-inner">
                  <IconBook width={30} height={30} style={{ color: 'var(--text-faint)' }} />
                  <h3>Pick a lesson</h3>
                  <p>
                    {sidebarOpen ? 'Choose a day from the sidebar, or hit ' : 'Hit '}
                    <span className="kbd">{k('K')}</span> to search across everything you've written
                    {sidebarOpen ? '' : ', or '}
                    {!sidebarOpen && <span className="kbd">{k('B')}</span>}
                    {sidebarOpen ? '.' : ' to bring the sidebar back.'}
                  </p>
                  <button className="btn primary" onClick={() => setNewOpen(true)}>
                    Create a new lesson
                  </button>
                </div>
              </div>
            ))}

        </div>

        {!editing && (
          <FloatingAsk
            path={view === 'library' && !openedPhase ? file?.path : undefined}
            title={view === 'library' && !openedPhase ? dayMeta?.title : undefined}
            canSave
            focusToken={askFocus}
            onRunCode={runInLab}
            onOpenTerminal={ask}
            toast={toast}
          />
        )}
      </main>

      {/* ------------------------------------------------------- dock */}
      <aside className={`dock ${dockOpen ? '' : 'hidden'}`}>
        <div className="dock-resize" onMouseDown={startResize} />
        <div className="dock-head">
          <div className="dock-tabs">
            {termProfiles.map((p) => (
              <button
                key={p.id}
                className={`tab ${dockTab === p.id ? 'active' : ''}`}
                onClick={() => openTerm(p.id)}
              >
                {p.id === 'claude' ? <IconSpark width={13} height={13} /> : <IconTerminal width={13} height={13} />}{' '}
                {p.title}
              </button>
            ))}
            <button className={`tab ${dockTab === 'lab' ? 'active' : ''}`} onClick={openLab}>
              <IconFlask width={13} height={13} /> Lab
            </button>
          </div>
          <button
            className="btn ghost sm"
            title={dockWidth >= DOCK_WIDE ? 'Narrow' : 'Widen'}
            onClick={() => setDockWidth((w) => (w >= DOCK_WIDE ? DOCK_COMPACT : DOCK_WIDE))}
          >
            {dockWidth >= DOCK_WIDE ? <IconCollapse width={14} height={14} /> : <IconExpand width={14} height={14} />}
          </button>
          <button className="btn ghost sm" onClick={() => setDockOpen(false)} title={`Hide  ${k('J')} / ${k('Alt', 'B')}`}>
            <IconClose width={14} height={14} />
          </button>
        </div>

        <div className="dock-body">
          {meta.terminalAvailable ? (
            termProfiles
              .filter((p) => openTerms.has(p.id))
              .map((p) =>
                p.id === 'claude' ? (
                  <TerminalPane
                    key={p.id}
                    profile="claude"
                    sessionId="claude-main"
                    visible={dockTab === 'claude'}
                    queue={promptQueue}
                    onConsumed={consumeQueue}
                    quickActions={quickActions}
                  />
                ) : (
                  <TerminalPane
                    key={p.id}
                    profile={p.id}
                    sessionId={`${p.id}-main`}
                    visible={dockTab === p.id}
                  />
                )
              )
          ) : (
            dockTab !== 'lab' && (
              <div className="term-offline">
                node-pty isn't installed, so the embedded terminal is disabled.
                <br />
                Run <span className="kbd">npm install node-pty</span> and restart the server.
              </div>
            )
          )}

          {labMounted && (
            <div className="dock-pane" style={{ display: dockTab === 'lab' ? 'flex' : 'none' }}>
              <Suspense fallback={<Loading />}>
                <Lab
                  languages={meta.languages}
                  hints={labHints}
                  theme={theme}
                  onAsk={ask}
                  pending={labPending}
                  onPendingConsumed={() => setLabPending(null)}
                />
              </Suspense>
            </div>
          )}
        </div>
      </aside>

      {/* ----------------------------------------------------- overlays */}
      {helpOpen && <ShortcutSheet onClose={() => setHelpOpen(false)} />}

      {paletteOpen && (
        <Palette tree={tree} onOpen={openFile} onClose={() => setPaletteOpen(false)} onAsk={ask} />
      )}

      {newOpen && (
        <NewFileDialog
          tree={tree}
          onClose={() => setNewOpen(false)}
          onAsk={ask}
          onCreated={async (path) => {
            setNewOpen(false);
            await refreshTree();
            await openFile(path);
            setEditing(true);
          }}
        />
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
