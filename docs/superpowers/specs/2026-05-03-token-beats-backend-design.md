# Token Matters frontend → Token Beats backend

**Date:** 2026-05-03
**Status:** Spec — ready for implementation on `token-beats` repo
**Frontend repo:** `token-matters` (this repo)
**Backend repo:** `token-beats` (`apps/api`, Cloudflare Workers + Hono + D1)
**Frontend host:** `https://tokens.jacky.jp` (Cloudflare Pages)

## 1. Goal

Replace the current static-JSON-on-GitHub-Pages backend (`https://newbdez33.github.io/token-matters-summary/summary/*.json`) with live endpoints served by the existing **Token Beats** Cloudflare Workers API. The token-matters frontend stays in place — only `BASE` URL and a small cost-recompute step change. The token-beats backend gains seven new `/v1/summary/*` endpoints, one new D1 table, and one new middleware.

The purpose is to drive the public dashboard at `tokens.jacky.jp` directly off the data Token Beats already collects, instead of running a parallel collector → GitHub Actions → GitHub Pages pipeline.

## 2. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Backend reshapes Token Beats data into the existing token-matters JSON shapes — frontend types do not change. | Smallest blast radius; UI components keep working. |
| D2 | Each request is **scoped to one user** (the email passed in `?user=`). No cross-user / company aggregates. | Token-matters is a personal-tracker UI; matches its semantics. |
| D3 | `cost.totalUSD`, `cost.byProvider`, `costUSD` fields are **always 0** from the backend. The frontend re-computes cost from `byProvider` / `byModel` token counts using its own `frontend/src/config/pricing.json`. | Avoids duplicating the pricing source-of-truth; backend stays cost-agnostic. |
| D4 | Auth = static API token in a new `api_tokens` D1 table, passed as `?user=<email>&token=<hex>` query string. No Entra ID OAuth on this surface. | One-step to use; admin hands out tokens via 1Password; revocable per-user. |
| D5 | Provider id mapping: token-beats `claude` → token-matters `claude-code`. `codex` and `opencode` pass through unchanged. | Frontend's `PROVIDERS` map and `pricing.json` use `claude-code`. |
| D6 | `requests` (token-matters) = `SUM(tool_calls)` (token-beats). | Closest semantic match; `sessions` represents distinct CLI invocations, not request count. |
| D7 | Period formats: daily `yyyy-mm-dd`, weekly ISO `yyyy-Www`, monthly `yyyy-mm`. All UTC. | Matches what the frontend already passes to `getDaily/getWeekly/getMonthly`. |

## 3. Non-goals

- GLM Coding / TRAE Pro provider data — Token Beats does not collect these. The frontend will simply not see them in `meta.providers` and will hide those cards.
- Server-side cost computation — explicitly punted (D3). Can be revisited later without breaking the wire format (just start filling the cost fields).
- Self-service token issuance — admin manually inserts rows into `api_tokens` and shares via 1Password.
- Multi-user / company / department aggregates — the existing `/v1/leaderboard` route already covers that surface.
- Caching layer (KV / Cache API) — D1 reads are cheap enough at GCU's scale; add later only if Analytics Engine shows a hot path.

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│ token-matters/frontend  (Cloudflare Pages)  │
│   tokens.jacky.jp                           │
│   - reads ?user / ?token from localStorage  │
│   - cost is re-computed locally             │
└────────────────┬────────────────────────────┘
                 │ fetch(`${BASE}/...?user=&token=`)
                 ▼
┌─────────────────────────────────────────────┐
│ token-beats/apps/api  (Cloudflare Workers)  │
│                                              │
│   middleware/api-token.ts        ← NEW       │
│   routes/summary.ts              ← NEW       │
│   lib/summary-agg.ts             ← NEW       │
│                                              │
└────────────────┬────────────────────────────┘
                 │ D1 queries
                 ▼
