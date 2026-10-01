# Cursor Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cursor` provider to the collector that captures exact per-model token usage from the Cursor admin API.

**Architecture:** Mirror the `glm-coding` provider pattern. Two source files (`cursor.ts` provider + `cursor-parser.ts` pure functions), one fixture-based unit-test pair, registration in `main.ts`, docs updates. The provider POSTs to `/teams/filtered-usage-events`, paginates, filters by `userEmail`, drops `Errored, Not Charged` events, aggregates remaining events by `model`, and emits one `RawRecord` per model.

**Tech Stack:** TypeScript, Node 22, vitest, `fetch` (Node built-in), Intl.DateTimeFormat for timezone-aware ms-epoch range.

**Spec:** `docs/superpowers/specs/2026-04-26-cursor-provider-design.md`

---

## File Structure

| File | Purpose |
|------|---------|
| `collector/src/providers/cursor-parser.ts` | Pure functions: types, event filter, aggregate-by-model |
| `collector/src/providers/cursor.ts` | Provider factory, auth, paginated fetch, ms-range conversion |
| `collector/test/fixtures/cursor/usage-events.json` | Sample API response fixture |
| `collector/test/unit/cursor-parser.test.ts` | Parser unit tests |
| `collector/test/unit/cursor-provider.test.ts` | Provider unit tests (mocks `fetch`) |
| `collector/test/unit/build-providers.test.ts` | Add `cursor` registration test |
| `collector/src/main.ts` | Register provider |
| `README.md` | Add Cursor row + config example |
| `docs/data-integration.md` | Append Cursor section |

---

### Task 1: Add Cursor API fixture

**Files:**
- Create: `collector/test/fixtures/cursor/usage-events.json`

- [ ] **Step 1: Create fixture file**

```json
{
  "usageEvents": [
    {
      "timestamp": "1745625600000",
      "userEmail": "jacky@gcu.co.jp",
      "model": "claude-4-sonnet",
      "kind": "Included in Pro",
      "tokenUsage": {
        "inputTokens": 1000,
        "outputTokens": 500,
        "cacheWriteTokens": 200,
        "cacheReadTokens": 800,
        "totalCents": 0
      }
    },
    {
      "timestamp": "1745629200000",
      "userEmail": "jacky@gcu.co.jp",
      "model": "claude-4-sonnet",
      "kind": "Usage-based",
      "tokenUsage": {
        "inputTokens": 2000,
        "outputTokens": 1500,
        "cacheWriteTokens": 0,
        "cacheReadTokens": 1200,
        "totalCents": 35
      }
    },
    {
      "timestamp": "1745632800000",
      "userEmail": "jacky@gcu.co.jp",
      "model": "gpt-5",
      "kind": "Included in Pro",
      "tokenUsage": {
        "inputTokens": 500,
        "outputTokens": 300,
        "cacheWriteTokens": 0,
        "cacheReadTokens": 0,
        "totalCents": 0
      }
    },
    {
      "timestamp": "1745636400000",
      "userEmail": "jacky@gcu.co.jp",
      "model": "claude-4-sonnet",
      "kind": "Errored, Not Charged",
      "tokenUsage": {
        "inputTokens": 100,
        "outputTokens": 0,
        "cacheWriteTokens": 0,
        "cacheReadTokens": 0,
        "totalCents": 0
      }
    },
    {
      "timestamp": "1745640000000",
      "userEmail": "someone-else@example.com",
      "model": "claude-4-sonnet",
      "kind": "Included in Pro",
      "tokenUsage": {
        "inputTokens": 9999,
        "outputTokens": 9999,
        "cacheWriteTokens": 9999,
        "cacheReadTokens": 9999,
        "totalCents": 0
      }
    },
    {
      "timestamp": "1745643600000",
      "userEmail": "jacky@gcu.co.jp",
      "model": "claude-4-sonnet",
      "kind": "Included in Pro"
    }
  ],
  "pagination": {
    "numPages": 1,
    "pageSize": 100,
    "hasNextPage": false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add collector/test/fixtures/cursor/usage-events.json
git commit -m "test: add Cursor API fixture"
```

