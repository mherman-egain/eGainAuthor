# eGain Author — Knowledge Authoring Console

A Vite + React + TypeScript SPA for authoring eGain knowledge: folders, articles, rich HTML editing (TinyMCE), checkout/checkin/publish, and metadata — backed by the **eGain Knowledge Authoring Interaction REST APIs**.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). On first load you are sent to **Login**.

**Demo Mode (no tenant required):** click **Enter Demo Mode** on the login screen to explore the full console with realistic sample data.

```bash
npm run build    # production build
npm run preview  # preview the build
```

## Deploy (S3 + CloudFront)

Pushes to `main` run [`.github/workflows/deploy-s3.yml`](.github/workflows/deploy-s3.yml), which builds with base path `/demo/mherman/author/` and syncs to:

`s3://egain-presales-demo-websites/demo/mherman/author/`

**Live URL:** https://aznadestzw4.egdemo.info/demo/mherman/author/index.html

Subdirectory deploys use **hash routing** (`#/login`, `#/`) so CloudFront never
requests non-existent S3 keys like `/login` or a bare trailing slash.

### One-time GitHub secrets

In the repo: **Settings → Secrets and variables → Actions**, add:

| Secret | Required | Notes |
|--------|----------|--------|
| `AWS_ACCESS_KEY_ID` | yes | Deploy IAM user |
| `AWS_SECRET_ACCESS_KEY` | yes | Deploy IAM user |
| `AWS_REGION` | no | Default `us-west-2` |
| `S3_BUCKET_NAME` | no | Default `egain-presales-demo-websites` |
| `CLOUDFRONT_DISTRIBUTION_ID` | no | Clears CDN cache after upload |
| `VITE_DEFAULT_SERVER_URL` | no | Baked into the production build |

Do **not** put AWS keys in the repo or in `.env` files that get committed.

### API proxy on CloudFront

The Vite `/api-proxy` middleware exists only in local `npm run dev` / `preview`. The S3 deploy uses **`VITE_API_DIRECT=true`**, so the browser calls your eGain tenant URL directly.

That requires the tenant to allow CORS from:

`https://aznadestzw4.egdemo.info`

If login fails with a CORS error in the browser console, allow that origin in eGain (or set `VITE_API_PROXY_BASE` to a real reverse-proxy URL that supports POST).

## Routes

| Path | Screen |
|------|--------|
| `/login` | Server URL + username/password (`X-egain-session`) + Demo Mode |
| `/` | Authoring Console (requires auth or demo) |

## Server URL & proxy

1. Enter your tenant base URL, e.g. `https://your-tenant.egain.cloud`.
2. Locally, browser calls go to `/api-proxy/...` on the Vite dev server.
3. The proxy forwards to the tenant using the `X-Target-Server` header.
4. Paths like `/ws/...` are prefixed with the context root (default `system`) → `/system/ws/v20/...`.
5. Production S3 builds use direct tenant calls (`VITE_API_DIRECT=true`) unless `VITE_API_PROXY_BASE` is set.

### API version rule

- Authoring / KB / session APIs use **`/ws/v20/...`** (`VITE_API_VERSION=v20`).
- Documented **`/ws/v12/...`** paths are rewritten to **v20** (`normalizeWsVersion` in `src/api/http.ts` and the Vite proxy).

API notes live in [`docs/API_BRIEF.md`](docs/API_BRIEF.md), [`docs/AUTHORING_ENDPOINTS.md`](docs/AUTHORING_ENDPOINTS.md), and [`docs/api-endpoints.json`](docs/api-endpoints.json).

## Authentication

### Password session (`X-egain-session`)

Login submits username/password to:

`POST /system/ws/v20/authentication/user/login?forceLogin=yes`

The app stores the returned `X-egain-session` header and sends it on later API calls.

After login, the app loads the user profile and reads the home department from `departments.department[].id` (`home=yes`). That id drives `GET /kb/folder?department={id}` for the folder tree.

Session id, server URL, and user (including department) are stored in `localStorage` under the `egain-author:` prefix.

### Demo Mode

Uses an in-memory adapter with sample folders/articles. No network calls. Useful for UI review when CORS/tenant access is unavailable. Force with `VITE_FORCE_DEMO=true`.

## Console features

- **Folders:** tree, create, rename, copy/move, delete, refresh, filter
- **Articles:** list by folder (ID, status, author, last updated), create, copy, move, delete
- **Editor:** TinyMCE HTML editor (menus, tables, media, code view, fullscreen), title, checkout / check-in / save / publish
- **Properties:** type, GenAI toggle, notes, topics, attachments, custom attributes, version history
- **Header:** brand, search, + Article, language, user menu, logout

## Project structure

```
src/
  api/           # HTTP client, auth, folders, articles, demo adapter
  components/    # UI (folders, articles, editor, properties, layout)
  pages/         # Login, Console
  store/         # Zustand session + console + toasts
  types/         # Shared TypeScript models
  styles/        # Design tokens + global CSS
docs/            # API brief & endpoint catalog
```

## Environment variables

See [`.env.example`](.env.example).

| Variable | Purpose |
|----------|---------|
| `VITE_DEFAULT_SERVER_URL` | Default tenant URL on login |
| `VITE_CONTEXT_ROOT` | Path prefix before `/ws` (default `system`) |
| `VITE_API_VERSION` | Authoring API version (default `v20`) |
| `VITE_BASE_PATH` | Subdirectory base for production deploy |
| `VITE_API_DIRECT` | Call tenant directly (CORS required) |
| `VITE_API_PROXY_BASE` | Absolute reverse-proxy prefix |
| `VITE_FORCE_DEMO` | Force demo mode |

## CORS note

Locally, the Vite proxy relays requests. Production direct mode requires the eGain tenant to allow your CloudFront origin (or a configured `VITE_API_PROXY_BASE`).
