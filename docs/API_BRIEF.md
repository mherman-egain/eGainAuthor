# eGain Knowledge Authoring Interaction REST API — Implementation Brief

**Source:** [eGain REST API Reference Guide](https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/index.html)  
**Release documented:** 21.2 (modified May 31, 2021)  
**Companion machine-readable catalog:** [`api-endpoints.json`](./api-endpoints.json) (60 endpoints)

This brief is for building an authoring console SPA against the Knowledge Authoring APIs (plus auth/OAuth/session flows). Interaction/CSR APIs exist in the same guide but are out of scope except where noted.

---

## 1. Base URL and versions

| Item | Pattern |
|------|---------|
| Base | `https://{HOST}/{CONTEXT_ROOT}/ws/{version}/...` |
| Typical context root | `system` (seen in `Location` / `href` examples as `/system/ws/v20/...`) |
| Authoring / most KB APIs | **v12** — e.g. `/ws/v20/kb/article` |
| OAuth client app + SSO bearer | **v19** — e.g. `/ws/v19/clientapplications/authentication/oauth2/token` |
| SAML POST SSO | `/SAML/SSO/POST.controller` (outside `/ws/...`) |

Example article URL:

```http
GET https://{HOST}/system/ws/v20/kb/article/224000000002039?$attribute=all
X-egain-session: {session-guid}
Accept: application/json
```

---

## 2. Formats, CORS, compression

- **XML and JSON** supported. Default is XML. For SPA use `Accept: application/json` and `Content-Type: application/json` on mutate calls.
- **Dates/times:** ISO 8601.
- **CORS:** Supported; whitelist origins in eGain Administration Console.
- **Compression:** `Accept-Encoding: gzip` for responses. Request body compression not supported.
- **Sparse responses:** Use `$attribute=all` or `$attribute=name,content,...` to pull fields beyond summary defaults.

---

## 3. Authentication and session (SPA-critical)

### 3.1 Session lifecycle

1. Call **Login** (or SSO) — no `X-egain-session` required.
2. Server returns **`X-egain-session`** (GUID-like) in response headers.
3. Send that header on **every** subsequent call.
4. Call **Logout** to invalidate; timeout also invalidates.

APIs that do **not** require session: Login, various `.../hello` APIs, OAuth client-credentials token endpoint, SAML login entry points (as documented).

### 3.2 Login / Logout

| Method | Path | Success | Body |
|--------|------|---------|------|
| `POST` | `/ws/v20/authentication/user/login` | `204` | `{ "userName", "password" }` |
| `DELETE` | `/ws/v20/authentication/user/logout` | `204` | none |

**Login headers:** `Content-Type`, `Accept`, optional `Accept-Language`.  
**Login query:** `forceLogin=yes` — if user already has **5** concurrent WS sessions, terminates oldest and creates new.  
**Login response:** header `X-egain-session` only (no body on success).

**Logout headers:** `X-egain-session` required.

### 3.3 Handling 401

Re-login. Error body shapes:

- Knowledge Authoring (often): `{ "message": "User could not be authenticated. Invalid session ID." }`
- Interaction (often): `{ "code": "401-101", "developerMessage": "Invalid or expired 'X-egain-session' header..." }`

Causes: timeout, invalid/missing session, bad login credentials.

### 3.4 Console-embedded vs standalone SPA

| Mode | Session | CSRF |
|------|---------|------|
| **Standalone SPA / server BFF** | Send `X-egain-session` **as HTTP header** after Login | Not required for pure API login flow |
| **Inside eGain console custom pane** | Browser sends `X-egain-session` **cookie** automatically | Must send `X-egain-csrf` **header** (utility `getEgainSecurityToken` in sample `my_activities.html`) |

**SPA recommendation:** Use a backend-for-frontend (BFF) that:

1. Performs login (or receives SSO assertion) server-side.
2. Stores session securely (httpOnly cookie on your origin or server session).
3. Proxies `/ws/v20/kb/*` with `X-egain-session` to eGain.
4. Avoids putting partition passwords or long-lived secrets in the browser.