┌─────────────────────────────────────────────┐
│ Cloudflare D1 (token_beats_prod / staging)  │
│   usage_events  (existing — read only)       │
│   devices       (existing — read only)       │
│   api_tokens    ← NEW (migration 0010)       │
└─────────────────────────────────────────────┘
```

## 5. New backend surface (everything below is in `token-beats` repo)

### 5.1 D1 migration `migrations/0010_api_tokens.sql`

```sql
-- Static API tokens for the public token-matters frontend (tokens.jacky.jp).
-- One token per (user, description). Admin-issued, manually rotated.
CREATE TABLE api_tokens (
  token       TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at  TEXT,
  FOREIGN KEY (user_email) REFERENCES allowed_users(email)
);

CREATE INDEX idx_api_tokens_user ON api_tokens(user_email);
```

Apply via `wrangler d1 migrations apply` to staging first, then prod (manual — same as every existing migration; CI does not auto-apply).

### 5.2 Middleware `apps/api/src/middleware/api-token.ts` (NEW)

```ts
import type { MiddlewareHandler } from 'hono'
import type { Env } from '../types.js'

export const apiTokenMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: { user_email: string } }> =
  async (c, next) => {
    const user = c.req.query('user')
    const token = c.req.query('token')
    if (!user || !token) {
      return c.json({ error: 'Unauthorized', message: 'Missing user or token' }, 401)
    }
    const row = await c.env.DB.prepare(
      `SELECT user_email FROM api_tokens
       WHERE token = ?1 AND user_email = ?2 AND revoked_at IS NULL`,
    )
      .bind(token, user)
      .first<{ user_email: string }>()
    if (!row) {
      return c.json({ error: 'Unauthorized', message: 'Invalid token' }, 401)
    }
    c.set('user_email', row.user_email)
    await next()
  }
```

Notes:
- This is intentionally **independent** of the existing `authMiddleware` (which validates Entra ID JWTs for the desktop app). The summary surface must not require an Entra session — colleagues open the public dashboard URL in a browser.
- No rate limiting in v1. Add later via Workers Rate Limiting binding if abuse becomes a real signal.

### 5.3 Routes `apps/api/src/routes/summary.ts` (NEW)

Mounted in `apps/api/src/index.ts`:

```ts
import { summary } from './routes/summary.js'
// ...
app.route('/v1/summary', summary)
```

Seven endpoints, all behind `apiTokenMiddleware`, all returning JSON shapes that **must match `token-matters/frontend/src/types/summary.ts` byte-for-byte** (extra fields are permitted but discouraged):

| Method & path                              | Frontend caller          | Returns           |
| ------------------------------------------ | ------------------------ | ----------------- |
| `GET /v1/summary/meta`                     | `api.getMeta()`          | `SummaryMeta`     |
| `GET /v1/summary/latest`                   | `api.getLatest()`        | `LatestSummary`   |
| `GET /v1/summary/daily/:date`              | `api.getDaily(date)`     | `DailySummary`    |
| `GET /v1/summary/weekly/:week`             | `api.getWeekly(week)`    | `WeeklySummary`   |
| `GET /v1/summary/monthly/:month`           | `api.getMonthly(month)`  | `MonthlySummary`  |
| `GET /v1/summary/providers/:id`            | `api.getProvider(id)`    | `ProviderAllTime` |
| `GET /v1/summary/machines/:id`             | `api.getMachine(id)`     | `MachineAllTime`  |

Path-param validation:
- `:date` — strict `^\d{4}-\d{2}-\d{2}$`, plus the same round-trip-through-`Date` check that `routes/leaderboard.ts` uses (rejects `Feb 31` etc.).
- `:week` — strict `^\d{4}-W\d{2}$`. Validate week `01..53`.
- `:month` — strict `^\d{4}-(0[1-9]|1[0-2])$`.
- `:id` for `/providers/:id` — must be one of the values returned by `meta.providers` (`claude-code` | `codex` | `opencode`); reject unknown with 404.
- `:id` for `/machines/:id` — must match a `device_id` (or hostname slug, see §6.4) the user owns; reject with 404 if not found or not theirs.

CORS: token-beats already runs `corsMiddleware` globally. Add `https://tokens.jacky.jp` to its allowlist (and `http://localhost:5173` for local frontend dev).

## 6. Aggregation library `apps/api/src/lib/summary-agg.ts` (NEW)