---

### Task 2: Parser — types + filter + aggregate (RED)

**Files:**
- Create: `collector/test/unit/cursor-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  filterUsageEvents,
  aggregateByModel,
  type CursorUsageEventsResponse,
} from '../../src/providers/cursor-parser.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'cursor');

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

describe('filterUsageEvents', () => {
  it('keeps only events for the target email', () => {
    const data = loadFixture<CursorUsageEventsResponse>('usage-events.json');
    const filtered = filterUsageEvents(data.usageEvents, 'jacky@gcu.co.jp');
    expect(filtered.every(e => e.userEmail === 'jacky@gcu.co.jp')).toBe(true);
    expect(filtered.find(e => e.userEmail === 'someone-else@example.com')).toBeUndefined();
  });

  it('drops Errored, Not Charged events', () => {
    const data = loadFixture<CursorUsageEventsResponse>('usage-events.json');
    const filtered = filterUsageEvents(data.usageEvents, 'jacky@gcu.co.jp');
    expect(filtered.find(e => e.kind === 'Errored, Not Charged')).toBeUndefined();
  });

  it('drops events with no tokenUsage', () => {
    const data = loadFixture<CursorUsageEventsResponse>('usage-events.json');
    const filtered = filterUsageEvents(data.usageEvents, 'jacky@gcu.co.jp');
    expect(filtered.every(e => e.tokenUsage !== undefined)).toBe(true);
  });
});

describe('aggregateByModel', () => {
  it('produces one record per model', () => {
    const data = loadFixture<CursorUsageEventsResponse>('usage-events.json');
    const filtered = filterUsageEvents(data.usageEvents, 'jacky@gcu.co.jp');
    const records = aggregateByModel(filtered);
    expect(records).toHaveLength(2);
    const models = records.map(r => r.model).sort();
    expect(models).toEqual(['claude-4-sonnet', 'gpt-5']);
  });

  it('sums token fields across events for the same model', () => {
    const data = loadFixture<CursorUsageEventsResponse>('usage-events.json');
    const filtered = filterUsageEvents(data.usageEvents, 'jacky@gcu.co.jp');
    const records = aggregateByModel(filtered);
    const sonnet = records.find(r => r.model === 'claude-4-sonnet')!;
    // Two valid sonnet events: (1000,500,200,800) + (2000,1500,0,1200)
    expect(sonnet.inputTokens).toBe(3000);
    expect(sonnet.outputTokens).toBe(2000);
    expect(sonnet.cacheCreationTokens).toBe(200);
    expect(sonnet.cacheReadTokens).toBe(1200 + 800);
    expect(sonnet.totalTokens).toBe(3000 + 2000 + 200 + 2000);
    expect(sonnet.requests).toBe(2);
  });

  it('returns empty array when no events', () => {
    expect(aggregateByModel([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd collector && pnpm vitest run test/unit/cursor-parser.test.ts`
Expected: FAIL — module `../../src/providers/cursor-parser.js` not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add collector/test/unit/cursor-parser.test.ts
git commit -m "test: add failing Cursor parser tests"
```

---

### Task 3: Parser — implement (GREEN)

**Files:**
- Create: `collector/src/providers/cursor-parser.ts`

- [ ] **Step 1: Write the parser**

```ts
import type { RawRecord } from './types.js';

export interface CursorTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCents: number;
}

export interface CursorUsageEvent {
  timestamp: string;
  userEmail: string;
  model: string;
  kind: string;
  tokenUsage?: CursorTokenUsage;
}

export interface CursorUsageEventsResponse {
  usageEvents: CursorUsageEvent[];
  pagination: {
    numPages: number;
    pageSize: number;
    hasNextPage?: boolean;
  };
}

const ERRORED_KIND = 'Errored, Not Charged';

export function filterUsageEvents(
  events: CursorUsageEvent[],
  userEmail: string,
): CursorUsageEvent[] {
  return events.filter(e =>
    e.userEmail === userEmail
    && e.kind !== ERRORED_KIND
    && e.tokenUsage !== undefined
  );
}

