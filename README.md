# MindSpace

MindSpace is a local-first spatial workspace for notes, tasks, planning, and thinking. It combines an infinite canvas with more than 30 interactive node types, global search, quick capture, automations, and optional local AI.

Built as a desktop app with Tauri, React, TypeScript, and SQLite.

![MindSpace logo](src/assets/logo.png)

## Status

MindSpace is an actively developed, single-maintainer desktop app. It's used daily and evolves quickly — expect the occasional rough edge, and see [Known limitations](#known-limitations) below for what's not there yet.

## Highlights

- **Spatial canvas** — arrange, resize, connect, group, align, and duplicate nodes across projects and canvases.
- **Rich building blocks** — notes, tasks, Markdown, code, Kanban, calendars, habits, clocks, charts, feeds, bookmarks, files, AI chat, mental models, focus tools, and more.
- **Local-first storage** — workspace data and settings live in a local SQLite database. A rolling backup is created when the app starts.
- **Fast retrieval** — full-text search across the vault, plus optional semantic search and related-content suggestions.
- **Quick capture** — use the menu bar or a global shortcut to send a note or task to the Inbox without opening the main window.
- **The Brain** — optional local embeddings, retrieval, auto-filing, daily digests, and a knowledge graph powered by LM Studio.
- **AI when you want it** — connect LM Studio for private local workflows or OpenRouter for hosted models and speech features.
- **Customizable workspace** — themes, canvas effects, grid controls, node appearance, sounds, and configurable shortcuts.

MindSpace remains useful without an AI service. When LM Studio is unavailable, semantic features pause quietly and keyword search continues to work.

## Requirements

- macOS (the current Tauri bundle and native integrations are configured for macOS)
- [Bun](https://bun.sh/)
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri's [macOS prerequisites](https://v2.tauri.app/start/prerequisites/#macos)

Optional:

- [LM Studio](https://lmstudio.ai/) for local chat, embeddings, semantic memory, triage, and summaries
- An [OpenRouter](https://openrouter.ai/) API key for hosted AI and speech features

## Getting started

```bash
git clone https://github.com/mcbenaofficial/mindspace.git
cd mindspace
bun install
bun run tauri dev
```

The first launch creates the local database and seeds the built-in mental-model library.

To run only the browser UI:

```bash
bun run dev
```

The browser build is useful for UI work, but native features such as SQLite, the menu bar, notifications, global shortcuts, and Tauri commands require the desktop app.

## Optional AI setup

### LM Studio

1. Start LM Studio's local server.
2. Load a chat model for chat, summaries, triage, and digests.
3. Load an embedding model (for example, `nomic-embed-text`) to enable semantic search and suggestions.
4. Open **Settings → AI / Brain** in MindSpace and confirm the local endpoint and model settings.

If no embedding model is configured, MindSpace attempts to detect one from LM Studio.

### OpenRouter

1. Open **Settings** in MindSpace.
2. Add your OpenRouter API key.
3. Use the built-in connection test.

Keys are stored in the app's local settings database. Requests carrying API keys are restricted by the Tauri backend to supported hosts.

## Everyday shortcuts

On macOS, `⌘` is Command. On other development platforms, use the corresponding Control shortcut where supported.

| Shortcut | Action |
| --- | --- |
| `⌘ ⇧ Space` | Open Quick Capture (configurable) |
| `⌘ K` | Search the entire vault |
| `⌘ ⇧ G` | Open the knowledge graph |
| `⌘ Z` | Undo canvas changes |
| `⌘ ⇧ Z` | Redo canvas changes |
| `⌘ D` | Duplicate selected nodes |
| `⌘ G` | Group selected nodes |

Hold `⌘` while working with a node to reveal its contextual controls.

## Build for release

```bash
bun run tauri build
```

The current configuration produces macOS `.app` and `.dmg` bundles. Build output is written under `src-tauri/target/release/bundle/`.

To validate only the frontend:

```bash
bun run build
```

## Project structure

```text
mindspace/
├── src/
│   ├── components/
│   │   ├── canvas/       # React Flow canvas and node picker
│   │   ├── nodes/        # Interactive node implementations and registry
│   │   ├── modals/       # Search, capture, graph, and editor surfaces
│   │   ├── settings/     # Settings and automations UI
│   │   └── sidebar/      # Project and canvas navigation
│   ├── lib/
│   │   ├── brain/        # Embeddings, retrieval, triage, and suggestions
│   │   ├── rules/        # Automation engine
│   │   ├── zen/          # Generative focus visuals
│   │   └── db.ts         # SQLite schema, migrations, seeds, and backups
│   ├── store/            # Zustand state slices
│   ├── App.tsx           # Main desktop application
│   └── CaptureApp.tsx    # Lightweight menu-bar capture window
├── src-tauri/            # Rust commands, permissions, and desktop config
├── docs/                 # Change requests and project reports
└── CHANGELOG.md          # Version history
```

Node types are registered centrally in `src/components/nodes/registry.tsx`. Adding a node generally means creating its component and adding one registry entry with its label, category, icon, size, and default data.

## Tech stack

- Tauri 2 and Rust
- React 19 and TypeScript
- Vite 7 and Tailwind CSS 4
- React Flow for the canvas
- Zustand for application state
- SQLite through the Tauri SQL plugin
- TipTap for rich-text editing
- React Three Fiber and Canvas/Web Audio for generative visual experiences

## Data and privacy

- Workspace content is stored locally in `mindspace.db` within Tauri's application data directory.
- The app creates a database snapshot at startup and retains the latest backups.
- LM Studio workflows run against a local server.
- Network-backed nodes and OpenRouter features send only the data needed for the action you invoke.
- Canvas data can be exported to JSON and imported as a new canvas.

Review [CHANGELOG.md](CHANGELOG.md) for the full feature history.

## Known limitations

MindSpace is not yet hardened for untrusted or multi-user use. If you're evaluating it:

- There's no automated off-machine backup — the startup snapshot is local-only. Export canvases you care about.
- Settings (including any API keys you add) are stored locally and are not encrypted at rest.
- Search is currently keyword/FTS-based; semantic search quality depends on the LM Studio embedding model you choose.
- Canvas history (undo/redo) covers node operations, not every action in every node type yet.
- This is a single-maintainer project without a formal security review — treat it as you would any early-stage local-first app, and avoid pointing it at untrusted remote content.

## Contributing

This started as a personal tool and doesn't yet have a contributing guide or issue templates. Feel free to open an issue to discuss a bug or idea before sending a PR. No license file is currently included, which means default copyright applies — reach out via an issue if you'd like to use this beyond personal reference.
