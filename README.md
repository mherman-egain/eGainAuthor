# eGain Author — Knowledge Authoring Console

A Vite + React + TypeScript single-page application for authoring eGain Knowledge Base content: folder trees, HTML articles, checkout/check-in/publish, and governance metadata. It talks to the **eGain Knowledge Authoring Interaction REST APIs** using classic password session auth (`X-egain-session`).

| | |
|---|---|
| **Package** | `egain-author` `1.0.0` |
| **Live demo** | https://aznadestzw4.egdemo.info/demo/mherman/author/index.html |
| **Repo deploy path** | `s3://egain-presales-demo-websites/demo/mherman/author/` |
| **API docs (in-repo)** | [`docs/API_BRIEF.md`](docs/API_BRIEF.md), [`docs/AUTHORING_ENDPOINTS.md`](docs/AUTHORING_ENDPOINTS.md), [`docs/api-endpoints.json`](docs/api-endpoints.json) |

---

## Table of contents

1. [Business context](#1-business-context)
2. [What the product does](#2-what-the-product-does)
3. [Tech stack](#3-tech-stack)
4. [Quick start](#4-quick-start)
5. [Architecture overview](#5-architecture-overview)
6. [Runtime data flow](#6-runtime-data-flow)
7. [Routing and deep links](#7-routing-and-deep-links)
8. [Authentication and sessions](#8-authentication-and-sessions)
9. [Console features (detailed)](#9-console-features-detailed)
10. [eGain API integration](#10-egain-api-integration)
11. [State, persistence, and preferences](#11-state-persistence-and-preferences)
12. [Environment variables](#12-environment-variables)
13. [Local vs production networking](#13-local-vs-production-networking)
14. [Deployment (S3 + CloudFront)](#14-deployment-s3--cloudfront)
15. [Project map](#15-project-map)
16. [Design decisions and constraints](#16-design-decisions-and-constraints)
17. [Guidance for AI agents working in this repo](#17-guidance-for-ai-agents-working-in-this-repo)

---

## 1. Business context

### Problem

eGain tenants already have Knowledge Authoring APIs, but day-to-day authors often need a focused browser console for:

- Navigating the department **Shared** knowledge tree
- Editing article HTML with a full rich-text experience
- Enforcing checkout/check-in before changes
- Publishing and reviewing metadata (type, GenAI inclusion, notes, versions)

This app is a **standalone authoring SPA** aimed at knowledge authors, CX knowledge teams, and pre-sales demos — not a replacement for the full eGain Administration Console.

### Value

- Faster folder/article browsing with multi-select, clipboard, and drag-and-drop move
- Shareable deep links to a folder or article
- Demo Mode for UI walkthroughs without tenant access or CORS setup
- Same REST contracts eGain documents for Knowledge Authoring (v20)

### Out of scope (today)

- OAuth / SAML / SSO login UI (password session only)
- Personal folder tree (intentionally ignored; Shared only)
- Interaction / CSR / case APIs
- Server-side BFF or httpOnly session cookies — credentials and session live in the browser

---

## 2. What the product does

After sign-in the user lands in a three-pane **Authoring Console**:

| Pane | Role |
|------|------|
| **Folders** | Shared-folder tree: expand/lazy-load, multi-select, create/rename/delete, cut/copy/paste |
| **Articles** | Articles in the open folder: select, create, delete, cut/copy/paste, drag onto folders to move |
| **Editor** | TinyMCE HTML body + title; checkout / save / check-in / publish; autosave when enabled |
| **Properties** (optional) | Docked or modal side panel: type, GenAI, notes, topics, attachments, versions |

Header provides global article search, Create, KB language, and user/logout.

Selection is **URL-driven**: opening a folder or article always navigates to a deep-link path so reloads and shared links restore the same view (after login if needed).

---

## 3. Tech stack

| Layer | Choice | Notes |
|-------|--------|--------|
| UI | React 19 + React DOM | Function components |
| Language | TypeScript ~6 | `tsc -b` before Vite build |
| Build | Vite 8 (`@vitejs/plugin-react`) | Path alias `@/*` → `src/*` |
| Routing | `react-router-dom` 7 | BrowserRouter locally; HashRouter when `BASE_URL !== '/'` |
| State | Zustand 5 | `sessionStore`, `consoleStore`, `toastStore` |
| Editor | TinyMCE 8 + `@tinymce/tinymce-react` | Self-hosted under `public/tinymce` (GPL) |
| Lint | oxlint | `npm run lint` |
| Utils | `clsx`, `date-fns` | |

**Scripts**

| Script | Action |
|--------|--------|
| `npm run dev` | Vite dev server on port **5173** |
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run preview` | Preview production build (includes `/api-proxy`) |
| `npm run lint` | oxlint |
| `postinstall` | `scripts/copy-tinymce.mjs` copies TinyMCE into `public/tinymce` (gitignored) |

---

## 4. Quick start

```bash
npm install          # also copies TinyMCE → public/tinymce
cp .env.example .env # optional
npm run dev          # http://localhost:5173
```

On first load you are sent to **Login**.

- **Live tenant:** enter server URL + username/password → session header stored → console loads Shared folders.
- **Demo Mode:** **Enter Demo Mode** on the login screen — full UI with in-memory sample data, no network.

```bash
npm run build && npm run preview
```

---

## 5. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser SPA (React Router)                                      │
│  ┌─────────────┐  ┌──────────────────────────────────────────┐  │
│  │ LoginPage   │  │ ConsolePage                              │  │
│  │ /login      │  │ /  · /folder/:id  · /folder/:id/article/:a│  │
│  └──────┬──────┘  └──┬───────────┬────────────┬──────────────┘  │
│         │            │           │            │                 │
│         ▼            ▼           ▼            ▼                 │
│  sessionStore    FolderTree  ArticleList  ArticleEditor         │
│       │              │           │         PropertiesPanel      │
│       ▼              └───── consoleStore ─────┘                 │
│  ApiClient (live | demo)                                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
   Vite /api-proxy (dev)            Direct tenant (prod)
   X-Target-Server → eGain          VITE_API_DIRECT=true
```

### Layers

1. **Pages** (`src/pages/`) — route-level shells; auth gate; URL ↔ selection sync.
2. **Components** (`src/components/`) — folders, articles, editor, properties, layout, common UI.
3. **Stores** (`src/store/`) — session, console KB state, toasts.
4. **API facade** (`src/api/client.ts`) — `ApiClient` interface implemented by live REST and demo adapter.
5. **HTTP** (`src/api/http.ts`) — URL resolution, headers, error mapping, session-expiry notify.
6. **Domain modules** — `auth.ts`, `folders.ts`, `articles.ts`, `composite.ts`, `mappers.ts`, `articleStamp.ts`.
7. **Utils** — deep links, auth return paths, clipboard paste, DnD MIME, folder selection helpers, `localStorage`.

There is **no** Redux, TanStack Query, or server framework. The SPA is the full client.

---

## 6. Runtime data flow

### Boot

1. `main.tsx` chooses `HashRouter` if `import.meta.env.BASE_URL !== '/'`, else `BrowserRouter`.
2. `App` → `BootGate` calls `sessionStore.hydrate()` once:
   - Restores `egain-author:session` / server URL from `localStorage`, or
   - Forces demo if `VITE_FORCE_DEMO=true`, or
   - Leaves unauthenticated.
3. Routes render. Unauthenticated console routes redirect to login (see [§8](#8-authentication-and-sessions)).

### Authenticated console

1. `ConsolePage` loads folders + article types when authenticated.
2. URL params drive selection:
   - No folder in URL → `replace` navigate to first root folder deep link.
   - `/folder/:folderId` → `selectFolder` → load articles for that folder.
   - `/folder/:folderId/article/:articleId` → also `selectArticle` → load article detail into editor.
3. UI actions that change “where you are” **navigate** via `folderPath` / `articlePath` instead of selecting only in the store. The sync effect then loads data.

### Mutations

Editor save / check-in / publish and property edits go through `sessionStore.getClient()` → live or demo `ApiClient`. List/tree refreshes happen via `consoleStore.loadArticles` / `loadFolders` after successful mutations. Optimistic concurrency uses cached `lastModified` stamps (`src/api/articleStamp.ts`).

---

## 7. Routing and deep links

Routes are declared in `src/App.tsx`. Path builders live in `src/utils/deepLinks.ts`.

| Path | Meaning |
|------|---------|
| `/login` | Sign-in (optional `?next=` return path) |
| `/` | Console; if authenticated with folders, redirects to first folder |
| `/folder/:folderId` | Open folder (article list) |
| `/folder/:folderId/article/:articleId` | Open article in editor |
| `*` | Redirect to `/` |

Helpers:

```ts
folderPath(folderId)  // → /folder/{encodeURIComponent(id)}
articlePath(folderId, articleId)  // → /folder/.../article/...
decodeIdParam(param)  // decodeURIComponent-safe
```

**Production deep links** (HashRouter + subdirectory):

```text
https://aznadestzw4.egdemo.info/demo/mherman/author/index.html#/folder/{folderId}/article/{articleId}
```

**Local** (BrowserRouter): `/folder/{folderId}/article/{articleId}`.

**Always use deep links in the UI** when changing the open folder/article (FolderTree click, ArticleList open, Header search hit, create article, back-to-list, cut/move cleanup). Do not call `selectFolder` / `selectArticle` alone for navigation; the URL is the source of truth for “what screen am I on.”

---

## 8. Authentication and sessions

### Password session (primary)

Implemented in `src/api/auth.ts` + `src/store/sessionStore.ts`.

1. User submits tenant URL + username + password on `LoginPage`.
2. App calls:

   `POST /{contextRoot}/ws/v20/authentication/user/login?forceLogin=yes`

   Body: `{ userName, password }`.

3. Session GUID is read from response header **`X-egain-session`** (proxied with `Access-Control-Expose-Headers` locally).
4. Profile load:

   `GET …/administration/user/login/{loginId}?$attribute=all`

   Home department: `departments.department[].id` where `home=yes`. **Required** for folder listing. Department is never set via env.
5. Persist session slice under `egain-author:session` and server URL under `egain-author:serverUrl`.

Subsequent KB calls send:

- `Accept: application/json`
- `Content-Type: application/json` (mutations)
- `Accept-Language` (console language, default `en-us`)
- `X-egain-session: {sessionId}`

### Demo Mode

- Login button **Enter Demo Mode** → `enterDemoMode()` → `createDemoClient()` (`src/api/demo/`).
- No remote calls; sample Shared-relative tree and articles.
- Header shows a Demo Mode badge; `serverUrl` is `demo://local`.
- Force on boot: `VITE_FORCE_DEMO=true`.

### Session expiry

1. `apiRequest` in `src/api/http.ts` detects invalid/expired session (401 / well-known messages) and calls `notifySessionExpired`.
2. `SessionExpiryBridge` in `App.tsx` registers the handler:
   - `clearLocalAuth()` (clears storage, resets console)
   - Toast: “Your session expired…”
   - Navigate to `/login?next=<current path>` so re-login restores the deep link.
3. Successful login / demo entry calls `resetSessionExpiredGuard()`.

### Return path after login (`src/utils/authReturn.ts`)

| Scenario | Behavior |
|----------|----------|
| Open console/deep link while logged out | Redirect to `/login?next=/folder/...` (or article path) |
| Login / Demo success | `Navigate` to sanitized `next`, else `/` |
| Session timeout mid-work | Same `next=` capture via expiry bridge |
| Manual **Log out** | **No** `next` — clean `/login` |

Manual logout sets `beginSuppressReturnPath()` so `ConsolePage`’s auth guard cannot race and attach the prior folder/article as `next`. Suppression clears when `LoginPage` mounts (`endSuppressReturnPath()`).

`sanitizeReturnPath` rejects absolute URLs, `//…`, and `/login` itself.

### Logout

1. Header navigates after `logout()`.
2. `logout()` begins suppress-return, `clearLocalAuth()`, best-effort `DELETE` logout API, resets expiry guard.
3. Final navigate to `/login` without query.

---

## 9. Console features (detailed)

### Folders — `src/components/folders/FolderTree.tsx`

- Tree roots = children of department **Shared** (Shared/Personal nodes themselves are not shown as roots).
- **Lazy load:** expand loads children with `$level=1` paging (`$pagesize=75`). Never `$level=-1` (large Shared trees 504).
- Expand chevron only when the folder has / may have children.
- Open folder = navigate to `folderPath(id)`.
- Multi-select (⌘/Ctrl click), Shift+range, context menu: Cut, Copy, Paste, Rename, Delete, Create.
- Drop target for article drag-and-move (`ARTICLE_DND_MIME`).
- Filter box filters visible names client-side.

### Articles — `src/components/articles/ArticleList.tsx`

- Lists articles for `selectedFolderId`.
- Open = `articlePath(folderId, articleId)`.
- Multi-select + Shift+range; Select all; Delete; cut/copy/paste shortcuts (⌘/Ctrl+C/X/V).
- Drag selected articles onto a folder to move.
- After cut-move / delete, navigate back to folder deep link (closes editor).

### Clipboard paste — `src/utils/kbPaste.ts`

In-memory clipboard on `consoleStore` (`KbClipboard`: articles|folders × copy|cut).

- **Cut + paste** → move; clipboard cleared.
- **Copy + paste** → copy; clipboard kept.
- Multi-article **copy** uses Composite API when N > 1 (eGain copy accepts one id per call).

### Editor — `src/components/editor/ArticleEditor.tsx` + `HtmlEditor.tsx`

- TinyMCE self-hosted (`licenseKey="gpl"`), menus/tables/media/code/fullscreen; uncontrolled after mount to preserve caret.
- Editable only when article is checked out by the current user.
- Dirty = draft title/content ≠ saved baseline; `acceptEditorBaseline` adopts TinyMCE-normalized HTML after mount so untouched articles are not falsely dirty.
- **Autosave:** 5s idle (`AUTO_SAVE_IDLE_MS`) when dirty + editable; preference `uiPrefs.autoSave`.
- Inline Saving… / Saved status (not toast spam for routine saves).
- Concurrency: `lastModified` remembered in `articleStamp` and sent on checkout/check-in/publish/edit as required by API.

### Properties — `src/components/properties/PropertiesPanel.tsx`

- Modal or **docked** right panel (`propertiesAnchored` in uiPrefs).
- Narrow viewport (≤1100px): un-anchor and close; use header/mobile entry.
- Editable when checked out by you: article type, Include in GenAI, notes.
- Read-only: topics, attachments, custom attributes; version history in a modal.

### Layout — `src/pages/ConsolePage.tsx`

- Resizable folder width (180–480, default 280) and article width (200–520, default 300) via `useResizablePanel` → `uiPrefs`.
- Mobile tabs: Folders / Articles / Editor (and properties flow) at max-width 1100px.

### Header — `src/components/layout/Header.tsx`

- Debounced global search (~280ms) → results navigate with `articlePath(folderId, id)`.
- Create article modal owned by ConsolePage.
- Language select drives `Accept-Language` and reloads.
- User menu → logout.

---

## 10. eGain API integration

### URL shape

```text
{tenantOrigin}/{contextRoot}/ws/{version}/...
```

Defaults: `contextRoot=system`, `version=v20` (`VITE_CONTEXT_ROOT`, `VITE_API_VERSION`).

Documented `/ws/v12/...` paths are rewritten to **v20** in `normalizeWsVersion` (`http.ts`) and in the Vite proxy. Leave `/ws/v19/...` alone (OAuth docs; unused by this UI).

### Client facade — `src/api/client.ts`

`ApiClient` is the single surface UI/stores call: folders, articles, checkout/check-in/publish, search, types, attachments, notes, logout.

- **Live:** `createLiveClient(auth)` wraps `auth.ts` / `folders.ts` / `articles.ts` / composite helpers.
- **Demo:** `createDemoClient()` wraps `demo/demoAdapter.ts`.

### Folders — `src/api/folders.ts`

- Resolve Shared via shallow `GET kb/folder?department={id}` (Personal ignored).
- List children: `GET kb/folder?parent={id}&$level=1&$pagesize=75&$pagenum=n`.
- `loadMoreFolderChildren` continues paging when `hasMoreChildren`.
- Create under Shared (or selected parent); rename/edit/delete/move/copy as exposed by REST.

### Articles — `src/api/articles.ts`

- List by folder, get detail (`$attribute` as needed), create/edit/delete, move, copy, checkout/check-in/publish, search, versions.
- Prefer native multi-id APIs for move/delete; Composite for multi-copy.

### Composite — `src/api/composite.ts`

- `POST /ws/v20/composite`, chunk size 25.
- Used when an operation must fire many independent copy calls; not for long dependent chains.

### Mappers — `src/api/mappers.ts`

Normalize polymorphic eGain JSON (nested wrappers, pagination hints, checkout user, GenAI flags, etc.) into app types in `src/types/index.ts`.

---

## 11. State, persistence, and preferences

### Zustand stores

| Store | File | Responsibility |
|-------|------|----------------|
| `useSessionStore` | `sessionStore.ts` | serverUrl, sessionId, user, departmentId, demoMode, `ApiClient`, hydrate/login/logout/clearLocalAuth |
| `useConsoleStore` | `consoleStore.ts` | folders, articles, selections, clipboard, drafts/dirty, autosave, properties dock, search, language, mobile panel |
| `useToastStore` | `toastStore.ts` | ephemeral toasts |

`resetConsole()` clears KB UI state on logout / session clear.

### localStorage (`src/utils/storage.ts`)

Prefix: `egain-author:`

| Key | Contents |
|-----|----------|
| `session` | SessionState (sessionId, user, demoMode, …) |
| `serverUrl` | Last tenant URL |
| `recentServers` | Recent URLs for login datalist |
| `uiPrefs` | `autoSave`, `propertiesAnchored`, `folderWidth`, `articleWidth` |

---

## 12. Environment variables

See [`.env.example`](.env.example). All `VITE_*` values are baked into the client at build time.

| Variable | Default / notes |
|----------|-----------------|
| `VITE_DEFAULT_SERVER_URL` | Login field default |
| `VITE_CONTEXT_ROOT` | `system` |
| `VITE_API_VERSION` | `v20` |
| `VITE_BASE_PATH` | `/` locally; `/demo/mherman/author/` in CI |
| `VITE_API_DIRECT` | `true` in S3 build — browser calls tenant origin |
| `VITE_API_PROXY_BASE` | Optional absolute reverse-proxy prefix (disables direct when set in CI) |
| `VITE_FORCE_DEMO` | Force demo on hydrate |

Department id is **not** configurable — always from the logged-in user profile.

---

## 13. Local vs production networking

### Local / preview (`npm run dev`, `npm run preview`)

1. Browser requests `/api-proxy/system/ws/v20/...`.
2. Vite middleware (`vite.config.ts` → `egainProxyPlugin`) reads **`X-Target-Server`** (tenant base from login).
3. Forwards to `{tenant}{path}`; rewrites `/ws/v12` → `/ws/v20`; prepends context root when path starts with `/ws/`.
4. Exposes `X-egain-session` to the browser.
5. Avoids browser CORS against the tenant during development.

### Production S3 deploy

- No Vite proxy.
- Build sets `VITE_API_DIRECT=true` (unless `VITE_API_PROXY_BASE` is set).
- Browser calls the tenant origin directly → **tenant must allow CORS** from:

  `https://aznadestzw4.egdemo.info`

- HashRouter so deep links never hit S3 as missing keys (`/login`, `/folder/...`).

If login fails with CORS in the console, allow the CloudFront origin in eGain Administration, or point `VITE_API_PROXY_BASE` at a reverse proxy that supports POST and exposes `X-egain-session`.

---

## 14. Deployment (S3 + CloudFront)

Workflow: [`.github/workflows/deploy-s3.yml`](.github/workflows/deploy-s3.yml)

| Item | Value |
|------|--------|
| Trigger | Push to `main`, `workflow_dispatch` |
| Node | 22 |
| Base path | `/demo/mherman/author/` |
| Bucket default | `egain-presales-demo-websites` |
| Prefix | `demo/mherman/author` |
| Region default | `us-west-2` |
| App URL | https://aznadestzw4.egdemo.info/demo/mherman/author/index.html |

**Caching:** hashed assets long-cache; `index.html` `max-age=0,must-revalidate`; optional CloudFront invalidation when `CLOUDFRONT_DISTRIBUTION_ID` is set.

### GitHub secrets

| Secret | Required | Notes |
|--------|----------|--------|
| `AWS_ACCESS_KEY_ID` | yes | Deploy IAM |
| `AWS_SECRET_ACCESS_KEY` | yes | Deploy IAM |
| `AWS_REGION` | no | Default `us-west-2` |
| `S3_BUCKET_NAME` | no | Default bucket above |
| `CLOUDFRONT_DISTRIBUTION_ID` | no | Cache invalidation |
| `VITE_DEFAULT_SERVER_URL` | no | Baked into build |
| `VITE_CONTEXT_ROOT` / `VITE_API_VERSION` / `VITE_API_PROXY_BASE` | no | Optional overrides |

Never commit AWS credentials or production secrets into the repo.

---

## 15. Project map

```text
src/
  api/
    http.ts              # apiRequest, resolveApiUrl, session-expiry notify, wsPath
    client.ts            # ApiClient facade (live + demo)
    auth.ts              # login / logout / resolveLoggedInUser
    folders.ts           # Shared-only tree, lazy children, CRUD/move/copy
    articles.ts          # article CRUD, lifecycle, search
    composite.ts         # batched independent REST calls
    mappers.ts           # eGain JSON → app types
    articleStamp.ts      # lastModified concurrency cache
    demo/                # in-memory adapter + seed data
  components/
    folders/FolderTree.tsx
    articles/ArticleList.tsx
    editor/ArticleEditor.tsx, HtmlEditor.tsx
    properties/PropertiesPanel.tsx
    layout/Header.tsx
    common/              # Button, Modal, Toast, ContextMenu, …
  pages/
    LoginPage.tsx        # credentials + demo; honors ?next=
    ConsolePage.tsx      # shell, URL sync, create modal, resize, properties dock
  store/
    sessionStore.ts
    consoleStore.ts
    toastStore.ts
  utils/
    deepLinks.ts         # folderPath / articlePath
    authReturn.ts        # login?next= + logout suppress
    kbPaste.ts           # paste clipboard into folder
    articleDnD.ts        # drag MIME helpers
    folderSelection.ts   # range / prune nested folder ids
    storage.ts           # localStorage helpers + uiPrefs
  hooks/useResizablePanel.ts
  types/index.ts         # models + ApiError + isSessionExpiredError
  styles/                # design tokens + global CSS
docs/                    # API brief + endpoint catalog
.github/workflows/deploy-s3.yml
scripts/copy-tinymce.mjs
```

---

## 16. Design decisions and constraints

1. **Password session only** — OAuth/SAML types may exist in docs/legacy fields; the UI path is `X-egain-session`.
2. **Shared-only tree** — Personal is never loaded as a navigable root; Shared is required.
3. **No full-tree expand** — `$level=-1` avoided; lazy expand + `$pagesize=75`.
4. **URL is selection truth** — navigate for open folder/article; store loads follow the route.
5. **Checkout gate** — body and property edits require checkout by current user.
6. **TinyMCE self-hosted GPL** — `postinstall` copies assets; editor uncontrolled after mount.
7. **Dirty baseline** — TinyMCE HTML rewrite must not mark a fresh open as unsaved (`acceptEditorBaseline`).
8. **Composite for multi-copy** — not a general substitute for multi-id move/delete.
9. **HashRouter on subdirectory deploys** — S3 has no SPA rewrite for `/login` or `/folder/...`.
10. **Session in localStorage** — convenient SPA restore; not a hardened BFF session.
11. **Logout must not restore** — suppress `next` during intentional logout to avoid racing the auth guard.
12. **CORS in production** — direct tenant calls need the CloudFront origin allowed.

---

## 17. Guidance for AI agents working in this repo

When changing behavior, preserve these invariants unless the user explicitly asks otherwise:

1. **Navigation:** Opening a folder/article must `navigate(folderPath|articlePath(...))`. URL sync in `ConsolePage` loads data. Do not “select only in Zustand” for primary navigation.
2. **Auth redirects:** Unauthenticated access to console routes uses `loginRedirectForLocation`. Session expiry uses `SessionExpiryBridge`. Manual logout must call `beginSuppressReturnPath` (already in `logout()`).
3. **Folders API:** Do not introduce `$level=-1` Shared expand. Keep Personal out of the tree roots.
4. **Checkout:** Do not allow content/property mutation when the article is not checked out by the current user.
5. **API surface:** Prefer extending `ApiClient` + live/demo implementations together so Demo Mode stays usable.
6. **Persistence:** UI prefs go through `loadUiPrefs` / `saveUiPrefs`; session via `sessionStore` persist helpers.
7. **Deploy constraints:** Production has no `/api-proxy`. Features that assume the Vite middleware will break on S3 unless they work with `VITE_API_DIRECT`.
8. **Docs:** Detailed endpoint semantics live under `docs/`; keep README aligned when routes, auth, or deploy paths change.
9. **Commits:** Only commit/push when the user asks.

### Mental model checklist

```text
User action → deep-link navigate (when place changes)
           → ConsolePage effect → selectFolder / selectArticle
           → ApiClient → http (proxy or direct) → eGain
           → mappers → consoleStore → React UI
```

Expired session → clearLocalAuth + `/login?next=…` → login → return to deep link.

---

## License / TinyMCE

TinyMCE is used under its GPL license key configuration in `HtmlEditor` (`licenseKey="gpl"`). Ensure distribution compliance for your deployment context.
