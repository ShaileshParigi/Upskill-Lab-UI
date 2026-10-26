import { memo, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { makeSlugger, hastText, runnerLang, rehypePrime } from '../lib/md.js';
import { IconCopy, IconCheck, IconPlay, IconSpark } from './Icons.jsx';

function CodeBlock({ lang, raw, children, onRun, onAsk }) {
  const [copied, setCopied] = useState(false);
  const runnable = runnerLang(lang);
  const lineCount = raw.replace(/\n$/, '').split('\n').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      // Clipboard API needs a secure context; fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = raw;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">
          {lang || 'text'}
          <span className="code-lines"> · {lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
        </span>
        <div className="code-acts">
          {runnable && onRun && (
            <button className="btn ghost sm" onClick={() => onRun(runnable, raw)} title="Open in Lab">
              <IconPlay width={12} height={12} /> Run in Lab
            </button>
          )}
          {onAsk && (
            <button className="btn ghost sm" onClick={() => onAsk(raw)} title="Ask Claude about this snippet">
              <IconSpark width={13} height={13} /> Explain
            </button>
          )}
          <button className="btn ghost sm" onClick={copy} title="Copy">
            {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function Markdown({ source, onRunCode, onAskCode }) {
  // A fresh slugger per source keeps heading ids aligned with the TOC's.
  const slug = useMemo(() => makeSlugger(), [source]);

  const components = useMemo(() => {
    const heading = (Tag) =>
      function Heading({ node, children, ...props }) {
        return (
          <Tag id={slug(hastText(node))} {...props}>
            {children}
          </Tag>
        );
      };

    return {
      h2: heading('h2'),
      h3: heading('h3'),
      pre({ node, children }) {
        const codeEl = node?.children?.find((c) => c.tagName === 'code');
        const cls = codeEl?.properties?.className || [];
        const lang = (cls.find((c) => c.startsWith('language-')) || '').replace('language-', '');
        return (
          <CodeBlock lang={lang} raw={hastText(codeEl)} onRun={onRunCode} onAsk={onAskCode}>
            {children}
          </CodeBlock>
        );
      },
      a({ children, href, ...props }) {
        const external = /^https?:/.test(href || '');
        return (
          <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} {...props}>
            {children}
          </a>
        );
      },
    };
  }, [slug, onRunCode, onAskCode]);

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypePrime, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
