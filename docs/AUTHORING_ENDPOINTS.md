# Authoring Console — Canonical Endpoints

Source: [REST API Index](https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/d3/dc8/web-service-index.html)
**Version policy:** Documentation pages may still show `/ws/v20/...`. This console always calls **`/ws/v20/...`** for those endpoints.

Common headers for KB calls after login:

- `X-egain-session: <session-guid>`
- `Accept: application/json`
- `Content-Type: application/json`
- `Accept-Language: en-US`

## Authentication

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ws/v20/authentication/user/login` | User login → `X-egain-session` response header. Body: `{ "userName", "password" }` |
| DELETE | `/ws/v20/authentication/user/logout` | End session |
| POST | `/ws/v19/clientapplications/authentication/oauth2/token` | Authenticate client application (OAuth). `Authorization: Basic base64(client_key:client_secret)`, `Content-Type: application/x-www-form-urlencoded` |
| POST | `/ws/v19/clientapplications/authentication/oauth2/revoke` | Revoke client access token |
| POST | `/ws/v19/authentication/user/sso/oauth2/token` | User SSO with SAML bearer token |

## Folders (`/ws/v20/kb/folder`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ws/v20/kb/folder` | Create folder under parent |
| PUT | `/ws/v20/kb/folder/{folderId}` | Edit folder (requires matching `lastModified.date`) |
| GET | `/ws/v20/kb/folder/{folderId}` | Get folder by id |
| GET | `/ws/v20/kb/folder?parent={parentFolderId}` | List child folders |
| GET | `/ws/v20/kb/folder?department={deptId}&$attribute=all` | Department root folders |
| POST | `/ws/v20/kb/folder/copy/{srcFolderId}` | Copy folder to destination |
| POST | `/ws/v20/kb/folder/move/{srcFolderId}` | Move folder (`?merge=0\|1`) |
| DELETE | `/ws/v20/kb/folder/{ids}` | Delete one or more folders |
| GET | Folder ACL API | Read folder permissions |

## Articles (`/ws/v20/kb/article`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ws/v20/kb/article` | Create article (`folder.id`, `language.id`, `versions.version[].name`, content) |
| GET | `/ws/v20/kb/article` / `.../{id}` | Get articles (`$attribute`, `$lang`, folder filters, pagination) |
| PUT | `/ws/v20/kb/article` | Edit checked-out article |
| DELETE | `/ws/v20/kb/article/{ids}` | Delete articles |
| PUT | `/ws/v20/kb/article/{IDs}/checkout` | Check out |
| PUT | `/ws/v20/kb/article/checkin` | Check in |
| PUT | `/ws/v20/kb/article/publish` | Publish |
| POST | `/ws/v20/kb/article/{IDs}/move` | Move to destination folder |
| GET | `/ws/v20/kb/article/{id}/version` | Versions |
| PUT | Change type / stage / lock APIs | Workflow helpers |
| POST | `/ws/v20/kb/article/suggestion` | Suggestions |

## Notes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ws/v20/kb/article/{id}/note` | Create note |
| GET | Notes API on article | Read notes |
| DELETE | `/ws/v20/kb/article/{id}/note/{noteId}` | Delete note |

## Attachments

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ws/v20/kb/attachment` | Create external/internal attachment |
| PUT | `/ws/v20/kb/attachment/external` | Edit external attachment |
| GET | `/ws/v20/kb/attachment` | Read attachments |
| DELETE | Delink attachments API | Unlink from article |

## Topics

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ws/v20/kb/topic` | Read topics |
| POST | `/ws/v20/kb/topic` | Create topic |
| PUT | `/ws/v20/kb/topic` | Edit topic |
| DELETE | `/ws/v20/kb/topic/{ids}` | Delete topics |
| POST | `/ws/v20/kb/topic/{topicId}/...` | Add/remove articles, move/copy |

## Article types / templates

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ws/v20/kb/articleType` | All article types and templates |
| GET | `/ws/v20/kb/articleType/articleTemplate/{Id}` | Single template |
| PUT | Change Article Type API | Change type on checked-out article |

## UI mapping

| Console area | Primary APIs |
|--------------|--------------|
| Login (server + OAuth) | Client OAuth token + user login/SSO |
| Folders tree | Get/Create/Edit/Copy/Move/Delete folder |
| Articles list | Get articles by folder; create/delete/move |
| Editor | Get article, checkout, edit, checkin, publish |
| Properties | Article attrs, type, notes, attachments, topics |
