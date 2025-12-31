# Calendly ↔ Sendy Manual Sync & Test Suite

This project lets you periodically sync Calendly invitees (people who book meetings) into a Sendy email list without relying on Zapier or third‑party automation. It provides:

1. A robust manual sync script (`sync_calendly_to_sendy.js`) with dedupe, caching, throttling and reporting.
2. Focused test scripts to validate Calendly and Sendy API behavior in isolation.
3. Optional (legacy) webhook/server components if you later want real‑time updates.

> If you are only doing periodic manual syncs you can ignore all webhook/server sections below.

## Key Scripts

| Script | Purpose |
| ------ | ------- |
| `src/scripts/sync_calendly_to_sendy.js` | Main sync: fetch Calendly invitees in a date window; subscribe new emails to a Sendy list; produce a JSON report. |
| `src/scripts/sync_shopify_to_sendy.js` | Shopify sync: fetch customers or orders from Shopify; subscribe to Sendy list. |
| `src/scripts/test_calendly_events.js` | Atomic Calendly test: fetch events (with date range) and sample invitees—no Sendy calls. |
| `src/scripts/test_sendy_subscribe.js` | Atomic Sendy test: exercise /subscribe endpoint for a single email and show raw response. |
| Other test helpers (`test_calendly_connection.js`, `test_calendly_events.js`, analytics scripts, list scripts) | Diagnostics & exploration (brands, lists, counts, analytics). |

## Installation

```bash
git clone <your-fork-url>
cd sendy-calendly-integration
npm install
```

Create `.env` (or run `npm run setup` if present):

```env
# Sendy
SENDY_API_KEY=your_sendy_api_key
SENDY_INSTALLATION_URL=https://your-sendy.example.com
SENDY_LIST_ID=your_primary_list_id   # optional default for sync script

# Calendly (Personal Access Token for API calls)
CALENDLY_PERSONAL_ACCESS_TOKEN=your_calendly_pat

# Shopify (for Shopify sync)
SHOPIFY_SHOP_NAME=your-shop-name
SHOPIFY_ACCESS_TOKEN=your_shopify_access_token
SENDY_SHOPIFY_LIST_ID=your_shopify_list_id # optional default for shopify sync script

# Optional webhook (only if using server/webhooks)
CALENDLY_WEBHOOK_SECRET=your_webhook_secret
PORT=3000

# Optional caching / tuning
CACHE_TTL=3600
SENDY_SYNC_CACHE_FILE=.sendy_cache_default.json  # override persistent cache filename
```

## Main Sync Script Usage

Basic (recommended: always specify a date window):

```bash
node src/scripts/sync_calendly_to_sendy.js --from 2025-11-01 --to 2025-11-07 --list-id <SENDY_LIST_ID>
```

Flags (both `--flag value` and `--flag=value` forms work):

| Flag | Meaning | Default |
| ---- | ------- | ------- |
| `--from` / `--since` | Start of date window (YYYY-MM-DD or full ISO) | none (fetches ALL if absent) |
| `--to` / `--until` | End of date window (YYYY-MM-DD or full ISO) | none |
| `--list-id` | Target Sendy list ID (required if not in env) | `SENDY_LIST_ID` env |
| `--dry-run` | Do everything except the actual subscribe calls | false |
| `--batch-size` | Number of emails per subscription batch | 20 |
| `--throttle-ms` | Delay between individual subscribe requests | 250ms |
| `--no-cache` | Disable in-memory cache (re-check statuses) | false |
| `--clear-cache` | Flush in-memory cache before run | false |
| `--no-persistent-cache` | Disable persistent JSON cache | false |
| `--cache-file` | Custom persistent cache file path | auto (based on list id) |
| `--refresh-persistent` | Clear persistent cache at start | false |

Date normalization: `YYYY-MM-DD` expands to `T00:00:00Z` (from/since) and `T23:59:59Z` (to/until).

Output: A `sync_report_<timestamp>.json` file containing counts, outcome per email, and failure details.

Safety tip: Omitting date flags will fetch the entire history (can be large). Consider adding a guard (e.g. always pass `--from`/`--to`).

Example with throttling and dry-run:
```bash
node src/scripts/sync_calendly_to_sendy.js --from 2025-10-01 --to 2025-10-07 --list-id <LIST> --dry-run --batch-size 5 --throttle-ms 500
```

## Shopify Sync Script Usage

Sync customers from Shopify (either from Orders or Customers list) to a Sendy list.

```bash
node src/scripts/sync_shopify_to_sendy.js --from 2025-11-01 --to 2025-11-07 --list-id <SENDY_LIST_ID>
```

Flags:

| Flag | Meaning | Default |
| ---- | ------- | ------- |
| `--from` / `--since` | Start of date window (YYYY-MM-DD or full ISO) | none (fetches ALL if absent) |
| `--to` / `--until` | End of date window (YYYY-MM-DD or full ISO) | none |
| `--list-id` | Target Sendy list ID (required if not in env `SENDY_SHOPIFY_LIST_ID`) | `SENDY_SHOPIFY_LIST_ID` env |
| `--source` | Source of emails: `orders` or `customers` | `orders` |
| `--order-status` | Filter orders by status (e.g. `any`, `open`, `closed`, `cancelled`) | `any` |
| `--dry-run` | Do everything except the actual subscribe calls | false |
| `--batch-size` | Number of emails per subscription batch | 20 |
| `--throttle-ms` | Delay between individual subscribe requests | 250ms |
| `--no-cache` | Disable in-memory cache | false |
| `--no-persistent-cache` | Disable persistent JSON cache | false |

