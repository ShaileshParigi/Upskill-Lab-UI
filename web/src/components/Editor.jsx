import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import Markdown from './Markdown.jsx';
import { stripTitle } from '../lib/md.js';
import { IconSave, IconEye, IconClose, IconSpark } from './Icons.jsx';
import { k } from '../lib/keys.js';

export default function Editor({ file, theme, onSave, onClose, onAsk }) {
  const [text, setText] = useState(file.content);
  const [preview, setPreview] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => setText(file.content), [file.path, file.content]);

  const dirty = text !== file.content;
  const extensions = useMemo(() => [markdown()], []);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const close = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    onClose();
  };

  return (
    <div className="editor">
      <div className="editor-bar">
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-dim)' }}>{file.path}</span>
        {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        <div style={{ flex: 1 }} />
        <button
          className="btn sm"
          onClick={() => onAsk(`Review and improve the notes in @${file.path} — flag anything inaccurate or unclear.`)}
        >
          <IconSpark width={13} height={13} /> Review with Claude
        </button>
        <button className={`btn sm ${preview ? 'on' : ''}`} onClick={() => setPreview((p) => !p)}>
          <IconEye width={13} height={13} /> Preview
        </button>
        <button className="btn sm primary" onClick={save} disabled={!dirty || saving}>
          <IconSave width={13} height={13} /> {saving ? 'Saving…' : 'Save'}
          <span className="kbd" style={{ marginLeft: 2 }}>{k('S')}</span>
        </button>
        <button className="btn ghost sm" onClick={close} title="Close editor">
          <IconClose width={14} height={14} />
        </button>
      </div>

      <div className={`editor-split ${preview ? 'preview' : ''}`}>
        <div className="editor-pane">
          <CodeMirror
            value={text}
            height="100%"
            theme={theme === 'dark' ? githubDark : githubLight}
            extensions={extensions}
            onChange={setText}
            basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, autocompletion: false }}
          />
        </div>
        {preview && (
          <div className="editor-preview">
            <Markdown source={stripTitle(text)} />
          </div>
        )}
      </div>
    </div>
  );
}
