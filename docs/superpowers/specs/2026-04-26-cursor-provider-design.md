# Cursor Provider — Design

**Date**: 2026-04-26
**Status**: Approved (pending implementation)

## Goal

Add Cursor as a new provider in the collector, capturing exact token usage via the Cursor Admin API.

## Scope

- Single user collection (filter by `userEmail`, default `jacky@gcu.co.jp`).
- Token counts only (input / output / cache write / cache read), grouped by model.
- All event kinds counted (`Included in Pro`, `Usage-based`, etc.) except errored events (`Errored, Not Charged`).
- No cost tracking in this iteration.

## API

**Endpoint**: `POST https://api.cursor.com/teams/filtered-usage-events`

**Auth**: `Authorization: Basic base64(apiKey:)` (Admin API key, password empty)

**Request body** (per page):
```json
{
  "startDate": 1745625600000,
  "endDate":   1745711999999,
  "userId":    null,
  "email":     "jacky@gcu.co.jp",
  "page":      1,
  "pageSize":  100
}
```

Timestamps are UTC milliseconds. Date range is the target collection date in the configured timezone, converted to UTC.

**Response shape** (relevant fields):
```ts
{
  usageEvents: Array<{
    timestamp: string;              // ms epoch as string
    userEmail: string;
    model: string;                  // e.g. "claude-4-sonnet"
    kind: string;                   // "Included in Pro" | "Usage-based" | "Errored, Not Charged" | ...
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheWriteTokens: number;
      cacheReadTokens: number;
      totalCents: number;           // ignored — cost not tracked yet
    };
  }>;
  pagination: { numPages: number; ... };
}
```

Pagination: loop until `page >= numPages`.

## Configuration

`~/.token-matters/config.yaml`:

```yaml
providers:
  cursor:
    enabled: true
    apiKey: <cursor-admin-api-key>
    userEmail: jacky@gcu.co.jp
    baseUrl: https://api.cursor.com   # optional
```

Disabled if `enabled: false` or `apiKey` is missing (matches `glm-coding` behavior).

## Data Mapping

Aggregation rule: group events by `model`, sum token fields. Skip events whose `kind === 'Errored, Not Charged'`.

Output `RawDataFile`:

```ts
{
  version: '1.0',
  collectedAt: <ISO>,
  machine: <hostname>,
  provider: 'cursor',
  date: '2026-04-26',
  dataQuality: 'exact',
  records: [
    {
      model: 'claude-4-sonnet',
      inputTokens,
      outputTokens,
      cacheCreationTokens: cacheWriteTokens,   // map to existing field name
      cacheReadTokens,
      totalTokens: sum of the four,
      requests: <event count for this model>,
      note: 'Cursor admin API filtered-usage-events',
    },
    // one record per model
  ]
}
```

If no events: `records: []` (do not error).

## File Layout

| File | Purpose |
|------|---------|
| `collector/src/providers/cursor.ts` | Provider factory, API fetch + pagination, output assembly |
| `collector/src/providers/cursor-parser.ts` | Pure functions: filter events, aggregate by model |
| `collector/src/providers/cursor-parser.test.ts` | Unit tests for parser/aggregator (TDD) |
| `collector/src/main.ts` | Register provider following `glm-coding` pattern |
| `README.md` | Add Cursor row to providers table + config example |
| `docs/data-integration.md` | Append Cursor section with API details |

## Error Handling

| Condition | Behavior |
|-----------|----------|
| 401 / 403 | Throw `Error('Cursor admin API auth failed — check apiKey')` |
| 429 | Exponential backoff, max 3 retries (1s, 2s, 4s) |
| 5xx | Single retry, then surface error |
| Network error | Surface error |
| Empty `usageEvents` | Return empty `records` array, do not throw |

## Testing

- Unit tests on `cursor-parser.ts`:
  - Aggregates multiple events for same model.
  - Skips `Errored, Not Charged`.
  - Filters by `userEmail`.
  - Maps `cacheWriteTokens` → `cacheCreationTokens`.
  - Handles missing `tokenUsage`.
- No live API calls in tests — fixture-based.

## Out of Scope (Deferred)

- Cost tracking via `totalCents`.
- Multi-user team aggregation.
- `/teams/spend` integration.
- Frontend changes (Cursor will appear automatically once data lands in the summary pipeline; verify after first collection).
