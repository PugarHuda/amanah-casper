# C3 — the hosted autonomous loop. Runs Amanah's ingest→reason→attest→execute cycle
# forever (CYCLE_MS interval). Deploy to any container host (Fly.io, Railway, a VM):
#   docker build -t amanah-agent -f agent/Dockerfile .
#   docker run -d --restart=always --env-file .env --name amanah amanah-agent
# The loop attests every cycle on-chain, so /api/heartbeat on the web goes green on its
# own once this is up. Secrets (agent/custodian PEMs, CSPR.cloud key) come from env /
# a mounted secret dir — NEVER baked into the image.
FROM node:22-slim
WORKDIR /app

# Contracts wasm is read by some deploy scripts; the loop itself only needs agent/.
COPY agent/package*.json ./agent/
RUN cd agent && npm ci --omit=dev || npm install --omit=dev

COPY agent ./agent
COPY contracts/wasm ./contracts/wasm

WORKDIR /app/agent
ENV NODE_ENV=production
# Restart-safe: the loop is idempotent per cycle; a crash + restart just resumes cycling.
CMD ["npm", "run", "start"]