export function aggregateByModel(events: CursorUsageEvent[]): RawRecord[] {
  const byModel = new Map<string, RawRecord>();

  for (const e of events) {
    const t = e.tokenUsage!;
    const existing = byModel.get(e.model);
    if (existing) {
      byModel.set(e.model, {
        ...existing,
        inputTokens: (existing.inputTokens ?? 0) + t.inputTokens,
        outputTokens: (existing.outputTokens ?? 0) + t.outputTokens,
        cacheCreationTokens: (existing.cacheCreationTokens ?? 0) + t.cacheWriteTokens,
        cacheReadTokens: (existing.cacheReadTokens ?? 0) + t.cacheReadTokens,
        totalTokens: (existing.totalTokens ?? 0) + t.inputTokens + t.outputTokens + t.cacheWriteTokens + t.cacheReadTokens,
        requests: (existing.requests ?? 0) + 1,
      });
    } else {
      byModel.set(e.model, {
        model: e.model,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        cacheCreationTokens: t.cacheWriteTokens,
        cacheReadTokens: t.cacheReadTokens,
        totalTokens: t.inputTokens + t.outputTokens + t.cacheWriteTokens + t.cacheReadTokens,
        requests: 1,
        note: 'Cursor admin API filtered-usage-events',
      });
    }
  }

  return Array.from(byModel.values()).sort((a, b) => (a.model ?? '').localeCompare(b.model ?? ''));
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd collector && pnpm vitest run test/unit/cursor-parser.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add collector/src/providers/cursor-parser.ts
git commit -m "feat: implement Cursor parser (filter + aggregate by model)"
```

---

### Task 4: Provider — failing tests (RED)

**Files:**
- Create: `collector/test/unit/cursor-provider.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCursorProvider } from '../../src/providers/cursor.js';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'cursor');

function loadFixture(name: string) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'));
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const baseOpts = {
  apiKey: 'test-key',
  userEmail: 'jacky@gcu.co.jp',
  baseUrl: 'https://api.cursor.com',
  machine: 'test-machine',
  timezone: 'UTC',
};

