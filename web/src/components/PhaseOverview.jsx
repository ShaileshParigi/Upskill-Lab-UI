import { useEffect } from 'react';
import { DayMark } from './Sidebar.jsx';
import { IconArrowRight, IconClock, IconSpark } from './Icons.jsx';
import { shortTitle } from '../lib/md.js';

export default function PhaseOverview({ phase, completed, onOpen, onAsk }) {
  // The pane keeps its scroll position between views; a new page starts at the top.
  useEffect(() => {
    document.querySelector('.content')?.scrollTo({ top: 0 });
  }, [phase.dir]);

  const done = phase.days.filter((d) => completed[d.path]).length;
  const total = phase.days.length;
  const next = phase.days.find((d) => !completed[d.path]);
  const codeBlocks = phase.days.reduce((s, d) => s + d.codeBlocks, 0);

  return (
    <div className="phase-page">
      <div className="reader-kicker">
        <span>Phase {phase.number}</span>
        {phase.duration && (
          <>
            <span className="crumb-sep">·</span>
            <span>{phase.duration}</span>
          </>
        )}
        {phase.environment && (
          <>
            <span className="crumb-sep">·</span>
            <span>{phase.environment}</span>
          </>
        )}
      </div>

      <h1>{phase.title}</h1>
      {phase.goal && (
        <p className="phase-goal">
          <b>Goal</b>
          {phase.goal}
        </p>
      )}

      <div className="phase-summary">
        <div className="phase-summary-bar">
          <div className="pbar-track">
            <div className="pbar-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <span>
            {done} of {total} done
          </span>
        </div>
        <span className="phase-summary-meta">
          <IconClock width={13} height={13} /> {phase.minutes} min of reading
          {codeBlocks > 0 && ` · ${codeBlocks} code samples`}
        </span>
      </div>

      <div className="phase-acts">
        {next && (
          <button className="btn primary" onClick={() => onOpen(next.path)}>
            {done > 0 ? 'Continue' : 'Start'}: {shortTitle(next.title)} <IconArrowRight width={14} height={14} />
          </button>
        )}
        <button
          className="btn"
          onClick={() =>
            onAsk(
              `Quiz me on Phase ${phase.number} (${phase.title}), mixing questions from every lesson I've completed. One at a time.`
            )
          }
        >
          <IconSpark width={13} height={13} /> Quiz me on this phase
        </button>
      </div>

      <div className="phase-days">
        {phase.days.map((d) => (
          <button key={d.path} className={`phase-day ${completed[d.path] ? 'done' : ''}`} onClick={() => onOpen(d.path)}>
            <span className="day-num">
              {d.day}
              {d.sub ? `.${d.sub}` : ''}
            </span>
            <span className="phase-day-title">{shortTitle(d.title)}</span>
            <span className="phase-day-min">{d.minutes} min</span>
            <DayMark kind={d.kind} done={!!completed[d.path]} />
          </button>
        ))}
      </div>
    </div>
  );
}
