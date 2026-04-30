# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlowInOne is a workflow diagram editor that decomposes business functionality into dependency-graph nodes (DAGs) and exports structured data for AI consumption. It uses a **local-first** approach — the frontend reads/writes workflow files directly to the user's local filesystem via the File System Access API, while the backend handles project metadata and real-time collaboration.

## Commands

### Backend (root directory, uses pnpm)
```bash
pnpm install                  # Install all workspace dependencies
pnpm run start:dev            # NestJS watch mode (port 9000)
pnpm run start:fastify:dev    # Fastify adapter dev mode
pnpm run build                # Compile to dist/
pnpm run format               # Prettier
pnpm run lint                 # ESLint
pnpm run type-check           # TypeScript check (no emit)
pnpm test                     # Jest unit tests
pnpm run test:watch           # Jest watch
pnpm run test:cov             # Coverage report
pnpm run test:e2e             # End-to-end tests

# MikroORM migrations
pnpm run migration:generate
pnpm run migration:run
```

### Frontend (in `frontend/` directory)
```bash
pnpm run dev      # Vite dev server (port 5173, proxies /api to localhost:9000)
pnpm run build    # Build to src/public/ (served as static by backend)
pnpm run test     # Vitest
pnpm run test:watch
```

## Architecture

### Monorepo Structure
- `src/` — NestJS backend
- `frontend/` — Vue 3 frontend (separate pnpm workspace)
- Frontend build output goes to `src/public/`, served as static files by the backend

### Backend (`src/`)
NestJS 11 + Fastify adapter. Key modules:

- **`src/project/`** — CRUD for projects via REST (`/api/v1/project/*`), backed by MikroORM entities in PostgreSQL
- **`src/collaboration/`** — WebSocket gateway (`ws://localhost:9000/ws`) for real-time multi-user editing; manages rooms, users, and operation logs
- **`src/main.ts`** — Bootstrap: Fastify adapter, WebSocket, Scalar API docs at `/api-reference`
- **`src/mikro-orm.config.ts`** — PostgreSQL (`@mikro-orm/postgresql`) + entity config; reads DB connection from YAML config file
- **`src/config/`** — YAML-based config loader (`config.loader.ts`); reads `src/config/{NODE_ENV}.yml` (e.g. `development.yml`); validated by Zod schema in `config.schema.ts`
- **`src/adapter-factory.ts`** — Switches between Express and Fastify adapters

### Frontend (`frontend/src/`)
Vue 3 + Vite + LogicFlow 2.x. IDE-style layout: sidebar (file browser) + main editor canvas.

**Key components:**
- `App.vue` — Root shell, owns workspace state, routes between WorkspaceManager and WorkflowEditor
- `components/WorkflowEditor.vue` — LogicFlow canvas; node creation, editing, undo/redo, WebSocket collaboration
- `components/WorkspaceManager.vue` — Directory picker UI for opening a local workspace
- `components/FileBrowser.vue` — File tree navigation using File System Access API

**Key services (singleton pattern via `getInstance()`):**
- `services/filesystem.service.ts` — Wraps File System Access API; IndexedDB persists directory handles across sessions; uses atomic writes (temp file + rename)
- `services/workflow-manager.service.ts` — Project lifecycle: open, save (500ms debounce), cache, change tracking
- `services/keyboard-shortcuts.service.ts` — Global keyboard bindings

**Supporting files:**
- `types/workflow.types.ts`, `types/workspace.types.ts`, `types/logicflow.types.ts` — Shared TypeScript types
- `utils/logicflow-converter.ts` — Converts between LogicFlow internal model and the workflow JSON format
- `config/logicflow.config.ts` — LogicFlow node/edge configuration
- `styles/logicflow.css` — Custom styles for LogicFlow canvas

### Communication
- **REST**: Frontend → `/api/v1/project/*` (proxied through Vite dev server)
- **WebSocket**: Frontend ↔ `ws://localhost:9000/ws` for real-time collaboration
- **Local files**: Workflow JSON files are read/written directly to the user's local filesystem; backend is not involved in file content storage

### Data Persistence
- **Project metadata** (name, timestamps): PostgreSQL via MikroORM (`ProjectEntity`, `ProjectAsset`, `NodeMetadataEntity`, `NodeExecutionHistoryEntity`)
- **Workflow content** (nodes, edges): JSON files in the user's local workspace directory
- **Directory handles**: Stored in IndexedDB for session persistence
- **Config**: DB connection and app settings read from `src/config/{NODE_ENV}.yml` at startup; never hardcoded

## Key Conventions
- All backend API routes are prefixed `/api/v1`
- Backend port: `9000`; Frontend dev port: `5173`
- API docs: `http://localhost:9000/api-reference` (Scalar)
- LogicFlow node types: `text`, `image`, `video`, `audio`, `file`, `decision`, `parallel`
- Frontend services use singleton `getInstance()` pattern — do not use `new` directly
- Workflow files are `.json`; backup files use `.bak` extension
