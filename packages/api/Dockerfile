# keel-api — Hono server + background workers (settlement-scheduler shells to `forge`).
# Built from the MONOREPO ROOT (set Railway's root dir to the repo root, dockerfilePath
# = packages/api/Dockerfile) so the workspace + contracts package are in the build context.
FROM node:22-bookworm-slim

# System deps: git (forge-std submodule), curl/ca-certs (foundryup), build tools (better-sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

# Foundry (forge) — the settlement-scheduler/onchain.ship spawn `forge script`.
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

# pnpm via corepack.
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate

WORKDIR /app
COPY . .

# Ensure forge-std is present (submodule may not be checked out in the build context).
RUN git submodule update --init --recursive 2>/dev/null || \
    (rm -rf packages/contracts/lib/forge-std && \
     git clone --depth 1 https://github.com/foundry-rs/forge-std packages/contracts/lib/forge-std)

# Install (builds better-sqlite3 native binding via onlyBuiltDependencies) + build workspace libs.
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @keel/lifi --filter @keel/hyperliquid build
# Pre-build the contracts so the keeper's `forge script` runs fast (no first-call compile).
RUN cd packages/contracts && forge build

ENV PORT=8080
EXPOSE 8080
# Env (BASE_RPC_URL, KEEPER_PRIVATE_KEY, RESERVE_ADDRESS, SETTLE_BROADCAST, LIFI_API_KEY,
# HL_*) is injected by Railway — start:prod has no --env-file.
CMD ["pnpm", "--filter", "@keel/api", "start:prod"]
