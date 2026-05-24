<div align="center">

<img src="frontend/public/favicon.svg" alt="Hookshot Logo" width="80" height="80" />

# Hookshot

**Forward GitHub & GitLab push events to Discord — beautifully.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-1.87-orange?logo=rust)
![Docker](https://img.shields.io/badge/Docker-Alpine-2496ED?logo=docker)

[**Documentation →**](https://zaross.github.io/Hookshot/)

</div>

---

Hookshot is a self-hosted webhook bridge that listens for push events from GitHub or GitLab and posts fully customizable Discord embeds. It ships with a clean admin UI, real-time log streaming, automatic retry queuing, Prometheus metrics, and everything needed to run reliably in production — all in a ~20 MB Docker image.

---

## ✨ Features

### 🔗 Webhook Handling
- **GitHub & GitLab** push webhooks — both work out of the box
- **HMAC signature verification** (GitHub `x-hub-signature-256`) and secret token validation (GitLab `x-gitlab-token`) with constant-time comparison to prevent timing attacks
- Per-repository **branch filter** — only forward pushes from branches you care about
- Per-repository **commit keyword filter** — silently drop commits matching patterns (e.g. `[skip-notify]`)
- **Dependabot** pushes are automatically ignored
- **Rate limiting** — 120 requests / 60 s per IP on the webhook receiver with proper `Retry-After` and `X-RateLimit-*` response headers

### 📨 Discord Embeds
- Fully **custom embed templates** — title, description, color, footer, thumbnail, author, image
- Rich **template variables**: repo name, pusher, branch, commit lists, timestamps
- Native **Discord timestamp tags** (`<t:...:R>` etc.) — all 7 formats supported
- Long descriptions are **auto-split** into multiple embeds so nothing gets cut off

### 🔁 Reliability
- **Automatic retry queue** — on Discord 429 / 5xx, the message is queued and retried with exponential backoff (30 s → 60 s → 2 min → 5 min, up to 5 attempts)
- **Discord rate limiting** — 500 ms minimum gap between sends to the same webhook URL
- **Queue management UI** — inspect, retry, or purge failed entries from the admin panel
- **Log retention** — configurable auto-purge (default 90 days for webhook logs, 30 days for audit logs)
- **SQLite VACUUM + ANALYZE** — weekly database maintenance keeps the file size down and the query planner sharp

### 📊 Dashboard & Monitoring
- **Real-time dashboard** — stats update live via Server-Sent Events, no manual refresh needed
- **Live log feed** — new webhook events appear instantly with a pulsing Live indicator
- **Log detail modal** — inspect the full payload of any event, retry failed ones with one click
- Filterable log list by status, platform, and repository — **filters are URL-persistent** (shareable links)
- **`/metrics` endpoint** — Prometheus-compatible text format: webhook counts by status, queue depth, repository and user totals
- **`/health` endpoint** — returns `{"status":"healthy","db":"ok"}` with an actual DB connectivity check; returns `503` if the database is unreachable

### 🔐 Security & Auth
- **Multi-user** with Admin / User roles
- **Two-factor authentication** (TOTP — Google Authenticator, Bitwarden, Authy, etc.)
- **TOTP backup codes** — 8 one-time recovery codes generated on 2FA enable, SHA-256 hashed at rest
- **Brute-force protection** — per-account lockout after 5 failures and per-IP rate limiting (20 attempts / 15 min), persisted in SQLite so limits survive restarts
- **Session management** — view and revoke active sessions individually or all at once
- **Audit log** — every admin action is recorded with user, action, and timestamp; configurable retention

### 🛠 Admin
- **Embed Builder** — live preview as you design your Discord embed template
- **Test send** — fire a test embed to Discord directly from the repository settings
- **Webhook token regeneration** — invalidate the old URL with one click
- **Export / bulk import** repositories as JSON
- **Settings UI** — API keys and maintenance settings in separate sections; changes take effect immediately via in-memory settings cache (no restart needed)
- **Dark & light theme**, German / English UI

### 📖 API
- **OpenAPI 3.0 spec** auto-generated from all handler annotations — served at `/api/docs/openapi.json`
- **Swagger UI** at `/api/docs` — explore and try every endpoint in the browser
- **Structured JSON logging** — set `LOG_FORMAT=json` for log aggregators (Loki, CloudWatch, Datadog, etc.)

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/your-username/hookshot.git
cd hookshot

# 2. Configure (optional — defaults work out of the box)
cp .env.example .env

# 3. Start
docker compose up -d
```

Open **http://localhost:8080** and sign in with **`admin` / `admin123`**.

> You will be prompted to change the password on first login.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port the server listens on |
| `DATABASE_URL` | `sqlite:data/app.db` | SQLite database path |
| `FRONTEND_DIR` | `frontend/dist` | Path to built frontend assets |
| `HOST_PORT` | `8080` | Host port exposed by Docker Compose |
| `RUST_LOG` | `hookshot=info,tower_http=info` | Log level filter |
| `LOG_FORMAT` | *(plain text)* | Set to `json` for structured JSON log output |
| `CORS_ORIGIN` | *(disabled)* | Allowed CORS origin (e.g. `https://app.example.com`) |

---

## 🔧 Webhook Setup

### GitHub

1. Go to your repository → **Settings → Webhooks → Add webhook**
2. Set the **Payload URL** to `https://your-domain.com/webhook/<token>`
3. Set **Content type** to `application/json`
4. Enter the **Secret** you configured in Hookshot
5. Select **Just the push event**
6. Click **Add webhook** ✓

### GitLab

1. Go to your project → **Settings → Webhooks**
2. Set the **URL** to `https://your-domain.com/webhook/<token>`
3. Enter the **Secret token** you configured in Hookshot
4. Enable **Push events**
5. Click **Add webhook** ✓

> The webhook token and secret are generated automatically when you create a repository in Hookshot. Copy them from the repository detail page.

---

## 🧩 Embed Variables

Use these placeholders anywhere in your embed template (title, description, footer, URLs, …):

| Variable | Description |
|---|---|
| `{{repo_name}}` | Short repository name (e.g. `my-app`) |
| `{{repo_full_name}}` | Full name including owner (e.g. `acme/my-app`) |
| `{{repo_url}}` | Link to the repository |
| `{{pusher_name}}` | Username of the person who pushed |
| `{{pusher_avatar}}` | Avatar URL of the pusher |
| `{{branch}}` | Branch that was pushed to |
| `{{commit_count}}` | Number of commits in the push |
| `{{all_commits}}` | All commits as `[hash](url) - message - author` |
| `{{added_commits}}` | Only commits that added files |
| `{{modified_commits}}` | Only commits that modified files |
| `{{removed_commits}}` | Only commits that removed files |
| `{{discord_timestamp_R}}` | Relative time — e.g. *2 minutes ago* |
| `{{discord_timestamp_F}}` | Full date & time |
| `{{discord_timestamp_D}}` | Long date |
| `{{discord_timestamp_T}}` | Time with seconds |
| `{{discord_timestamp_t}}` | Short time |
| `{{discord_timestamp_d}}` | Short date |
| `{{discord_timestamp_f}}` | Date and short time |

---

## 📡 Monitoring

### Prometheus

Scrape `/metrics` — no authentication required:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: hookshot
    static_configs:
      - targets: ['hookshot:8080']
```

**Exposed metrics:**

| Metric | Type | Description |
|---|---|---|
| `hookshot_webhooks_total` | gauge | Total webhook log entries |
| `hookshot_webhooks_by_status` | gauge | Entries grouped by `success` / `failed` / `skipped` |
| `hookshot_queue_depth` | gauge | Retry queue size (`pending` / `failed`) |
| `hookshot_repositories` | gauge | Repository count (`total` / `active`) |
| `hookshot_users_total` | gauge | Total user accounts |

### Health Check

```bash
curl https://your-domain.com/health
# {"status":"healthy","db":"ok"}
```

Returns HTTP `503` if the database is unreachable.

---

## 🏗 Manual Build

<details>
<summary>Build without Docker</summary>

**Requirements:** Rust 1.75+, Node.js 18+

```bash
# Frontend
cd frontend
npm install
npm run build
cd ..

# Backend
cargo build --release

# Run
./target/release/hookshot
```

The server serves the frontend from `FRONTEND_DIR` (default: `frontend/dist`).

</details>

---

## 🧪 Development

```bash
# Run Rust tests
cargo test

# Lint
cargo clippy -- -D warnings

# Check formatting
cargo fmt --check

# Frontend dev server (with HMR)
cd frontend && npm run dev
```

---

## 🛳 Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust · Axum 0.8 · SQLx 0.9 (SQLite, bundled) |
| Frontend | React 19 · TypeScript · Vite 6 · Tailwind |
| Auth | JWT (jsonwebtoken 10) · Argon2 · TOTP (totp-rs 5.7) |
| Real-time | Server-Sent Events (SSE) |
| Monitoring | Prometheus text format · structured JSON logging |
| API Docs | utoipa 5 · Swagger UI 9 |
| Container | Alpine Linux (~20 MB image) |

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