describe('CursorProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and dataQuality', () => {
    const provider = createCursorProvider(baseOpts);
    expect(provider.name).toBe('cursor');
    expect(provider.dataQuality).toBe('exact');
  });

  it('isAvailable returns true when apiKey and userEmail are set', async () => {
    const provider = createCursorProvider(baseOpts);
    expect(await provider.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when apiKey is empty', async () => {
    const provider = createCursorProvider({ ...baseOpts, apiKey: '' });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable returns false when userEmail is empty', async () => {
    const provider = createCursorProvider({ ...baseOpts, userEmail: '' });
    expect(await provider.isAvailable()).toBe(false);
  });

  it('collect calls /teams/filtered-usage-events with Basic auth and POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => loadFixture('usage-events.json'),
    });
    const provider = createCursorProvider(baseOpts);
    await provider.collect('2026-04-26');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.cursor.com/teams/filtered-usage-events');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers.Authorization).toBe('Basic ' + Buffer.from('test-key:').toString('base64'));
    const body = JSON.parse(opts.body);
    expect(body.email).toBe('jacky@gcu.co.jp');
    expect(body.page).toBe(1);
    expect(typeof body.startDate).toBe('number');
    expect(typeof body.endDate).toBe('number');
    expect(body.endDate).toBeGreaterThan(body.startDate);
  });

  it('collect aggregates fixture into per-model records', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => loadFixture('usage-events.json'),
    });
    const provider = createCursorProvider(baseOpts);
    const result = await provider.collect('2026-04-26');

    expect(result.version).toBe('1.0');
    expect(result.provider).toBe('cursor');
    expect(result.date).toBe('2026-04-26');
    expect(result.dataQuality).toBe('exact');
    expect(result.records).toHaveLength(2);
    const sonnet = result.records.find(r => r.model === 'claude-4-sonnet')!;
    expect(sonnet.totalTokens).toBe(7200);
    expect(sonnet.requests).toBe(2);
  });

  it('collect paginates until last page', async () => {
    const page1 = {
      usageEvents: [
        {
          timestamp: '1', userEmail: 'jacky@gcu.co.jp', model: 'm', kind: 'Included in Pro',
          tokenUsage: { inputTokens: 1, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCents: 0 },
        },
      ],
      pagination: { numPages: 2, pageSize: 1, hasNextPage: true },
    };
    const page2 = {
      usageEvents: [
        {
          timestamp: '2', userEmail: 'jacky@gcu.co.jp', model: 'm', kind: 'Included in Pro',
          tokenUsage: { inputTokens: 2, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCents: 0 },
        },
      ],
      pagination: { numPages: 2, pageSize: 1, hasNextPage: false },
    };
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });

    const provider = createCursorProvider(baseOpts);
    const result = await provider.collect('2026-04-26');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).page).toBe(2);
    expect(result.records[0].inputTokens).toBe(3);
  });

  it('collect throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });
    const provider = createCursorProvider(baseOpts);
    await expect(provider.collect('2026-04-26')).rejects.toThrow(/auth failed/i);
  });

  it('collect returns empty records when API returns no events', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ usageEvents: [], pagination: { numPages: 1, pageSize: 100, hasNextPage: false } }),
    });
    const provider = createCursorProvider(baseOpts);
    const result = await provider.collect('2026-04-26');
    expect(result.records).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd collector && pnpm vitest run test/unit/cursor-provider.test.ts`
Expected: FAIL — module `../../src/providers/cursor.js` not found.

- [ ] **Step 3: Commit**

```bash
git add collector/test/unit/cursor-provider.test.ts
git commit -m "test: add failing Cursor provider tests"
```

---

### Task 5: Provider — implement (GREEN)

**Files:**
- Create: `collector/src/providers/cursor.ts`

- [ ] **Step 1: Write the provider**

```ts
import type { CollectorProvider, DataQuality, RawDataFile } from './types.js';
import {
  aggregateByModel,
  filterUsageEvents,
  type CursorUsageEvent,
  type CursorUsageEventsResponse,
} from './cursor-parser.js';

interface CursorProviderOptions {
  apiKey: string;
  userEmail: string;
  baseUrl: string;
  machine: string;
  timezone: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 50;

function tzOffsetMs(utcDate: Date, timezone: string): number {
  const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = utcDate.toLocaleString('en-US', { timeZone: timezone });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

function dateToMsRange(date: string, timezone: string): { startMs: number; endMs: number } {
  // Local midnight in `timezone` for `date`, expressed as UTC ms.
  const naiveStart = new Date(`${date}T00:00:00Z`);
  const offset = tzOffsetMs(naiveStart, timezone);
  const startMs = naiveStart.getTime() - offset;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

export function createCursorProvider(opts: CursorProviderOptions): CollectorProvider {
  const auth = 'Basic ' + Buffer.from(`${opts.apiKey}:`).toString('base64');

  async function fetchPage(startMs: number, endMs: number, page: number): Promise<CursorUsageEventsResponse> {
    const url = new URL('/teams/filtered-usage-events', opts.baseUrl).toString();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: startMs,
        endDate: endMs,
        email: opts.userEmail,
        page,
        pageSize: PAGE_SIZE,
      }),
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error(`Cursor admin API auth failed (${resp.status}) — check apiKey`);
    }
    if (!resp.ok) {
      throw new Error(`Cursor API ${resp.status}: ${resp.statusText}`);
    }
    return resp.json() as Promise<CursorUsageEventsResponse>;
  }

