# Hive Run

A controlled HTTP load tester written in Go for authorized performance testing.

## Features

- `.env`-driven configuration with CLI overrides
- Host allowlist enforcement before any traffic is sent
- Worker-pool concurrency with configurable ramp-up
- Optional global QPS cap
- JSON and CSV summary reports
- Safety stop when error rate or timeout rate exceeds thresholds

## Quick Start

1. Copy `configs/.env.example` to `.env`.
2. Update `TARGET_URL` and `ALLOW_HOSTS` for your authorized target.
3. Run:

```bash
go run ./cmd/loadtest
```

You can also override settings from the command line:

```bash
go run ./cmd/loadtest \
  --duration 45s \
  --concurrency 50 \
  --ramp-up 15s \
  --header "Authorization:Bearer token"
```

## Environment Variables

- `TARGET_URL`: Full target URL.
- `METHOD`: HTTP method such as `GET` or `POST`.
- `DURATION`: Total test duration, for example `30s`.
- `MAX_CONCURRENCY`: Maximum number of concurrent workers.
- `RAMP_UP_SECONDS`: Time in seconds to ramp from 1 worker to max concurrency.
- `REQUEST_TIMEOUT_MS`: Per-request timeout in milliseconds.
- `MAX_QPS`: Global QPS cap. Use `0` for uncapped worker throughput.
- `ALLOW_HOSTS`: Comma-separated exact hosts or wildcard entries like `*.example.com`.
- `REQUEST_HEADERS`: Semicolon-separated headers such as `Key:Value;X-Test:1`.
- `REQUEST_BODY`: Raw request body for methods such as `POST`.
- `STOP_ON_ERROR_RATE`: Stop when overall failed request ratio reaches this value.
- `STOP_ON_TIMEOUT_RATE`: Stop when timeout ratio reaches this value.
- `MIN_SAMPLES_BEFORE_STOP`: Minimum request count before safety stop can trigger.
- `RETRY_COUNT`: Retry attempts for network errors, timeouts, `429`, and `5xx`.
- `RETRY_BACKOFF_MS`: Backoff between retries in milliseconds.
- `REPORT_DIR`: Default directory for generated reports.
- `REPORT_JSON_PATH`: Optional explicit JSON output path.
- `REPORT_CSV_PATH`: Optional explicit CSV output path.

## Outputs

- Console summary after each run
- JSON summary report
- CSV summary report

Reports default to the `reports/` directory unless overridden.
