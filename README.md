# Upskill Lab

A learning server for the `Upskill` roadmap. One page where you read the day's
lesson, ask Claude about it in a real terminal, and try the code out — instead of
switching between an IDE, a shell, and a scratch file.

Runs on **Windows** (PowerShell, WSL2, Git Bash), macOS, and Linux.

```powershell
npm install          # first time only
npm start            # builds the UI and serves it
```

Then open **http://127.0.0.1:4321**.

For development with hot reload:

```powershell
npm run dev          # server on :4321, Vite UI on :4322
```

## What it does

**Read** — every `phase-N-*/day-K-*.md` rendered with syntax highlighting, a
table of contents, and working `<details>` answer blocks. Progress, streak, and
per-phase completion are tracked in `data/progress.json` (this repo, not the
content one).

**Ask** — an embedded terminal running the real `claude` CLI with its working
directory set to your `Upskill` folder, so `CLAUDE.md` conventions still apply
and lessons get written to the right place. Sessions survive page reloads.

- Select any text in a lesson → **Explain / Example / Why?**
- Per code block → **Explain**
- Per lesson → **Quiz me**, **Recap**, **Ask Claude** (focuses the quick-ask bar)
- **Quick ask** — a floating bar pinned to the bottom of the reading pane (focus it with
  `Ctrl /`). Answers stream into a panel above it from a headless, read-only `claude -p` call, so
  asking never edits the lesson and never touches the terminal session. Each answer has **Add to
  lesson Q&A** (appends it to that day's `## Q&A`), **Copy**, and **Continue in terminal**.

**Run** — a scratchpad for Java, PostgreSQL, Bash, Python, Node, SQLite, C, and
C++. Any runnable code block in a lesson has a **Run** button that drops it into
the Lab. Drafts persist per language; each run is a throwaway temp dir with a
20s limit.

**Write** — edit any lesson in place (Ctrl+S to save, live preview), or create a
new lesson, quiz, review, or project from a template that follows the repo's
naming convention (`day-K-topic-name.md`).

The library auto-refreshes when files change on disk, so a lesson Claude writes
in the terminal appears in the sidebar immediately.

## Terminals

The dock offers a tab per shell available on this machine. On Windows:

| Tab | What it is |
|-----|-----------|
| **Claude** | The `claude` CLI, cwd set to the content repo |
| **PowerShell** | PowerShell 7 if installed, otherwise Windows PowerShell |
| **Ubuntu (WSL)** | Your WSL2 distro — where the Linux and networking phases happen |
| **Git Bash** | POSIX shell without needing WSL |

Shells start on first click rather than at page load, so opening the lab does
not boot WSL every time.

## Language runners

Each toolchain is probed once at startup; anything missing is greyed out in the
Lab rather than failing at run time. The startup banner lists what was found.

| Language | Needs | Notes |
|----------|-------|-------|
| Java | JDK (`javac`, `java`) | Compiles then runs. The temp file is named after the class you declare, so `public class Fibonacci` just works. Compile errors are reported as a **build** failure, separately from runtime output. |
| PostgreSQL | `psql` on PATH | Runs against `DATABASE_URL` (default `postgresql://postgres:postgres@localhost:5432/postgres`). Start one with `docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`. |
| Bash | WSL, else Git Bash | Prefers **WSL** so snippets run against real Linux — `apt`, `/proc`, real coreutils — matching the Linux phases. |
| Python | `python` (Win) / `python3` | On Windows `python3.exe` is usually the Microsoft Store stub, so `python` is tried first. |
| Node.js | `node` | |
| SQLite | `sqlite3` | Fresh throwaway db per run. |
| C / C++ | `gcc` / `g++` | Not installed by default on Windows — MSYS2 or WSL provides them. |

### Why Bash prefers WSL on Windows

Git Bash's MSYS layer reparents grandchildren at birth: run `sleep 60` and the
`sleep.exe` process is already pointing at a dead parent before it starts, so it
is unreachable from the script's process tree. No amount of `taskkill /T`
walking can find it, and a timed-out snippet leaks the process. WSL tears the
whole command down with its relay, so timeouts leave nothing behind. If only Git
Bash is available the runner still works — a killed snippet may just leave a
stray background process.

## Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` | Search lessons and full text |
| `Ctrl+J` | Toggle the Claude dock |
| `Ctrl+B` | Show / hide the left sidebar |
| `Ctrl+Shift+B` | Toggle library / today |
| `Ctrl+E` | Edit the open lesson |
| `Ctrl+S` | Save |
| `Ctrl+Enter` | Run code in the Lab |

## Config

Environment variables, all optional:

| Var | Default | Purpose |
|-----|---------|---------|
| `UPSKILL_DIR` | `../Upskill` | Content repo to read and write |
| `PORT` | `4321` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address — localhost only by default |
| `CLAUDE_BIN` | `claude.cmd` on Windows, else `claude` | Path to the Claude CLI |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postgres` | Target for the PostgreSQL scratchpad |
| `RUN_TIMEOUT_MS` | `20000` | Code runner time limit |
| `UPSKILL_NO_CONPTY` | unset | Set to `1` to fall back to winpty if ConPTY misbehaves |

Setting one for a single run:

```powershell
# PowerShell
$env:PORT = 4400; npm run serve
```

```cmd
:: cmd.exe
set "PORT=4400" && npm run serve
```

```bash
# bash
PORT=4400 npm run serve
```

## Notes

Snippets run directly on this machine with no sandbox — it's a personal
scratchpad on your own box, and the runner is reachable only from localhost.
Don't bind it to `0.0.0.0` on a shared network.

## Layout

```
server/
  index.js          HTTP + WebSocket routing
  config.js         paths, ports, platform defaults
  lib/library.js    parses the Upskill repo into phases and days
  lib/terminal.js   persistent pty sessions (ConPTY on Windows)
  lib/runner.js     per-language execution with timeouts and tree kills
  lib/progress.js   streak, completion, and activity tracking
  lib/templates.js  new-lesson templates matching repo conventions
web/src/            React UI (Vite)
data/               progress.json + scratch run dirs — safe to delete
```
