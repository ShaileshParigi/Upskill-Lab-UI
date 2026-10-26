import { useEffect } from 'react';
import { k } from '../lib/keys.js';
import { IconClose } from './Icons.jsx';

const GROUPS = [
  {
    title: 'Navigate',
    rows: [
      ['Search everything', k('K')],
      ['Today ↔ Library', k('Shift', 'B')],
      ['Show / hide the lesson list', k('B')],
      ['Focus mode (just the lesson)', k('.')],
    ],
  },
  {
    title: 'Learn',
    rows: [
      ['Ask a quick question', k('/')],
      ['Open the Lab', k('L')],
      ['Edit ↔ read this lesson', k('E')],
    ],
  },
  {
    title: 'Panels',
    rows: [
      ['Show / hide Claude panel', `${k('J')}  or  ${k('Alt', 'B')}`],
      ['Run code in the Lab', k('Enter')],
      ['This sheet', '?'],
      ['Leave focus mode / close a dialog', 'Esc'],
    ],
  },
];

export default function ShortcutSheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal keys-modal" role="dialog" aria-label="Keyboard shortcuts">
        <div className="modal-head">
          Keyboard shortcuts
          <button className="btn ghost sm" onClick={onClose} title="Close">
            <IconClose width={14} height={14} />
          </button>
        </div>
        <div className="modal-body keys-body">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h4>{g.title}</h4>
              {g.rows.map(([label, keys]) => (
                <div className="keys-row" key={label}>
                  <span>{label}</span>
                  <span className="kbd">{keys}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
