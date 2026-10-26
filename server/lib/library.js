import fs from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_ROOT, safeResolve, toRel } from '../config.js';

const DAY_RE = /^day-(\d+)(?:-(\d+))?-(.+)\.md$/i;
const PHASE_RE = /^phase-(\d+)-(.+)$/i;

const TOP_LEVEL_DOCS = [
  { file: 'plan.md', label: 'Day-wise Plan', icon: 'calendar' },
  { file: 'roadmap.md', label: 'Full Roadmap', icon: 'map' },
  { file: 'README.md', label: 'Overview', icon: 'book' },
  { file: 'CLAUDE.md', label: 'Claude Instructions', icon: 'robot' },
];

function titleize(slug) {
  return slug
    .split('-')
    .map((w) => (w.length <= 2 && /^[a-z]+$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function classify(slug) {
  const s = slug.toLowerCase();
  if (s.includes('quiz')) return 'quiz';
  if (s.includes('review')) return 'review';
  if (s.includes('checkpoint') || s.includes('project')) return 'project';
  return 'lesson';
}

/** Pull the first `# Heading` out of a markdown body. */
function firstHeading(text) {
  const m = text.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function summarize(text) {
  const body = text
    .replace(/^#.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*[-*|>].*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return body.slice(0, 220);
}

export function parseDayFilename(name) {
  const m = name.match(DAY_RE);
  if (!m) return null;
  return {
    day: Number(m[1]),
    sub: m[2] ? Number(m[2]) : 0,
    slug: m[3],
    kind: classify(m[3]),
  };
}

async function readDay(phaseDir, name) {
  const meta = parseDayFilename(name);
  if (!meta) return null;
  const abs = path.join(CONTENT_ROOT, phaseDir, name);
  const [stat, text] = await Promise.all([fs.stat(abs), fs.readFile(abs, 'utf8')]);
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    ...meta,
    id: `${phaseDir}/${name}`,
    path: `${phaseDir}/${name}`,
    file: name,
    title: firstHeading(text) || titleize(meta.slug),
    summary: summarize(text),
    words,
    minutes: Math.max(1, Math.round(words / 190)),
    codeBlocks: (text.match(/```/g) || []).length / 2,
    hasQA: /^##\s+Q&A\s*$/im.test(text),
    qaCount: (text.match(/^\*\*Q:\*\*/gm) || []).length,
    mtime: stat.mtimeMs,
    size: stat.size,
  };
}

/**
 * Phase title, duration, environment and goal as written in plan.md, keyed by phase number.
 * Each phase opens with `## Phase N: Title` then `**Duration:**`, `**Environment:**`, `**Goal:**`.
 */
async function planPhaseInfo() {
  const info = {};
  try {
    const text = await fs.readFile(path.join(CONTENT_ROOT, 'plan.md'), 'utf8');
    const field = (block, name) => {
      // A field runs to the next blank line, so wrapped goals stay whole.
      const m = block.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)(?:\\n\\s*\\n|\\n\\*\\*|(?![\\s\\S]))`, 'm'));
      return m ? m[1].replace(/\s*\n\s*/g, ' ').trim() : null;
    };
    for (const block of text.split(/^(?=##\s+Phase\s+\d+\s*:)/m)) {
      const head = block.match(/^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$/m);
      if (!head) continue;
      // Only the intro, before the first `---` rule or sub-heading, holds these fields.
      const intro = block.split(/^(?:---|###)/m)[0];
      info[Number(head[1])] = {
        title: head[2],
        duration: field(intro, 'Duration'),
        environment: field(intro, 'Environment'),
        goal: field(intro, 'Goal'),
      };
    }
  } catch {
    /* no plan.md — fall back to folder names */
  }
  return info;
}

/** Build the full library tree: phases -> days, plus reference docs. */
export async function buildTree() {
  const planInfo = await planPhaseInfo();
  const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true });

  const phaseDirs = entries
    .filter((e) => e.isDirectory() && PHASE_RE.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a.match(PHASE_RE)[1]) - Number(b.match(PHASE_RE)[1]));

  const phases = [];
  for (const dir of phaseDirs) {
    const m = dir.match(PHASE_RE);
    const names = await fs.readdir(path.join(CONTENT_ROOT, dir));
    const days = (await Promise.all(names.filter((n) => n.endsWith('.md')).map((n) => readDay(dir, n))))
      .filter(Boolean)
      .sort((a, b) => a.day - b.day || a.sub - b.sub);

    // Non-markdown siblings (checkpoint projects, scratch code) worth surfacing.
    const artifacts = names
      .filter((n) => !n.endsWith('.md') && !n.startsWith('.'))
      .map((n) => ({ name: n, path: `${dir}/${n}` }));

    phases.push({
      number: Number(m[1]),
      dir,
      slug: m[2],
      title: planInfo[Number(m[1])]?.title || titleize(m[2]),
      duration: planInfo[Number(m[1])]?.duration || null,
      environment: planInfo[Number(m[1])]?.environment || null,
      goal: planInfo[Number(m[1])]?.goal || null,
      days,
      artifacts,
      minutes: days.reduce((s, d) => s + d.minutes, 0),
    });
  }

  const docs = [];
  for (const d of TOP_LEVEL_DOCS) {
    try {
      const abs = safeResolve(d.file);
      const stat = await fs.stat(abs);
      docs.push({ ...d, path: d.file, size: stat.size, mtime: stat.mtimeMs });
    } catch {
      /* missing reference doc is fine */
    }
  }

  return { contentRoot: CONTENT_ROOT, phases, docs };
}

export async function readFile(relPath) {
  const abs = safeResolve(relPath);
  const [text, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
  return { path: toRel(abs), content: text, mtime: stat.mtimeMs, size: stat.size };
}

export async function writeFile(relPath, content) {
  const abs = safeResolve(relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf8');
  const stat = await fs.stat(abs);
  return { path: toRel(abs), mtime: stat.mtimeMs, size: stat.size };
}

export async function exists(relPath) {
  try {
    await fs.access(safeResolve(relPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Grep-ish search across all markdown in the content root.
 * Returns per-file hits with a line of context.
 */
export async function search(query, { limit = 60 } = {}) {
  if (!query || query.trim().length < 2) return [];
  const needle = query.toLowerCase();
  const results = [];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__pycache__') continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
      } else if (e.name.endsWith('.md')) {
        const text = await fs.readFile(abs, 'utf8');
        const lines = text.split('\n');
        const hits = [];
        for (let i = 0; i < lines.length && hits.length < 4; i++) {
          if (lines[i].toLowerCase().includes(needle)) {
            hits.push({ line: i + 1, text: lines[i].trim().slice(0, 240) });
          }
        }
        if (hits.length) {
          const rel = toRel(abs);
          results.push({
            path: rel,
            title: firstHeading(text) || path.basename(rel, '.md'),
            hits,
            total: lines.filter((l) => l.toLowerCase().includes(needle)).length,
          });
        }
      }
    }
  }

  await walk(CONTENT_ROOT);
  results.sort((a, b) => b.total - a.total);
  return results.slice(0, limit);
}

/**
 * Parse plan.md into phase -> day entries so the dashboard can show what's
 * scheduled next, including days that have no lesson file yet.
 */
export async function parsePlan() {
  let text;
  try {
    text = await fs.readFile(path.join(CONTENT_ROOT, 'plan.md'), 'utf8');
  } catch {
    return [];
  }

  const out = [];
  let phase = null;
  for (const line of text.split('\n')) {
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$/i);
    if (phaseMatch) {
      phase = { number: Number(phaseMatch[1]), title: phaseMatch[2] };
      continue;
    }
    const dayMatch = line.match(/^####\s+Day\s+(\d+)\s*[—–-]\s*(.+?)\s*$/i);
    if (dayMatch && phase) {
      out.push({
        phase: phase.number,
        phaseTitle: phase.title,
        day: Number(dayMatch[1]),
        title: dayMatch[2],
      });
    }
  }
  return out;
}
