import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { IconSearch } from './Icons.jsx';

function highlight(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1 || !q) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function Palette({ tree, onOpen, onClose, onAsk }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const days = useMemo(() => tree?.phases.flatMap((p) => p.days) || [], [tree]);

  // Title matches resolve instantly; full-text search is debounced.
  const titleMatches = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return days.slice(-8).reverse();
    return days
      .filter((d) => d.title.toLowerCase().includes(term) || d.slug.includes(term) || String(d.day) === term)
      .slice(0, 8);
  }, [q, days]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setHits([]);
    const id = setTimeout(() => {
      api
        .search(term)
        .then((r) => setHits(r.filter((h) => !titleMatches.some((t) => t.path === h.path)).slice(0, 12)))
        .catch(() => setHits([]));
    }, 180);
    return () => clearTimeout(id);
  }, [q, titleMatches]);

  const items = useMemo(() => {
    const list = [
      ...titleMatches.map((d) => ({ type: 'day', path: d.path, title: d.title, kind: d.kind })),
      ...hits.map((h) => ({ type: 'hit', path: h.path, title: h.title, hit: h.hits[0], total: h.total })),
    ];
    if (q.trim().length > 3) {
      list.push({ type: 'ask', title: `Ask Claude: “${q.trim()}”` });
    }
    return list;
  }, [titleMatches, hits, q]);

  useEffect(() => setSel(0), [items.length]);

  const choose = (item) => {
    if (!item) return;
    if (item.type === 'ask') onAsk(q.trim());
    else onOpen(item.path);
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => (s + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => (s - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(items[sel]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={onKey}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 18 }}>
          <IconSearch style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search lessons and content…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="palette-list">
          {items.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
              Nothing found.
            </div>
          )}
          {items.map((item, i) => (
            <div key={`${item.type}-${item.path || 'ask'}-${i}`}>
              <button
                className={`palette-item ${i === sel ? 'sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => choose(item)}
              >
                {item.type === 'ask' ? (
                  <span className="chip quiz">ask</span>
                ) : (
                  <span className={`chip ${item.kind || 'lesson'}`}>{item.kind || 'match'}</span>
                )}
                <span className="palette-item-title">{highlight(item.title, q.trim())}</span>
                {item.total > 1 && <span className="palette-item-path">{item.total} hits</span>}
              </button>
              {item.hit && <div className="palette-hit">{highlight(item.hit.text, q.trim())}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
