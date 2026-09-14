# 9Router MIBP Refine

A local AI routing gateway with provider fallback and token-saving features. This is a refined fork of [mhiqrambg/9router-mibp-version](https://github.com/mhiqrambg/9router-mibp-version), itself a fork of [decolua/9router](https://github.com/decolua/9router).

## What this fork adds

- **Hermes Agent multi-model integration** — models picked in the dashboard flow natively into `~/.hermes/config.yaml` as a `providers.9router` block (`models[]`, `default_model`, `key_env`), with an **Add / Remove / Set-Active model** menu in the 9router TUI and a multi-model card in the dashboard.
- **OpenCode V2 integration** — native `providers.9router` route for OpenCode configs (models[], activeModel, subagent model).
- **One-shot installer** — a fresh machine goes from zero to a running dashboard with one command (below).

## Installation (refine fork — one-shot)

Requires Node.js 22 or newer.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/zuher5/9router-mibp-refine/master/scripts/install-server.ps1 | iex
```

### Linux / macOS

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/zuher5/9router-mibp-refine/master/scripts/install-server.sh)
```

What the installer does: clones the repo into `./9router` (if you're not already inside a checkout), generates a secure `.env` (random `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT`, `INITIAL_PASSWORD`), installs dependencies, builds the production bundle, and starts the server in the **foreground** on port 20128.

- Dashboard: `http://localhost:20128/dashboard`
- The generated `INITIAL_PASSWORD` is printed on startup — change it from the dashboard after the first login.
- Stop the server with `Ctrl+C`. For background/auto-start, run the standalone build under PM2/systemd/Task Scheduler — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Data (database, machine-id, CLI secrets) lives in `%APPDATA%\9router` (Windows) or `~/.9router` (Linux/macOS); override with `DATA_DIR`.

## Installation (upstream options)

These follow the original project's distribution channels.

### Option 1: Docker

Pull the image:

```bash
docker pull mhiqrambhrng/9router-mibp-version:latest
```

Run the container:

```bash
mkdir -p 9router-data
docker run -d \
  --name 9router \
  -p 20128:20128 \
  -v 9router-data:/app/data \
  -e DATA_DIR=/app/data \
  -e PORT=20128 \
  -e HOSTNAME=0.0.0.0 \
  -e NODE_ENV=production \
  -e JWT_SECRET=<generate-with-openssl-rand-hex-32> \
  -e INITIAL_PASSWORD=<your-dashboard-password> \
  -e API_KEY_SECRET=<generate-with-openssl-rand-hex-32> \
  -e MACHINE_ID_SALT=<generate-with-openssl-rand-hex-32> \
  mhiqrambhrng/9router-mibp-version:latest
```

Or using Docker Compose (a `docker-compose.yml` is included in this repo):

```bash
cp .env.example .env   # fill in JWT_SECRET, INITIAL_PASSWORD, API_KEY_SECRET, MACHINE_ID_SALT
docker compose up -d
```

Dashboard opens at `http://localhost:20128/dashboard`.

### Option 2: Manual (from source)

Requirements: Node.js 22 or newer.

```bash
git clone https://github.com/mhiqrambg/9router-mibp-version.git
cd 9router-mibp-version

cp .env.example .env
# Edit .env: set JWT_SECRET, INITIAL_PASSWORD, API_KEY_SECRET, MACHINE_ID_SALT

npm install

# Development server
npm run dev

# Or production build
npm run build
npm run start
```

Dashboard opens at `http://localhost:20128/dashboard`.

## More Information

- Upstream project: [https://github.com/decolua/9router](https://github.com/decolua/9router)
- Upstream docs: [DOCKER.md](DOCKER.md) • [ARCHITECTURE.md](docs/ARCHITECTURE.md)