  return {
    name: 'cursor',
    dataQuality: 'exact' as DataQuality,

    async isAvailable(): Promise<boolean> {
      return opts.apiKey.length > 0 && opts.userEmail.length > 0;
    },

    async collect(date: string): Promise<RawDataFile> {
      const { startMs, endMs } = dateToMsRange(date, opts.timezone);

      const allEvents: CursorUsageEvent[] = [];
      let page = 1;
      while (page <= MAX_PAGES) {
        const resp = await fetchPage(startMs, endMs, page);
        allEvents.push(...resp.usageEvents);
        const numPages = resp.pagination?.numPages ?? 1;
        if (page >= numPages) break;
        page += 1;
      }

      const filtered = filterUsageEvents(allEvents, opts.userEmail);
      const records = aggregateByModel(filtered);

      return {
        version: '1.0',
        collectedAt: new Date().toISOString(),
        machine: opts.machine,
        provider: 'cursor',
        date,
        dataQuality: 'exact',
        records,
      };
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd collector && pnpm vitest run test/unit/cursor-provider.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 3: Run full unit suite + typecheck**

Run: `cd collector && pnpm typecheck && pnpm vitest run`
Expected: PASS — no regressions.

- [ ] **Step 4: Commit**

```bash
git add collector/src/providers/cursor.ts
git commit -m "feat: implement Cursor provider with paginated fetch"
```

---

### Task 6: Register provider in main.ts

**Files:**
- Modify: `collector/src/main.ts` (add import + registration block, mirror glm-coding)
- Modify: `collector/test/unit/build-providers.test.ts` (add registration test)

- [ ] **Step 1: Add failing registration test**

Append inside `describe('buildProviders', ...)` in `collector/test/unit/build-providers.test.ts`:

```ts
  it('includes cursor only when apiKey and userEmail are provided', () => {
    const config = makeConfig({
      providers: { cursor: { enabled: true, apiKey: 'k', userEmail: 'u@x.com' } },
    });
    const built = buildProviders(config);
    const cursor = built.find(b => b.provider.name === 'cursor');
    expect(cursor).toBeDefined();
    expect(cursor!.resolvedPath).toBe('https://api.cursor.com');
  });

  it('omits cursor when apiKey is missing', () => {
    const config = makeConfig({
      providers: { cursor: { enabled: true, userEmail: 'u@x.com' } },
    });
    const built = buildProviders(config);
    expect(built.find(b => b.provider.name === 'cursor')).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd collector && pnpm vitest run test/unit/build-providers.test.ts -t cursor`
Expected: FAIL — `cursor` provider not found in built list.

- [ ] **Step 3: Add import to `collector/src/main.ts`**

Add near other provider imports (after the `createGlmCodingProvider` import):

```ts
import { createCursorProvider } from './providers/cursor.js';
```

- [ ] **Step 4: Add registration block to `collector/src/main.ts`**

Insert after the `glm-coding` registration block (which ends at the closing `}` of its `if`):

```ts
  const cursorCfg = config.providers['cursor'];
  if (cursorCfg?.enabled !== false && cursorCfg?.apiKey && cursorCfg?.userEmail) {
    const baseUrl = (cursorCfg.baseUrl as string) ?? 'https://api.cursor.com';
    providers.push({
      provider: createCursorProvider({
        apiKey: cursorCfg.apiKey as string,
        userEmail: cursorCfg.userEmail as string,
        baseUrl,
        machine: config.machine,
        timezone: config.timezone,
      }),
      resolvedPath: baseUrl,
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd collector && pnpm typecheck && pnpm vitest run`
Expected: PASS — full suite green including new cursor registration tests.

- [ ] **Step 6: Commit**

```bash
git add collector/src/main.ts collector/test/unit/build-providers.test.ts
git commit -m "feat: register Cursor provider in collector main"
```

---

### Task 7: Update README and data-integration docs

**Files:**
- Modify: `README.md` (providers table + config example)
- Modify: `docs/data-integration.md` (add Cursor section)

- [ ] **Step 1: Add Cursor row to README providers table**

In `README.md`, find the table starting `| Provider | Billing | Data Quality | Collection Method |` and insert this row before the "GLM Coding" row (so providers stay grouped exact-first):

```
| Cursor | Subscription | exact | Admin API filtered-usage-events |
```

- [ ] **Step 2: Add Cursor block to README config example**

In the `~/.token-matters/config.yaml` block, add this block after the `opencode:` block, before `glm-coding:`:

```yaml
  cursor:
    enabled: true
    apiKey: your-cursor-admin-api-key
    userEmail: jacky@gcu.co.jp
    baseUrl: https://api.cursor.com    # optional
```

- [ ] **Step 3: Append a Cursor section to `docs/data-integration.md`**

Append at the end of the file:

```markdown
## Cursor

**Collection method**: Cursor admin API (`POST /teams/filtered-usage-events`).

**Auth**: HTTP Basic, with the admin API key as username and an empty password (`Basic base64("<key>:")`).

**Request body**:

```json
{
  "startDate": <utc ms>,
  "endDate":   <utc ms>,
  "email":     "<userEmail>",
  "page":      1,
  "pageSize":  100
}
```

`startDate` / `endDate` cover the configured-timezone day boundaries for the target date, converted to UTC milliseconds.

**Pagination**: loop `page` until `page >= pagination.numPages` (cap at 50 pages).

**Filtering**:
- Event must match the configured `userEmail`.
- Drop events with `kind === "Errored, Not Charged"`.
- Drop events that lack `tokenUsage`.

**Aggregation**: group surviving events by `model`, sum `inputTokens`, `outputTokens`, `cacheWriteTokens` (mapped to `cacheCreationTokens`), and `cacheReadTokens`. `requests` is the per-model event count.

**Data quality**: `exact` — token counts are returned directly by the API.

**Out of scope (current iteration)**: cost via `tokenUsage.totalCents`, multi-user team aggregation.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/data-integration.md
git commit -m "docs: document Cursor provider"
```

---

### Task 8: Live smoke test

**Files:** none (config + manual verification)

- [ ] **Step 1: Add Cursor block to local `~/.token-matters/config.yaml`**

```yaml
  cursor:
    enabled: true
    apiKey: <real-cursor-admin-api-key>
    userEmail: jacky@gcu.co.jp
```

- [ ] **Step 2: Confirm provider is recognized**

Run: `cd collector && pnpm collect --status`
Expected output line: `cursor   ... available`

- [ ] **Step 3: Dry-run collect for today**

Run: `cd collector && pnpm collect --dry-run`
Expected: log shows `cursor` provider running, fetched N events, produced ≥0 records.

- [ ] **Step 4: Real collect for today**

Run: `cd collector && pnpm collect`
Expected: a new file `raw/cursor/<today>.json` (or equivalent path your writer uses) with `provider: 'cursor'`, `dataQuality: 'exact'`, and one record per model used today. If you didn't use Cursor today, `records` may be `[]` — that's fine. Try `--date <a-day-you-used-cursor>` to verify non-empty output.

- [ ] **Step 5: Verify summary pipeline picks it up**

After the data repo's GitHub Action runs, check the Live Dashboard for a new `cursor` entry in the provider breakdown. (Out of band — no commit needed.)

- [ ] **Step 6: No commit needed**

This task only validates behavior end-to-end; no source changes.

---

## Self-Review

**Spec coverage:**
- API endpoint + auth → Tasks 4, 5
- Pagination → Task 4 (test), Task 5 (impl)
- Filter by email → Tasks 2, 3
- Drop `Errored, Not Charged` → Tasks 2, 3
- All other kinds counted → Tasks 2, 3 (no kind whitelist)
- Aggregate by model with `cacheWriteTokens → cacheCreationTokens` mapping → Task 3
- Config shape → Tasks 6, 7
- Error handling (401/403, generic non-ok, empty events) → Tasks 4, 5
- Docs → Task 7
- Smoke test → Task 8

**Type consistency:** `CursorUsageEvent`, `CursorTokenUsage`, `CursorUsageEventsResponse`, `createCursorProvider`, `CursorProviderOptions`, `filterUsageEvents`, `aggregateByModel` are used identically across tasks. `cacheCreationTokens` (output) vs `cacheWriteTokens` (input from API) is consistent.

**Placeholders:** none.

**Out of scope per spec:** retries (429/5xx) and frontend changes are intentionally deferred. Spec lists 429 retry as a target — added MAX_PAGES safety cap in Task 5 but no exponential backoff in this plan; if you want retry now, surface as a follow-up task before implementation.