CORS alone is workable but weaker for credential handling.

### 3.5 SSO (user)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/SAML/SSO/POST.controller` | Form/query `SAMLResponse` (Base64) |
| `POST` | `/ws/v19/authentication/user/sso/oauth2/token` | `application/x-www-form-urlencoded`: `grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer`, `assertion=<Base64 SAML>` |

SSO bearer success (`200`):

- Body: `{ "access_token": "<session>", "token_type": "Bearer" }`
- Header: `X-egain-session` (same session)
- Requires `application_type=API` (query and/or SAML attribute)
- Optional `forceLogin=yes`; may auto-provision users if Admin setting enabled

Use `X-egain-session` for subsequent Authoring calls (same as password login).

### 3.6 OAuth — client application (not primary authoring user flow)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/ws/v19/clientapplications/authentication/oauth2/token` | `Authorization: Basic base64(client_key:client_secret)` |
| `POST` | `/ws/v19/clientapplications/authentication/oauth2/revoke` | `Authorization: Bearer <access_token>` |

Token request body: `grant_type=client_credentials` (form-urlencoded).  
Success `200` with access token + `expires_in`. Max **10** concurrent client sessions (`forceLogin=yes`).  
Revoke: `204`, empty body, no query params.

These tokens target **client-application** APIs (e.g. async messaging). Authoring console user flows should prefer **user login / SSO session**.

---

## 4. Common query parameters

All optional unless a specific API says otherwise. Names start with `$`.

| Param | Default | Notes |
|-------|---------|-------|
| `$pagenum` | `1` | Page number |
| `$pagesize` | `25` | 1–75 |
| `$rangestart` | `1` | Range start (mutually exclusive with page params) |
| `$rangesize` | `25` | 1–75 |
| `$sort` | — | Single attribute only |
| `$order` | `asc` | `asc` \| `desc` |
| `$lang` | user primary KB language | Language of authoring resource |
| `$level` | `0` | Hierarchy depth; `-1` = expand all |
| `$count` | — | `yes` = count + first-page link only |
| `$attribute` | summary/minimal | `all`, comma list, or blank for “default” set |

**Do not mix** `$pagenum`/`$pagesize` with `$rangestart`/`$rangesize` → `400`.

Typical collection response envelope:

```json
{
  "link": { "rel": "self", "href": "/system/ws/v20/kb/article?folder=..." },
  "paginationInfo": { "count": 2, "pagenum": 1, "pagesize": 25 },
  "article": [ /* resources */ ],
  "count": 2
}
```

Also common: `department: { "id", "name" }`, `language: { "id", "code", "label" }`, `lastModified` / `created` with nested `user`.

---

## 5. Composite API

| Method | Path |
|--------|------|
| `POST` | `/ws/v20/composite` |

Body: array of nested requests with **absolute** URLs (host + context + path):

```json
{
  "request": [
    { "method": "GET", "url": "http://server1/system/ws/v20/kb/topic/500000000001000" },
    {
      "method": "POST",
      "url": "http://server1/system/ws/v20/kb/article",
      "requestBodyText": "{\"folder\":{\"id\":\"500000000002073\"},\"language\":{\"id\":\"1\"},\"versions\":{\"version\":[{\"name\":\"POST_ARTICLE1\"}]}}"
    }
  ]
}
```

Auth: nested calls share one `X-egain-session`. Outer status is often **201**; check each `resultObject[].httpStatus` (failures do not stop later nested calls). Nested bodies are fixed at submit time — cannot use response of call N as body of call N+1.

**App usage:** `src/api/composite.ts`. Prefer when fan-out needs many one-id endpoints (e.g. multi **copy/paste**). Prefer native multi-ID APIs for **move** / **delete** (`…/article/{ids}/…`).

---

## 6. Knowledge Authoring — Articles

