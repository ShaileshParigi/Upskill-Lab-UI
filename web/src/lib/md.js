/** Markdown fence language -> code-runner language id. */
const LANG_ALIASES = {
  java: 'java',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  python: 'python',
  py: 'python',
  javascript: 'javascript',
  js: 'javascript',
  node: 'javascript',
  mjs: 'javascript',
  sql: 'sql',
  sqlite: 'sql',
  postgres: 'postgres',
  postgresql: 'postgres',
  psql: 'postgres',
  pgsql: 'postgres',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
};

export function runnerLang(fenceLang) {
  return LANG_ALIASES[String(fenceLang || '').toLowerCase()] || null;
}

/** Runner languages used by a lesson's code fences, most-used first. */
export function lessonRunnerLangs(source) {
  const counts = new Map();
  for (const m of String(source || '').matchAll(/^[ \t]*```+[ \t]*([\w+#-]+)/gm)) {
    const id = runnerLang(m[1]);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Heading id generator matching between the TOC and the rendered headings.
 * Both walk headings in document order, so a shared counter keeps duplicates
 * (`## Recap` appearing twice) pointing at distinct anchors.
 */
export function makeSlugger() {
  const seen = new Map();
  return (text) => {
    const base =
      String(text)
        .toLowerCase()
        .replace(/[`*_~]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
}

/** Pull h2/h3 headings out of markdown source, ignoring fenced code blocks. */
export function extractHeadings(source) {
  const slug = makeSlugger();
  const out = [];
  let inFence = false;

  for (const line of String(source).split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) {
      const text = m[2].replace(/[`*_]/g, '').trim();
      out.push({ level: m[1].length, text, id: slug(text) });
    }
  }
  return out;
}

/** Flatten a hast node back to plain text (for copy/run of a code block). */
export function hastText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value || '';
  if (!node.children) return '';
  return node.children.map(hastText).join('');
}

/** Strip the leading `# Title` line — the reader header already shows it. */
export function stripTitle(source) {
  return String(source).replace(/^#\s+.+\n+/, '');
}

/** Collapse a selection into a single line so the CLI sees one prompt. */
export function oneLine(text, max = 900) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function titleOf(source, fallback = 'Untitled') {
  const m = String(source).match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : fallback;
}

/** "Day 12 — Shell Scripting" -> "Shell Scripting" (the day number is shown separately). */
export function shortTitle(title) {
  return title.replace(/^Day\s+[\d.]+\s*[—–-]\s*/i, '');
}

/**
 * Rehype plugin: fold the "Before you read: …" section into a <details> so the
 * priming questions sit above the lesson but can be tucked away once answered.
 */
export function rehypePrime() {
  const isH2 = (n) => n.type === 'element' && n.tagName === 'h2';
  return (tree) => {
    const kids = tree.children;
    const out = [];
    for (let i = 0; i < kids.length; i++) {
      const n = kids[i];
      if (!(isH2(n) && /^before you read/i.test(hastText(n).trim()))) {
        out.push(n);
        continue;
      }
      let j = i + 1;
      while (j < kids.length && !isH2(kids[j])) j++;
      out.push({
        type: 'element',
        tagName: 'details',
        properties: { className: ['prime'], open: true },
        children: [
          { type: 'element', tagName: 'summary', properties: {}, children: [n] },
          { type: 'element', tagName: 'div', properties: { className: ['prime-body'] }, children: kids.slice(i + 1, j) },
        ],
      });
      i = j - 1;
    }
    tree.children = out;
  };
}

/** True when the lesson opens with a "Before you read" section. */
export const hasPrimer = (source) => /^##\s+Before you read/im.test(String(source));
