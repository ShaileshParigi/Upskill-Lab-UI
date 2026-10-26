import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { slugPreview } from '../lib/slug.js';

const KINDS = [
  { id: 'lesson', label: 'Lesson' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'review', label: 'Review' },
  { id: 'project', label: 'Project' },
  { id: 'note', label: 'Note' },
];

export default function NewFileDialog({ tree, onClose, onCreated, onAsk }) {
  const phases = tree?.phases || [];
  const [phaseDir, setPhaseDir] = useState(phases[phases.length - 1]?.dir || '');
  const [kind, setKind] = useState('lesson');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const phase = phases.find((p) => p.dir === phaseDir);

  // Default to the next unused day number in the selected phase.
  useEffect(() => {
    if (!phase) return;
    const max = phase.days.reduce((m, d) => Math.max(m, d.day), 0);
    setDay(String(kind === 'quiz' ? max || 1 : max + 1));
  }, [phaseDir, kind, phase]);

  const filename = useMemo(() => {
    const slug = slugPreview(title) || (kind === 'quiz' ? 'quiz' : 'untitled');
    return day ? `day-${day}-${slug}.md` : '';
  }, [day, title, kind]);

  const create = async () => {
    if (!title.trim() || !day || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api.create({ phaseDir, kind, day: Number(day), title: title.trim() });
      onCreated(res.path);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const askClaude = () => {
    const p = phases.find((x) => x.dir === phaseDir);
    onAsk(
      title.trim()
        ? `Teach me Phase ${p?.number} Day ${day} — ${title.trim()}`
        : `Teach me Phase ${p?.number} Day ${day}`
    );
    onClose();
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="modal-head">
          New file
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-faint)' }}>
            written into your upskill repo
          </span>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Phase</label>
            <select className="input" value={phaseDir} onChange={(e) => setPhaseDir(e.target.value)}>
              {phases.map((p) => (
                <option key={p.dir} value={p.dir}>
                  {p.number}. {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Kind</label>
            <div className="kind-picker">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  className={`btn sm ${kind === k.id ? 'on' : ''}`}
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field field-row">
            <div>
              <label>Title</label>
              <input
                className="input"
                autoFocus
                placeholder={kind === 'quiz' ? 'Week 2 Quiz' : 'Docker Networking'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()}
              />
            </div>
            <div>
              <label>Day</label>
              <input className="input" value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} />
            </div>
          </div>

          {filename && <div className="hint">{phaseDir}/{filename}</div>}
          {err && <div className="hint" style={{ color: 'var(--danger)' }}>{err}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={askClaude} title="Let Claude write the lesson instead">
            Ask Claude to teach it
          </button>
          <button className="btn primary" onClick={create} disabled={!title.trim() || !day || busy}>
            {busy ? 'Creating…' : 'Create & edit'}
          </button>
        </div>
      </div>
    </div>
  );
}
