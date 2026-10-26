/**
 * New-file templates. These follow the conventions in the upskill repo's
 * CLAUDE.md: `phase-N-topic/day-K-topic.md`, quizzes named after the previous
 * day, Q&A appended as `**Q:**` blocks under a `## Q&A` heading.
 */

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function fileNameFor({ kind, day, sub, title }) {
  const slug = slugify(title);
  const dayPart = sub ? `day-${day}-${sub}` : `day-${day}`;
  if (kind === 'quiz') return `${dayPart}-${slug || 'quiz'}.md`;
  return `${dayPart}-${slug}.md`;
}

const TEMPLATES = {
  lesson: ({ day, title }) => `# Day ${day} — ${title}

_Why this matters:_

---

## The problem this solves

---

## How it works

---

## Hands-on

\`\`\`bash
# try it
\`\`\`

---

## Gotchas

---

## Recap

-

---

## Q&A
`,

  quiz: ({ day, title }) => `# Day ${day} — ${title}

Answer without looking anything up first. Answers at the bottom.

---

### 1.

### 2.

### 3.

### 4.

### 5.

---

## Answers

<details>
<summary>Reveal</summary>

1.
2.
3.
4.
5.

</details>
`,

  review: ({ day, title }) => `# Day ${day} — ${title}

## What you covered

| Day | Topic | One-line takeaway |
|-----|-------|-------------------|
|  |  |  |

---

## Things worth re-reading

---

## Open questions

---

## Q&A
`,

  project: ({ day, title }) => `# Day ${day} — ${title}

## Goal

## Requirements

- [ ]
- [ ]
- [ ]

## Constraints

## What "done" looks like

---

## Build log

---

## Q&A
`,

  note: ({ title }) => `# ${title}

`,
};

export function renderTemplate(kind, vars) {
  const fn = TEMPLATES[kind] || TEMPLATES.note;
  return fn(vars);
}

export const TEMPLATE_KINDS = Object.keys(TEMPLATES);

/** Append a Q&A entry to a lesson, creating the `## Q&A` section if needed. */
export function appendQA(content, question, answer = '') {
  const entry = `\n**Q:** ${question.trim()}\n\n${answer.trim() || '_(answer pending)_'}\n`;
  if (/^##\s+Q&A\s*$/im.test(content)) {
    return `${content.replace(/\s*$/, '')}\n${entry}`;
  }
  return `${content.replace(/\s*$/, '')}\n\n---\n\n## Q&A\n${entry}`;
}
