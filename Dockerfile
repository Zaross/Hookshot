# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 – Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --prefer-offline --silent

COPY frontend/ ./
RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 – Build the Rust binary
# rust:alpine uses musl by default → fully static binary, no glibc needed.
# ─────────────────────────────────────────────────────────────────────────────
FROM rust:1-alpine3.19 AS rust-builder

# musl-dev supplies the C toolchain required by bundled SQLite (libsqlite3-sys)
RUN apk add --no-cache musl-dev

WORKDIR /app

# ── Dependency-caching layer ──────────────────────────────────────────────────
# Build a stub binary so all crate dependencies compile into a cached layer.
# Only invalidated when Cargo.toml / Cargo.lock change.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src migrations \
    && printf 'fn main(){}' > src/main.rs \
    && touch migrations/.keep \
    && cargo build --release \
    && rm -rf src target/release/deps/hookshot* target/release/hookshot*

# ── Real build ────────────────────────────────────────────────────────────────
COPY src/        ./src/
COPY migrations/ ./migrations/
RUN cargo build --release \
    && strip target/release/hookshot


# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 – Minimal Alpine runtime (~20 MB total image)
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.19

# ca-certificates → HTTPS calls to Discord
# tzdata          → correct timezone in log timestamps
# su-exec         → drop privileges in entrypoint (Alpine's gosu equivalent)
RUN apk add --no-cache ca-certificates tzdata su-exec \
    && addgroup -S webhook \
    && adduser  -S -G webhook -H -s /sbin/nologin webhook

WORKDIR /app

COPY --from=rust-builder     /app/target/release/hookshot ./hookshot
COPY --from=frontend-builder /app/frontend/dist           ./frontend/dist
COPY docker-entrypoint.sh    ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh \
    && chown -R webhook:webhook /app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO /dev/null http://localhost:8080/health || exit 1

ENV DATABASE_URL=sqlite:/app/data/app.db \
    PORT=8080 \
    FRONTEND_DIR=/app/frontend/dist \
    RUST_LOG=hookshot=info,tower_http=info

ENTRYPOINT ["./docker-entrypoint.sh"]