**Resource prefix:** `/ws/v20/kb/article`  
**Auth:** `X-egain-session` on all  
**IDs:** numeric `articleId` or readable `alternateId` on **GET** only; POST/PUT/DELETE with alternateId → `400`. Comma-separate multiple IDs.

### 6.1 Lifecycle map (console flow)

```text
create ──► (shared: checked-out) ──► edit / checkin ──► changestage ──► publish
              │                            ▲
              └──── checkout / requestlock / resetlock ───┘
delete ◄── versions delete / rollback (as needed)
```

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ws/v20/kb/article` | Create |
| `POST` | `/ws/v20/kb/article/suggestion` | Create suggestion |
| `PUT` | `/ws/v20/kb/article` | Edit article |
| `PUT` | `/ws/v20/kb/article/version` | Edit version |
| `PUT` | `/ws/v20/kb/article/{ids}/checkout` | Checkout |
| `PUT` | `/ws/v20/kb/article/checkin` | Checkin (+ optional edits) |
| `PUT` | `/ws/v20/kb/article/publish` | Publish |
| `PUT` | `/ws/v20/kb/article/changestage` | Move review stage |
| `PUT` | `/ws/v20/kb/article/changetype` | Change type |
| `PUT` | `/ws/v20/kb/article/resetlock` | Reset lock |
| `PUT` | `/ws/v20/kb/article/{articleId}/requestlock` | Request lock |
| `POST` | `/ws/v20/kb/article/{ids}/move` | Move to folder |
| `POST` | `/ws/v20/kb/article/{articleId}/version/{versionId}/rollback` | Rollback |
| `PUT` | `/ws/v20/kb/article/accept` | Accept suggestion |
| `PUT` | `/ws/v20/kb/article/reject` | Reject suggestion |
| `PUT` | `/ws/v20/kb/article/feedback` | Suggestion feedback |
| `PUT` | `/ws/v20/kb/article/resuggest` | Re-suggest |
| `GET` | `/ws/v20/kb/article/{ids}` | Get by ID(s) |
| `GET` | `/ws/v20/kb/article?folder={id}` | List by folder |
| `GET` | `/ws/v20/kb/article?topic={id}` | List by topic |
| `GET` | `/ws/v20/kb/article/{id}/version[/{versionId}]` | Versions |
| `GET` | `/ws/v20/kb/article/{ids}/latest` | Latest version |
| `GET` | `/ws/v20/kb/article/latest?folder={id}` | Latest by folder |
| `GET` | `/ws/v20/kb/article/{id}/mystages` | My review stages |
| `GET` | `/ws/v20/kb/article/suggestion` | All suggestions |
| `GET` | `/ws/v20/kb/article/mysuggestion` | My suggestions |
| `GET` | `/ws/v20/kb/article/mywork` | Articles for review |
| `DELETE` | `/ws/v20/kb/article/{ids}` | Delete articles |
| `DELETE` | `/ws/v20/kb/article/{id}/version/{versionIds}` | Delete versions |
| `DELETE` | `/ws/v20/kb/article/{articleId}/~link/kb/attachment/{attachmentIds}` | Unlink attachments |

**Also useful filters on GET article:** `classification`, `case`, `relatedArticle`.  
**Content:** `expandMacros=yes` with `$attribute=content`.  
**My work filters:** `reviewStage`, `knowledgeWorkflow` (comma-separated names).  
**Move:** optional `resolveNameConflicts`.

### 6.2 Create article — body

**Required:** `name`, `folder.id`, `language.id`  
**Optional:** `articleType` (default General), `description`, `keywords`, `summary`, `additionalInfo`, `content`, dates, `imageUrl`, `label`, `notes`, `relatedQuestions`, `macro`, related `link`s, `customAttributes`, `versions`

JSON example:

```json
{
  "folder": { "id": "201500000004736" },
  "language": { "id": "1" },
  "versions": { "version": [{ "name": "POST_ARTICLE_JSON1" }] }
}
```

**Success:** `201 Created`, `Location: /system/ws/v20/kb/article/{id}`, body under `article[]` shaped by `$attribute`.  
**Permissions:** Create Article on folder. Shared new articles → checked-out; personal → published.

### 6.3 Checkin / edit concurrency

Checkin/edit typically require optimistic concurrency:

```json
{
  "article": [{
    "id": "201500000004762",
    "versions": {
      "version": [{
        "name": "EDIT_NAME_4",
        "lastModified": { "date": "2015-04-14T05:03:05.750Z" }
      }]
    }
  }]
}
```

`lastModified.date` must match server version timestamp or the call fails.

### 6.4 Response fields commonly needed by UI

From article payloads: `id`, `alternateId`, `department`, `language`, `folder`, `reviewStage`, `lock.lockedBy`, `versions.version[]` (`name`, `versionNumber`, `content`, `articleState`, `articleType`, `availabilityDate`, `expirationDate`), `notes`, `customAttributes`.

---

## 7. Folders

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ws/v20/kb/folder` | Create |
| `PUT` | `/ws/v20/kb/folder/{folderId}` | Edit |
| `POST` | `/ws/v20/kb/folder/copy/{srcFolderId}` | Copy (`merge=0\|1`) |
| `POST` | `/ws/v20/kb/folder/move/{srcFolderId}` | Move (`merge=0\|1`) |
| `GET` | `/ws/v20/kb/folder/{folderIds}` | Read by ID(s) |
| `GET` | `/ws/v20/kb/folder?parent={parentFolderId}` | Children |
| `GET` | `/ws/v20/kb/folder?department={departmentId}` | Department folders |
| `GET` | `/ws/v20/acl/folder/{folderId}` | ACL |
| `DELETE` | `/ws/v20/kb/folder/{ids}` | Delete |

