# 9Router MIBP Refine

A local AI routing gateway with provider fallback and token-saving features. This is a refined fork of [mhiqrambg/9router-mibp-version](https://github.com/mhiqrambg/9router-mibp-version), itself a fork of [decolua/9router](https://github.com/decolua/9router).

## What this fork adds

- **Hermes Agent multi-model integration** — models picked in the dashboard flow natively into `~/.hermes/config.yaml` as a `providers.9router` block (`models[]`, `default_model`, `key_env`), with an **Add / Remove / Set-Active model** menu in the 9router TUI and a multi-model card in the dashboard.
- **OpenCode V2 integration** — native `providers.9router` route for OpenCode configs (models[], activeModel, subagent model).
- **One-shot installer** — a fresh machine goes from zero to a running dashboard with one command (below).
- **npm global install** — `npm install -g 9router-refine` ships the pre-built CLI launcher, same flow as the original `9router` package.

## Installation

Requires Node.js 22 or newer.

### Option 1: npm global install (recommended)

Same experience as the original `9router` package: one command, then a TUI launcher with Web UI, Terminal UI, tray, and auto-update.

```bash
npm install -g 9router-refine
9router-refine
```

`9router` also works as a shorter alias:

```bash
9router
```

Dashboard opens at `http://localhost:20128/dashboard`. The published package contains the pre-built Next.js standalone bundle, so no `npm run build` is needed on your machine.

- Update: `npm i -g 9router-refine@latest`
- Uninstall: `npm uninstall -g 9router-refine`

### Option 2: One-shot installer

#### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/zuher5/9router-mibp-refine/master/scripts/install-server.ps1 | iex
```

#### Linux / macOS

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/zuher5/9router-mibp-refine/master/scripts/install-server.sh)
```

What the installer does: clones the repo into `./9router` (if you're not already inside a checkout), generates a secure `.env` (random `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT`, `INITIAL_PASSWORD`), installs dependencies, builds the production bundle, and starts the server in the **foreground** on port 20128.

- Dashboard: `http://localhost:20128/dashboard`
- The generated `INITIAL_PASSWORD` is printed on startup — change it from the dashboard after the first login.
- Stop the server with `Ctrl+C`. For background/auto-start, run the standalone build under PM2/systemd/Task Scheduler — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Data (database, machine-id, CLI secrets) lives in `%APPDATA%\9router` (Windows) or `~/.9router` (Linux/macOS); override with `DATA_DIR`.

### Option 3: Git clone (manual, from source)

```bash
git clone https://github.com/zuher5/9router-mibp-refine.git
cd 9router-mibp-refine

npm install
npm run build
```

Then start the production server with your own secrets:

#### Linux / macOS

```bash
export PORT=20128
export JWT_SECRET=$(openssl rand -hex 32)
export INITIAL_PASSWORD=$(openssl rand -hex 12)
export API_KEY_SECRET=$(openssl rand -hex 32)
export MACHINE_ID_SALT=$(openssl rand -hex 32)
node .next/standalone/custom-server.js
```

#### Windows (PowerShell)

```powershell
$env:PORT = "20128"
$env:JWT_SECRET    = (New-Guid).ToString("N") + (New-Guid).ToString("N")
$env:INITIAL_PASSWORD = (New-Guid).ToString("N").Substring(0, 24)
$env:API_KEY_SECRET = (New-Guid).ToString("N") + (New-Guid).ToString("N")
$env:MACHINE_ID_SALT = (New-Guid).ToString("N") + (New-Guid).ToString("N")
node .next\standalone\custom-server.js
```

Dashboard opens at `http://localhost:20128/dashboard` — log in with the `INITIAL_PASSWORD` you set (change it from the dashboard after first login). For a dev server with hot reload instead, run `npm run dev` (serves on port 20127).

### Option 4: Docker (build from this repo)

Build the image locally (no prebuilt image is published — build from source so the image always matches this fork):

```bash
git clone https://github.com/zuher5/9router-mibp-refine.git
cd 9router-mibp-refine

# Set the same secrets in a local .env first
cp .env.example .env   # fill in JWT_SECRET, INITIAL_PASSWORD, API_KEY_SECRET, MACHINE_ID_SALT

docker compose up -d --build   # uses the included docker-compose.yml (build: .)
```

Dashboard opens at `http://localhost:20128/dashboard`. Data persists in the `9router-data` volume.

## More Information

- Upstream project: [https://github.com/decolua/9router](https://github.com/decolua/9router)
- Upstream docs: [DOCKER.md](DOCKER.md) • [ARCHITECTURE.md](docs/ARCHITECTURE.md)