Stateless helpers. Every function takes `db: D1Database` and `userEmail: string` plus the period args. Every function MUST filter `WHERE user_email = ?` — the user-scoping is non-negotiable (D2). Add a unit test that fails if a query is added without the filter.

### 6.1 Field mapping

For every `usage_events` row that contributes to an aggregate:

| token-matters field            | Source / SQL                                                |
| ------------------------------ | ----------------------------------------------------------- |
| `provider`                     | `usage_events.provider`, with `'claude' → 'claude-code'`     |
| `model`                        | `usage_events.model` as-is                                  |
| `inputTokens`                  | `SUM(input_tok)`                                            |
| `outputTokens`                 | `SUM(output_tok)`                                           |
| `cacheCreationTokens`          | `SUM(cache_write)`                                          |
| `cacheReadTokens`              | `SUM(cache_read)`                                           |
| `totalTokens`                  | `inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens` |
| `requests`                     | `SUM(tool_calls)`                                           |
| `cost.totalUSD`                | `0` (D3)                                                    |
| `cost.byProvider`              | `{}` (D3)                                                   |
| `cost` (on `ProviderSummary`)  | `0` (D3)                                                    |
| `costUSD`                      | `0` (D3)                                                    |
| `currency`                     | `"USD"` for `claude-code`, `codex`, `opencode`              |
| `dataQuality`                  | `"exact"` for all three providers                           |

### 6.2 Period windows (UTC)

| Period   | Start (inclusive)         | End (exclusive)                       |
| -------- | ------------------------- | ------------------------------------- |
| `daily`  | `${date}T00:00:00`        | `${date}T00:00:00 + 1 day`            |
| `weekly` | ISO week Monday 00:00     | ISO week + 7 days                     |
| `monthly`| `${month}-01T00:00:00`    | first day of next month at 00:00      |

`ts_bucket` is already an ISO-8601 hour string (`yyyy-mm-ddThh:00`), so window filters use simple string comparison: `ts_bucket >= start_iso AND ts_bucket < end_iso`.