Output: A `shopify_sync_report_<timestamp>.json` file.

## Calendly Atomic Test

Use when verifying date range behavior without Sendy involvement:

```bash
node src/scripts/test_calendly_events.js --from 2025-11-01 --to 2025-11-07 --limit 5
```

Flags:
| Flag | Purpose |
| ---- | ------- |
| `--from` / `--since` | Start date window |
| `--to` / `--until` | End date window |
| `--limit` | Max events to print (does not limit API query) |

The script also locally re-filters returned events to prove they fall within the requested window.

## Sendy Atomic Subscribe Test

Validate raw `/subscribe` behavior:

```bash
node src/scripts/test_sendy_subscribe.js --list-id <LIST_ID> --email test.user@example.com --name "Test User"
```

It prints success flag, status code, and the raw Sendy response (e.g. `"1"`, `"Already subscribed."`, or an error string). The sync script treats `"1"` and "Already subscribed" as success, and filters known error keywords.

## Caching Strategy

Two layers:
- In-memory (NodeCache): avoids repeated status/subscription checks within a process. Clear with `--clear-cache`.
- Persistent file (JSON): records emails confirmed subscribed; skip re-checking in future runs. Disable via `--no-persistent-cache`; refresh with `--refresh-persistent`.

Cache keys are namespaced per list: `synced:<listId>:<email>`.

## Throttling & Batching

During subscribe phase:
- Batch size (`--batch-size`) controls how many emails are processed before the next internal slice.
- Throttle (`--throttle-ms`) waits between individual POSTs (not between batches). Increase values if Sendy rate limits or to reduce server load.

Status checks for existing subscribers currently run sequentially (one per email) to keep logic simple and avoid concurrency complications with unpredictable Sendy rate limits.

## Reports

Each run writes a JSON file like:
```json
{
  "listId": "<id>",
  "since": "2025-11-01T00:00:00Z",
  "until": "2025-11-07T23:59:59Z",
  "totals": {
    "checked": 3,
    "attempted": 3,
    "subscribed": 3,
    "skipped": { "cached": 0, "alreadySubscribed": 0, "unsubscribed": 0, "bouncedOrComplained": 0, "unknownStatus": 0 },
    "subscriptionFailures": 0
  },
  "results": [ { "email": "example@domain.com", "success": true, "message": "1" } ]
}
```

## Environment Variable Reference

| Var | Required | Purpose |
| --- | -------- | ------- |
| `SENDY_API_KEY` | yes | Auth for Sendy API calls |
| `SENDY_INSTALLATION_URL` | yes | Base URL (e.g. https://newsletter.example.com) |
| `SENDY_LIST_ID` | optional | Default list for sync script |
| `CALENDLY_PERSONAL_ACCESS_TOKEN` | yes (for scripts) | Calendly API PAT for events/invitees |
| `SHOPIFY_SHOP_NAME` | yes (for shopify sync) | Shopify store name (subdomain) |
| `SHOPIFY_ACCESS_TOKEN` | yes (for shopify sync) | Shopify Admin API access token |
| `SENDY_SHOPIFY_LIST_ID` | optional | Default list for shopify sync script |
| `CALENDLY_WEBHOOK_SECRET` | no (unless using webhooks) | Verify webhook signatures |
| `CACHE_TTL` | no | In-memory cache TTL seconds |
| `SENDY_SYNC_CACHE_FILE` | no | Override persistent cache path |

## Legacy Webhook / Server (Optional)

The original design included a server (`src/server.js`) and webhook handler (`src/handlers/webhookHandler.js`). If you decide to enable real-time updates:
1. Expose the server publicly (HTTPS).
2. Configure a Calendly webhook to POST invitee creation events.
3. Ensure `CALENDLY_WEBHOOK_SECRET` is set for signature verification.

For purely manual sync flows you can ignore these components.

## Troubleshooting Quick Reference

| Symptom | Likely Cause | Action |
| ------- | ------------ | ------ |
| Fetching thousands of events | Missing date flags | Add `--from` / `--to` |
| 0 subscribed but report shows attempts | Response parsing mismatch (now fixed) | Ensure updated code treats `"1"` as success |
| Process hangs | Cache timers not shut down (fixed) | Use current version; scripts exit cleanly |
| "No data passed" from Sendy lists | Install expects POST & HTTPS | Verify URL; fallback logic already implemented |

## Contributing

PRs welcome for: concurrency optimization on status checks, automated tests, webhook revival, performance metrics.

## License

MIT

## Support

Open an issue with sanitized logs if you hit edge cases. Include command, flags, and a redacted report snippet.

---

Focused test first, then sync. Keep date windows tight for daily or weekly runs.