import { useMemo } from 'react';
import { IconFlame, IconSpark, IconPlus, IconFlask, IconClock, IconArrowRight } from './Icons.jsx';
import { shortTitle } from '../lib/md.js';

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

function Heatmap({ data }) {
  const max = Math.max(4, ...data.map((d) => d.score));
  const level = (s) => (s === 0 ? 0 : Math.min(4, Math.ceil((s / max) * 4)));
  const todayKey = data[data.length - 1]?.date;

  return (
    <div className="heat">
      {data.map((d) => (
        <div
          key={d.date}
          className={`heat-cell l${level(d.score)} ${d.date === todayKey ? 'today' : ''}`}
          title={`${d.date} — ${d.score ? `${d.reads || 0} read · ${d.runs || 0} run · ${d.writes || 0} written · ${d.asks || 0} asked` : 'nothing yet'}`}
        />
      ))}
    </div>
  );
}

export default function Dashboard({ tree, plan, progress, onOpen, onAsk, onNew, onLab }) {
  const stats = useMemo(() => {
    if (!tree) return null;

    const days = tree.phases.flatMap((p) => p.days);
    const completed = days.filter((d) => progress.completed[d.path]).length;

    // First planned day that has no lesson file yet — that's what's next.
    const taught = new Set(days.map((d) => `${d.day}`));
    const nextPlanned = plan.find((e) => !taught.has(`${e.day}`));

    // Resume an unfinished lesson you were in; otherwise the first one not yet completed.
    const last = days.find((d) => d.path === progress.lastOpened);
    const upNext = last && !progress.completed[last.path] ? last : days.find((d) => !progress.completed[d.path]);
    const owner = upNext && tree.phases.find((p) => upNext.path.startsWith(`${p.dir}/`));
    const upNextPhase = owner && { ...owner, done: owner.days.filter((d) => progress.completed[d.path]).length };

    const recent = [...days].sort((a, b) => b.mtime - a.mtime).slice(0, 6);

    const phaseRows = tree.phases.map((p) => ({
      ...p,
      done: p.days.filter((d) => progress.completed[d.path]).length,
    }));

    return { days, completed, nextPlanned, upNext, upNextPhase, recent, phaseRows };
  }, [tree, plan, progress]);

  if (!stats) return null;

  const { streak, todayActivity, heatmap, lastOpened } = progress;
  const resuming = !!stats.upNext && stats.upNext.path === lastOpened;
  const totalMin = stats.days.reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="dash">
      <div className="hero">
        <h1>{GREETING()}, Shailesh.</h1>
        <p>
          {streak.current > 0
            ? `${streak.current} day streak — ${streak.activeToday ? "today's already logged." : 'keep it alive today.'}`
            : 'No streak going. One lesson today starts it.'}
        </p>
      </div>

      {stats.upNext ? (
        <button className="card up-next" onClick={() => onOpen(stats.upNext.path)}>
          <div className="up-next-eyebrow">
            {resuming ? 'Continue where you left off' : 'Up next'}
            <span>
              Phase {stats.upNextPhase.number} · {stats.upNextPhase.title} · {stats.upNextPhase.done} of{' '}
              {stats.upNextPhase.days.length} done
            </span>
          </div>
          <h2>{shortTitle(stats.upNext.title)}</h2>
          {stats.upNext.summary && <p>{stats.upNext.summary}</p>}
          <div className="up-next-foot">
            <span className="up-next-start">
              {resuming ? 'Continue' : 'Start lesson'} <IconArrowRight width={15} height={15} />
            </span>
            <span className="up-next-meta">
              <IconClock width={13} height={13} /> {stats.upNext.minutes} min
              {stats.upNext.codeBlocks > 0 && ` · ${stats.upNext.codeBlocks} code samples`}
              {stats.upNext.qaCount > 0 && ` · ${stats.upNext.qaCount} Q&A`}
            </span>
          </div>
        </button>
      ) : (
        stats.nextPlanned && (
          <button
            className="card up-next"
            onClick={() => onAsk(`Teach me Phase ${stats.nextPlanned.phase} Day ${stats.nextPlanned.day}`)}
          >
            <div className="up-next-eyebrow">
              Up next<span>Phase {stats.nextPlanned.phase} · not written yet</span>
            </div>
            <h2>{stats.nextPlanned.title}</h2>
            <div className="up-next-foot">
              <span className="up-next-start">
                Ask Claude to teach it <IconSpark width={15} height={15} />
              </span>
            </div>
          </button>
        )
      )}

      <div className="grid c3">
        <div className="card stat">
          <div className="stat-label">Streak</div>
          <div className="stat-value" style={{ color: streak.current ? 'var(--accent)' : 'var(--text-faint)' }}>
            {streak.current}
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-faint)' }}> days</span>
          </div>
          <div className="stat-sub">Best {streak.best}</div>
        </div>

        <div className="card stat">
          <div className="stat-label">Completed</div>
          <div className="stat-value">
            {stats.completed}
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-faint)' }}> / {stats.days.length}</span>
          </div>
          <div className="stat-sub">{Math.round((stats.completed / Math.max(1, stats.days.length)) * 100)}% of written lessons</div>
        </div>

        <div className="card stat">
          <div className="stat-label">Today</div>
          <div className="stat-value">
            {todayActivity.reads + todayActivity.runs + todayActivity.asks + todayActivity.writes}
          </div>
          <div className="stat-sub">
            {todayActivity.reads} read · {todayActivity.runs} run · {todayActivity.asks} asked
          </div>
        </div>
      </div>

      {stats.upNext && stats.nextPlanned && (
        <div className="section">
          <div className="section-head">
            <h2>Not written yet</h2>
          </div>
          <button
            className="card next-card"
            onClick={() => onAsk(`Teach me Phase ${stats.nextPlanned.phase} Day ${stats.nextPlanned.day}`)}
          >
            <div className="next-badge" style={{ background: 'linear-gradient(140deg, var(--accent), #c589ff)' }}>
              DAY
              <br />
              {stats.nextPlanned.day}
            </div>
            <div className="next-body">
              <h3>{stats.nextPlanned.title}</h3>
              <p>Phase {stats.nextPlanned.phase} · ask Claude to teach it</p>
            </div>
            <IconSpark style={{ color: 'var(--accent)' }} />
          </button>
        </div>
      )}

      <div className="section">
        <div className="section-head">
          <h2>Activity</h2>
          <span>last 17 weeks</span>
        </div>
        <div className="card">
          <Heatmap data={heatmap} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Phases</h2>
          <span>{totalMin} min of written material</span>
        </div>
        <div className="card">
          {stats.phaseRows.map((p) => (
            <div className="pbar-row" key={p.dir}>
              <div className="pbar-name">
                <span style={{ color: 'var(--text-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                  {p.number}.{' '}
                </span>
                {p.title}
              </div>
              <div className="pbar-track">
                <div
                  className="pbar-fill"
                  style={{ width: `${(p.done / Math.max(1, p.days.length)) * 100}%` }}
                />
              </div>
              <div className="pbar-val">
                {p.done}/{p.days.length}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2>Recently touched</h2>
        </div>
        <div className="card recent-list">
          {stats.recent.map((d) => (
            <button className="recent" key={d.path} onClick={() => onOpen(d.path)}>
              <span className={`chip ${d.kind}`}>{d.kind}</span>
              <span className="recent-title">{d.title}</span>
              <span className="recent-meta">{new Date(d.mtime).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="grid c3">
          <button className="card next-card" onClick={() => onAsk('')}>
            <IconSpark style={{ color: 'var(--primary)' }} width={20} height={20} />
            <div className="next-body">
              <h3>Ask Claude</h3>
              <p>Open the terminal</p>
            </div>
          </button>
          <button className="card next-card" onClick={onNew}>
            <IconPlus style={{ color: 'var(--success)' }} width={20} height={20} />
            <div className="next-body">
              <h3>New lesson</h3>
              <p>Write your own notes</p>
            </div>
          </button>
          <button className="card next-card" onClick={onLab}>
            <IconFlask style={{ color: 'var(--accent)' }} width={20} height={20} />
            <div className="next-body">
              <h3>Open the Lab</h3>
              <p>Try something out</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