ISO-week → date conversion: write a tiny pure helper (no `Temporal` API on Workers; `date-fns` is already a backend dep so prefer that — or implement Zeller's-style calc, ~15 lines). Place the helper in `lib/iso-week.ts` next to `summary-agg.ts`.

### 6.3 Reusable core query

```sql
SELECT
  provider, model,
  SUM(input_tok)   AS input_tok,
  SUM(output_tok)  AS output_tok,
  SUM(cache_read)  AS cache_read,
  SUM(cache_write) AS cache_write,
  SUM(tool_calls)  AS tool_calls
FROM usage_events
WHERE user_email = ?1
  AND ts_bucket >= ?2
  AND ts_bucket <  ?3
GROUP BY provider, model
```

Use the result to build `byProvider[]`, `byModel[]`, and `totals` in TS — one SQL round trip per period.

`byMachine[]` needs a separate query because `usage_events` doesn't carry hostname:

```sql
SELECT
  ue.device_id,
  COALESCE(d.hostname, ue.device_id) AS machine,
  SUM(ue.input_tok + ue.output_tok + ue.cache_read + ue.cache_write) AS totalTokens,
  SUM(ue.tool_calls) AS requests
FROM usage_events ue
LEFT JOIN devices d
  ON d.id = ue.device_id AND d.user_email = ue.user_email
WHERE ue.user_email = ?1
  AND ue.ts_bucket >= ?2
  AND ue.ts_bucket <  ?3
GROUP BY ue.device_id
```

`dailyTrend[]` needs another round trip (or use a CTE in one query):

```sql
SELECT
  substr(ts_bucket, 1, 10) AS date,
  SUM(input_tok + output_tok + cache_read + cache_write) AS totalTokens
FROM usage_events
WHERE user_email = ?1
  AND ts_bucket >= ?2
  AND ts_bucket <  ?3
GROUP BY substr(ts_bucket, 1, 10)
ORDER BY date
```

`DailyTrendEntry.cost` is always `0` (D3).

### 6.4 Per-endpoint composition

| Endpoint        | Window args                                | Composes                                                                   |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `/meta`         | full range = `MIN(ts_bucket)`..`MAX`+1h    | `providers/machines/models` from `DISTINCT` queries; `dailyFiles[]` = enumerate every date in range; `weeklyFiles[]` / `monthlyFiles[]` similarly. Frontend treats these as available file lists; emit even if a particular day has zero events. |
| `/latest`       | last7 + last30 + today                     | three nested period summaries. `today` is `null` when there's no event today. |
| `/daily/:date`  | one UTC day                                | core query + `byMachine` + `byModel`                                       |
| `/weekly/:week` | ISO week                                   | core + `byMachine` + `dailyTrend`                                          |
| `/monthly/:m`   | one calendar month                         | core + `byMachine` + `dailyTrend`                                          |
| `/providers/:id`| full range, filtered by `provider = :id`   | `totals` + `dailyTrend`                                                    |
| `/machines/:id` | full range, filtered by `device_id = :id`  | `totals` + `dailyTrend`. `:id` accepts either a literal `device_id` UUID or a hostname; resolve hostname → device_id via `devices` table first, scoped to the calling user. |

`MachineSummary.machine` (in `byMachine[]`) and `:id` resolution should both prefer `hostname`. If two of a user's devices share a hostname, append `…-${device_id.slice(0,6)}` to disambiguate. This matches what the original token-matters collector does (it uses `os.hostname()` directly).

### 6.5 Empty-data behaviour

If a user has never uploaded any events, every endpoint returns the empty shape (totals all 0, arrays empty, `today: null`) — never 404. Frontend already handles empty arrays. `dateRange` in that case is `{ start: today, end: today }`.

## 7. Frontend changes (token-matters repo)

Two files change. Keep all other components untouched.

### 7.1 `frontend/src/services/api.ts`

```ts
const BASE = import.meta.env.VITE_TB_API_BASE
  ?? 'https://token-beats-api.jacky-1a4.workers.dev/v1/summary'

function authQS(): string {
  const user = localStorage.getItem('tb.user') ?? ''
  const token = localStorage.getItem('tb.token') ?? ''
  return `user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`
}

async function fetchJSON<T>(path: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}/${path}${sep}${authQS()}`)
  if (res.status === 401) throw new ApiAuthError()
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  getMeta:     ()           => fetchJSON<SummaryMeta>('meta'),
  getLatest:   ()           => fetchJSON<LatestSummary>('latest'),
  getDaily:    (date: string)   => fetchJSON<DailySummary>(`daily/${date}`),
  getWeekly:   (week: string)   => fetchJSON<WeeklySummary>(`weekly/${week}`),
  getMonthly:  (month: string)  => fetchJSON<MonthlySummary>(`monthly/${month}`),
  getProvider: (id: string)     => fetchJSON<ProviderAllTime>(`providers/${id}`),
  getMachine:  (id: string)     => fetchJSON<MachineAllTime>(`machines/${id}`),
}
```

Add `ApiAuthError` (named subclass of `Error`) so the UI can show a "configure your token" banner instead of a generic failure.

### 7.2 Cost recompute (D3)

Add `frontend/src/services/cost.ts`:

```ts
import pricing from '@/config/pricing.json'

// Recomputes cost fields on a TokenTotals / ProviderSummary tree using
// the local pricing table. Backend always sends zeros; nothing else
// in the app should know how cost is derived.
export function recomputeCosts<T>(tree: T): T { /* ... */ }
```

Call `recomputeCosts(...)` once inside `useDataStore` after each `api.*` call. Keep the recompute logic in this one file so future "backend computes cost" migration is a single delete.

### 7.3 Token onboarding UI

When `localStorage` has no `tb.user` / `tb.token` (or any call throws `ApiAuthError`), render a small modal in `App.tsx` with two text inputs (email + token) → save to `localStorage` → reload. Plain `<input>` is fine; no need for full form library.

### 7.4 Env wiring

- Add `VITE_TB_API_BASE` to Cloudflare Pages env (prod = `https://token-beats-api.jacky-1a4.workers.dev/v1/summary`, preview = staging worker).
- `.env.example` gets the same key.

