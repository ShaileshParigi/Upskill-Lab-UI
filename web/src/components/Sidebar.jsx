import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevron, IconFlag, IconPlus, IconQuiz, IconRefresh, IconSearch, IconSidebar } from './Icons.jsx';
import { shortTitle } from '../lib/md.js';
import { k } from '../lib/keys.js';

// One glyph per lesson kind, so a row says what it is without relying on colour alone.
const KIND_ICON = { quiz: IconQuiz, project: IconFlag, review: IconRefresh };
const KIND_LABEL = { quiz: 'Quiz', project: 'Checkpoint', review: 'Review' };

export function DayMark({ kind, done }) {
  if (done) {
    return (
      <span className="day-mark done" title="Completed">
        <IconCheck width={13} height={13} />
      </span>
    );
  }
  const Icon = KIND_ICON[kind];
  if (!Icon) return null;
  return (
    <span className={`day-mark ${kind}`} title={KIND_LABEL[kind]}>
      <Icon width={13} height={13} />
    </span>
  );
}

export default function Sidebar({
  tree,
  currentPath,
  activePhase,
  completed,
  hidden,
  onOpen,
  onOpenPhase,
  onNew,
  onCollapse,
}) {
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState('');

  // Expand the phase containing the open file. Reference docs belong to no phase,
  // so opening one must not touch the tree. With nothing open yet, expand the last
  // phase once, so the sidebar isn't fully collapsed on first load.
  const seeded = useRef(false);
  useEffect(() => {
    if (!tree) return;
    const owning = tree.phases.find((p) => currentPath?.startsWith(`${p.dir}/`));
    let target = owning;
    if (!target && !currentPath && !seeded.current) target = tree.phases[tree.phases.length - 1];
    if (target) {
      seeded.current = true;
      setOpen((o) => (o[target.dir] ? o : { ...o, [target.dir]: true }));
    }
  }, [tree, currentPath]);

  const phases = useMemo(() => {
    if (!tree) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return tree.phases;
    return tree.phases
      .map((p) => ({
        ...p,
        days: p.days.filter(
          (d) => d.title.toLowerCase().includes(q) || d.slug.includes(q) || String(d.day) === q
        ),
      }))
      .filter((p) => p.days.length);
  }, [tree, filter]);

  const filtering = filter.trim().length > 0;

  return (
    <aside className={`sidebar ${hidden ? 'hidden' : ''}`}>
      <div className="sidebar-head">
        <div className="sidebar-title">
          Library
          <button className="btn ghost sm" onClick={onNew} title="New lesson">
            <IconPlus width={14} height={14} />
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          <IconSearch
            width={14}
            height={14}
            style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-faint)' }}
          />
          <input
            className="input"
            style={{ paddingLeft: 31, fontSize: 12.5, padding: '7px 10px 7px 31px' }}
            placeholder="Filter days…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        {!filtering && (
          <div className="legend">
            <span className="done"><IconCheck width={11} height={11} /> Done</span>
            <span className="quiz"><IconQuiz width={11} height={11} /> Quiz</span>
            <span className="project"><IconFlag width={11} height={11} /> Checkpoint</span>
          </div>
        )}
      </div>

      <div className="sidebar-body">
        {phases.map((p) => {
          const isOpen = filtering || open[p.dir];
          const done = p.days.filter((d) => completed[d.path]).length;
          return (
            <div className="phase" key={p.dir}>
              {/* The caret folds the list; the title opens the phase's overview page. */}
              <div className={`phase-head ${activePhase === p.dir ? 'active' : ''}`}>
                <button
                  className="caret-btn"
                  onClick={() => setOpen((o) => ({ ...o, [p.dir]: !o[p.dir] }))}
                  title={isOpen ? 'Collapse' : 'Expand'}
                  aria-expanded={!!isOpen}
                >
                  <IconChevron width={13} height={13} className={`caret ${isOpen ? 'open' : ''}`} />
                </button>
                <button
                  className="phase-open"
                  onClick={() => {
                    setOpen((o) => ({ ...o, [p.dir]: true }));
                    onOpenPhase(p.dir);
                  }}
                  title={`Phase ${p.number} — ${p.title} (open overview)`}
                >
                  <span className="phase-num">{p.number}</span>
                  <span className="phase-name">{p.title}</span>
                  <span className="phase-count">
                    {done}/{p.days.length}
                  </span>
                </button>
              </div>
              <div className={`phase-bar ${done > 0 && done === p.days.length ? 'full' : ''}`}>
                <i style={{ width: `${p.days.length ? (done / p.days.length) * 100 : 0}%` }} />
              </div>

              {isOpen && (
                <div className="day-list">
                  {p.days.map((d) => (
                    <button
                      key={d.path}
                      className={`day ${currentPath === d.path ? 'active' : ''}`}
                      onClick={() => onOpen(d.path)}
                      title={d.title}
                    >
                      <span className="day-num">
                        {d.day}
                        {d.sub ? `.${d.sub}` : ''}
                      </span>
                      <span className="day-title">{shortTitle(d.title)}</span>
                      <DayMark kind={d.kind} done={!!completed[d.path]} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!filtering && tree?.docs?.length > 0 && (
          <div className="phase" style={{ marginTop: 14 }}>
            <div className="sidebar-title" style={{ padding: '0 8px', marginBottom: 6 }}>
              Reference
            </div>
            {tree.docs.map((d) => (
              <button
                key={d.path}
                className={`day ${currentPath === d.path ? 'active' : ''}`}
                onClick={() => onOpen(d.path)}
              >
                <span className="day-num" />
                <span className="day-title">{d.label}</span>
              </button>
            ))}
          </div>
        )}

        {filtering && phases.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12.5 }}>
            No days match “{filter}”.
          </div>
        )}
      </div>

      <button className="sidebar-foot" onClick={onCollapse} title={`Hide sidebar  ${k('B')}`}>
        <IconSidebar width={14} height={14} />
        <span>Hide sidebar</span>
        <span className="kbd">{k('B')}</span>
      </button>
    </aside>
  );
}
