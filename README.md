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
| `VITE_OAUTH_*` / `VITE_DEFAULT_SERVER_URL` | no | Baked into the production build |

Do **not** put AWS keys in the repo or in `.env` files that get committed.

### API proxy on CloudFront

The Vite `/api-proxy` middleware exists only in local `npm run dev` / `preview`. The S3 deploy uses **`VITE_API_DIRECT=true`**, so the browser calls your eGain tenant URL directly.

That requires the tenant to allow CORS from:

`https://aznadestzw4.egdemo.info`

If login fails with a CORS error in the browser console, allow that origin in eGain (or set `VITE_API_PROXY_BASE` to a real reverse-proxy URL that supports POST).

## Routes

| Path | Screen |
|------|--------|
| `/login` | Server URL + Login (OAuth) + Demo Mode + optional password session |
| `/oauth/callback` | OAuth redirect handler (PKCE) |
| `/` | Authoring Console (requires auth or demo) |

## Server URL & proxy

1. Enter your tenant base URL, e.g. `https://your-tenant.egain.cloud`.
2. Browser calls go to `/api-proxy/...` on the Vite dev server.
3. The proxy forwards to the tenant using the `X-Target-Server` header.
4. Paths like `/ws/...` are prefixed with the context root (default `system`) → `/system/ws/v20/...`.

### API version rule

- Authoring / KB / session APIs use **`/ws/v20/...`** (`VITE_API_VERSION=v20`).
- Documented **`/ws/v12/...`** paths are rewritten to **v20** (`normalizeWsVersion` in `src/api/http.ts` and the Vite proxy).
- OAuth **client application** endpoints that are documented as **v19** stay on **v19** (e.g. `/ws/v19/clientapplications/authentication/oauth2/token`).

API notes live in [`docs/API_BRIEF.md`](docs/API_BRIEF.md), [`docs/AUTHORING_ENDPOINTS.md`](docs/AUTHORING_ENDPOINTS.md), and [`docs/api-endpoints.json`](docs/api-endpoints.json).

## Authentication

### OAuth (primary Login button)

1. In eGain Administration Console: **Partition → Integration → Client Application**.
2. Create an SPA client with **Authorization Code + PKCE**.
3. Set redirect URI to `http://localhost:5173/oauth/callback` (or your deploy URL).
4. Copy Metadata **Authorization URL** and **Token URL**.
5. Copy `.env.example` → `.env` and set:

```env
VITE_DEFAULT_SERVER_URL=https://your-tenant.egain.cloud
VITE_OAUTH_CLIENT_ID=...
VITE_OAUTH_AUTH_URL=...
VITE_OAUTH_TOKEN_URL=...
VITE_OAUTH_REDIRECT_URI=http://localhost:5173/oauth/callback
```

6. Restart `npm run dev`, enter the server URL, click **Login**.

After login, the app loads the user profile and reads the home department from `departments.department[].id` (`home=yes`). That id drives `GET /kb/folder?department={id}` for the folder tree.

Session tokens, server URL, and user (including department) are stored in `localStorage` under the `egain-author:` prefix.

### Password session fallback

Expand **Password session login** on the login page. This calls:

`POST /system/ws/v20/authentication/user/login?forceLogin=yes`

and stores the returned `X-egain-session` header for subsequent API calls.

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
  pages/         # Login, OAuth callback, Console
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
| `VITE_OAUTH_*` | SPA OAuth client settings |
| `VITE_FORCE_DEMO` | Force demo mode |

## CORS note

Direct browser calls to eGain are avoided; the Vite proxy relays requests. For production, deploy a similar reverse proxy (or BFF) that injects the target host and forwards `X-egain-session` / `Authorization`.