**Create required:** `name`, plus `department` **or** `parent`.  
**Optional:** `description`, `access` (`public`\|`private`), `translate` (0/1), `location`, `acl`.

```json
{
  "name": "Egs21230Api1",
  "parent": { "id": "222200000005760" },
  "description": "Desc for folder"
}
```

**Hierarchy:** `$level=0` root only; `$level=-1` full tree.  
**ACL permissions** include values such as `view_folder`, `edit_folder`, `create_folder`, `delete_folder`, `create_article`, `edit_article`, `delete_article`, `suggest_article`, `manage_suggestions`, `own_folder`.

---

## 8. Notes (article)

| Method | Path |
|--------|------|
| `POST` | `/ws/v20/kb/article/{id}/note` |
| `GET` | `/ws/v20/kb/article/{id}/note` (also `{alternateId}`) |
| `DELETE` | `/ws/v20/kb/article/{id}/note/{noteIDs}` |

**Create body:**

```json
{ "note": [{ "content": "New Note added to the personal article" }] }
```

Success create: `201`. Response: `note[]` with `id`, `content`, `created`.

---

## 9. Attachments (KB)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/ws/v20/kb/attachment/external` | Query: `article`, `$lang`, `$attribute` |
| `POST` | `/ws/v20/kb/attachment/internal` | Query: `article`, `$lang` (required pattern in docs); multipart upload |
| `PUT` | `/ws/v20/kb/attachment/external` | Edit external |
| `GET` | `/ws/v20/kb/attachment` or `/ws/v20/kb/attachment/{ids}` | Requires `article` + (`version` or `$lang`) |
| `DELETE` | `/ws/v20/kb/article/{articleId}/~link/kb/attachment/{attachmentIds}` | Unlink (under Article APIs) |

Types: **EXTERNAL** (URL/metadata) vs **INTERNAL** (uploaded file).

---