### 7.5 Deletion candidates (for the same PR or a follow-up)

The collector + summary aggregation pipeline (`collector/`, `summary/`, `token-matters-data` and `token-matters-summary` repos) is now redundant for users on Token Beats. Out-of-scope to delete in this PR — flag as follow-up only.

## 8. Test plan

### 8.1 Backend (token-beats)

Add `apps/api/test/summary.test.ts` with vitest + Miniflare-style D1 fixtures (same pattern `routes/leaderboard.test.ts` already uses):

1. **Auth**
   - missing `user` → 401
   - missing `token` → 401
   - wrong token → 401
   - revoked token → 401
   - mismatched user/token pair → 401
   - valid → 200
2. **Field mapping**
   - insert one event with `provider='claude'`, model `claude-sonnet-4-6`, fixed token counts
   - assert `byProvider[0].provider === 'claude-code'`
   - assert `requests === tool_calls` (and is NOT `sessions`)
   - assert `cacheCreationTokens === cache_write`
3. **Period windows**
   - events on `2026-04-30T23:00` and `2026-05-01T00:00`
   - daily `2026-05-01` only includes the second
   - weekly `2026-W18` (Mon 2026-04-27) includes both
4. **Multi-user isolation**
   - insert events for user A and user B with different counts
   - call `/v1/summary/daily/...` as A → only A's totals
   - call as B → only B's totals
5. **Empty data**
   - new user, never uploaded → every endpoint 200 with empty totals (not 404)
6. **Path validation**
   - `daily/2026-13-01` → 400
   - `weekly/2026-W54` → 400
   - `monthly/2026-13` → 400
   - `providers/glm-coding` → 404
7. **Machine resolution**
   - device with hostname `mbp-a` → `byMachine[].machine === 'mbp-a'`
   - device with no hostname → `byMachine[].machine === device_id`
   - two devices same hostname → both appear, suffixed with `…-${device_id.slice(0,6)}`

### 8.2 Frontend (token-matters)

- Update `frontend/src/services/api.test.ts` (or add) — mock `fetch`, assert `?user=&token=` is appended.
- New `frontend/src/services/cost.test.ts` — feed a backend response with `cost: 0`, assert recomputed `totalUSD` matches a hand-calculated expected value for a small model+token fixture.
- E2E (`frontend/e2e/`) — add Playwright spec that visits `/`, fills the token modal with a stub, mocks the summary API via `page.route()`, asserts the dashboard renders.

## 9. Rollout

1. `token-beats` PR
   - `migrations/0010_api_tokens.sql`
   - `apps/api/src/middleware/api-token.ts`
   - `apps/api/src/routes/summary.ts`
   - `apps/api/src/lib/summary-agg.ts`
   - `apps/api/src/lib/iso-week.ts`
   - tests (§8.1)
   - CORS allowlist update
   - merge → CI auto-deploys to staging worker
2. Manually apply migration on staging D1, manually apply on prod D1 once confirmed.
3. Admin generates a token for one tester and verifies via `curl`.
4. `token-matters` PR (this repo)
   - `frontend/src/services/api.ts` rewrite
   - `frontend/src/services/cost.ts` + token onboarding modal
   - tests (§8.2)
   - `.env.example` + Pages env config docs
   - merge → Cloudflare Pages auto-deploys to `tokens.jacky.jp`
5. Issue tokens to remaining colleagues via 1Password.

Rollback for both PRs is a straight `git revert` — no data migration on the read path, and `api_tokens` is an additive table.

## 10. Implementation reminders

All seven decisions in §2 are locked — surface a comment on this spec rather than re-deciding.

- `meta.dailyFiles[]` / `weeklyFiles[]` / `monthlyFiles[]` enumerate **every** date/week/month in `dateRange`, not only ones with events. Frontend treats them as available-file lists.
- A date with zero events still returns **200 empty**, never 404 (matches the static-JSON pipeline this replaces).
- ISO-week validator must accept `W01`..`W53` — `W53` exists in some years (e.g. 2020).
- Every aggregation query MUST filter `WHERE user_email = ?`. Add a unit test that grep-asserts this on `lib/summary-agg.ts`.