## 10. Topics

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/ws/v20/kb/topic/{ids}` | Read |
| `GET` | `/ws/v20/kb/topic?portal=\|department=\|parent=\|article=` | List/filter |
| `GET` | `/ws/v20/kb/topic/{id}/articleorder` | Article order |
| `POST` | `/ws/v20/kb/topic` | Create |
| `POST` | `/ws/v20/kb/topic/{topicId}/~link/kb/article/{articleIds}` | Add articles |
| `POST` | `/ws/v20/kb/topic/{topicID}/move` | Move |
| `POST` | `/ws/v20/kb/topic/{topicID}/copy` | Copy |
| `PUT` | `/ws/v20/kb/topic` | Edit |
| `PUT` | `/ws/v20/kb/topic/{topicId}/articleorder` | Edit order |
| `DELETE` | `/ws/v20/kb/topic/{ids}` | Delete |
| `DELETE` | `/ws/v20/kb/topic/{topicId}/~link/kb/article/{articleIds}` | Remove articles |

**Create required:** `name`, `language`, plus `parentTopic` **or** `department` (department alone → root).

```json
{
  "department": { "id": "999" },
  "language": { "id": "1" },
  "name": "new topic1234",
  "description": "This is related to store",
  "isTranslatable": "false"
}
```

Permissions: View Knowledge Base + Create Topic; user should be in topic’s department. Use `$level=-1` for deep topic trees.

---

## 11. Article types and templates

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/ws/v20/kb/articleType?department={Id}` | All types + templates for department |
| `GET` | `/ws/v20/kb/articleType/articleTemplate/{Id}` | Single template |

Requires session + View Knowledge Base; user must belong to department (admins: all). Useful for create-article type/template picker.

---

## 12. Department, language, pagination cheat sheet

| Concern | Mechanism |
|---------|-----------|
| Department | Nested `{ "id", "name" }` in bodies; query `department=` on folder/topic/articleType GETs |
| Language | Body `language.id`; query `$lang` (e.g. `en-us`); header `Accept-Language` for errors |
| Pagination | `$pagenum` + `$pagesize` (≤75); response `paginationInfo` |
| Field selection | `$attribute=all` or comma list |
| Hierarchy | `$level` on folder/topic reads |

---

## 13. Suggested SPA client module layout

```text
auth/
  login → POST /ws/v20/authentication/user/login
  logout → DELETE /ws/v20/authentication/user/logout
  session interceptor → inject X-egain-session + Accept: application/json
kb/
  folders.ts   → /ws/v20/kb/folder*, /ws/v20/acl/folder/*
  articles.ts  → /ws/v20/kb/article*
  notes.ts     → /ws/v20/kb/article/{id}/note*
  attachments.ts → /ws/v20/kb/attachment*
  topics.ts    → /ws/v20/kb/topic*
  articleTypes.ts → /ws/v20/kb/articleType*
```

Wire UI to this lifecycle:

1. Login → store session  
2. `GET /kb/folder?department={id}&$level=-1&$attribute=all` — tree  
3. `GET /kb/article?folder={id}&$attribute=...` — list  
4. Checkout → edit → checkin → publish  
5. Notes/attachments/topics as secondary panels  
6. Logout on exit  

---

## 14. Doc index (for deeper field schemas)

- Index: https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/d3/dc8/web-service-index.html  
- Auth: https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/d6/d2a/understanding-authentication.html  
- Common params: https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/da/d41/common-query-params.html  
- Intro: https://hd.egain.com/api/knowledge_authoring_interaction_api_reference_guide/html/d1/dfb/intro.html  

Per-endpoint `docUrl` values are in `api-endpoints.json`.

---

## 15. Implementation caveats

1. Some detail pages abbreviate paths as `/kb/...` without `/ws/v20`; **canonical examples use `/ws/v20/kb/...`** — implement the full prefix.  
2. Path casing: `articleType` vs `articletype` both appear; prefer docs’ primary `articleType`.  
3. Link/unlink resources use `/~link/` segments (topics↔articles, articles↔attachments).  
4. Folder copy/move use `/folder/copy/{id}` and `/folder/move/{id}` with destination in body + optional `merge`.  
5. Publish/stage APIs are permission- and workflow-sensitive; expect `403` / `412` when stage rights or preconditions fail.  
6. Always send `$lang` when editing multi-language content; omit only if defaults are acceptable.
