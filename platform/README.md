# BERAHOST

**BERAHOST** is a self-hosted WhatsApp bot hosting platform. Deploy and manage WhatsApp bots with a full web dashboard, real-time logs, pairing code support, team management, a marketplace, coin-based billing, and an AI guide powered by a free API.

---

## Features

- 🤖 **Bot Hosting** — Deploy WhatsApp bots from GitHub repos with one click
- 📊 **Real-time Logs** — Live terminal output streamed via Socket.IO
- 🔑 **Pairing Code Support** — Scan QR or use a pairing code to link your WhatsApp
- 👥 **Teams** — Invite collaborators to manage bots together
- 🛒 **Marketplace** — Browse and install community bots
- 💰 **Coin Billing** — Internal credit system for resource usage
- 🚨 **Crash Alerts** — Instant notification + AI guide popup when a bot crashes
- 🤖 **BERA AI Guide** — Animated AI assistant that knows your account and can navigate pages
- 📸 **WhatsApp-style Avatar Upload** — Click-to-upload profile photos
- 🔐 **Admin Panel** — Manage users, bots, platform settings

---

## Table of Contents

1. [Quick Start with Docker](#1-quick-start-with-docker)
2. [Manual VPS Setup](#2-manual-vps-setup)
3. [HTTPS / SSL with Certbot](#3-https--ssl-with-certbot)
4. [Environment Variables](#4-environment-variables)
5. [Default Admin Credentials](#5-default-admin-credentials)
6. [Updating BERAHOST](#6-updating-berahost)
7. [Troubleshooting](#7-troubleshooting)
8. [Running on Android (Termux)](#8-running-on-android-termux)
9. [Running on Windows](#9-running-on-windows)

---

## 1. Quick Start with Docker

The fastest way to run BERAHOST. Requires **Docker** and **Docker Compose** (v2+).

### Prerequisites

```bash
# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/bera-tech-ai/berahost.git
cd berahost

# 2. Create your .env file
cp .env.example .env
nano .env
```

Edit `.env` and set at minimum:

| Variable | What to change |
|---|---|
| `DB_PASSWORD` | A strong random password |
| `SESSION_SECRET` | Run `openssl rand -hex 32` and paste the output |
| `ADMIN_PASSWORD` | Your admin login password |
| `PLATFORM_URL` | Your domain or server IP (e.g. `https://berahost.yourdomain.com`) |

```bash
# 3. Run the database migration + start everything
docker compose up -d

# 4. Check all services are healthy
docker compose ps
```

BERAHOST is now running on **port 80**. Open `http://your-server-ip` in your browser.

> **First run:** the `migrate` container runs the DB schema migration automatically, then exits. The `api` and `web` containers start serving traffic once the DB is ready.

---

### Docker Compose Services

| Service | Role |
|---|---|
| `db` | PostgreSQL 16 database |
| `migrate` | One-shot DB schema migration (exits after completion) |
| `api` | Express 5 API server + Socket.IO (port 8080, internal) |
| `web` | Nginx serving static frontend + proxying `/api/*` to the API |

---

## 2. Manual VPS Setup

Follow this guide to install BERAHOST directly on a Ubuntu 22.04+ VPS without Docker.

### 2.1 Server Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 10 GB | 20 GB |
| OS | Ubuntu 22.04 | Ubuntu 24.04 |

---

### 2.2 Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # should be v22.x.x
npm -v

# Install pnpm
npm install -g pnpm

# Install PostgreSQL 16
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install Git
sudo apt install -y git
```

---

### 2.3 Create a PostgreSQL Database

```bash
# Switch to the postgres user
sudo -u postgres psql

# Inside psql, run these commands:
CREATE USER berahost WITH PASSWORD 'your_strong_password';
CREATE DATABASE berahost OWNER berahost;
GRANT ALL PRIVILEGES ON DATABASE berahost TO berahost;
\q
```

---

### 2.4 Clone & Install BERAHOST

```bash
# Create app directory
sudo mkdir -p /var/www/berahost
sudo chown $USER:$USER /var/www/berahost

# Clone the repo
git clone https://github.com/bera-tech-ai/berahost.git /var/www/berahost
cd /var/www/berahost

# Install all dependencies
pnpm install
```

---

### 2.5 Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Fill in your values (see [Environment Variables](#4-environment-variables) below). At minimum set:

```env
DATABASE_URL=postgresql://berahost:your_strong_password@localhost:5432/berahost
SESSION_SECRET=<output of: openssl rand -hex 32>
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
PLATFORM_URL=https://berahost.yourdomain.com
PORT=8080
```

---

### 2.6 Run Database Migrations

```bash
cd /var/www/berahost

# Load env vars
export $(grep -v '^#' .env | xargs)

# Push the schema to PostgreSQL
pnpm --filter @workspace/db run push
```

---

### 2.7 Build the Application

```bash
cd /var/www/berahost

# Load env vars
export $(grep -v '^#' .env | xargs)

# Build the API server
pnpm --filter @workspace/api-server run build

# Build the React frontend (PORT and BASE_PATH are required by Vite)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/berahost run build
```

Outputs:
- API bundle → `artifacts/api-server/dist/index.mjs`
- Frontend static files → `artifacts/berahost/dist/public/`

---

### 2.8 Set Up systemd Service (API Server)

Create a service file so the API starts automatically:

```bash
sudo nano /etc/systemd/system/berahost-api.service
```

Paste the following (replace paths and env values with your own):

```ini
[Unit]
Description=BERAHOST API Server
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/berahost
ExecStart=/usr/bin/node --enable-source-maps artifacts/api-server/dist/index.mjs
Restart=always
RestartSec=5

# Environment variables
Environment=NODE_ENV=production
Environment=PORT=8080
Environment=DATABASE_URL=postgresql://berahost:your_strong_password@localhost:5432/berahost
Environment=SESSION_SECRET="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
Environment=ADMIN_EMAIL=admin@yourdomain.com
Environment=ADMIN_PASSWORD="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
Environment=PLATFORM_URL=https://berahost.yourdomain.com

[Install]
WantedBy=multi-user.target
```

```bash
# Fix file ownership
sudo chown -R www-data:www-data /var/www/berahost

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable berahost-api
sudo systemctl start berahost-api

# Check it's running
sudo systemctl status berahost-api
```

---

### 2.9 Configure Nginx

```bash
# Copy the pre-built frontend files
sudo mkdir -p /var/www/berahost-frontend
sudo cp -r /var/www/berahost/artifacts/berahost/dist/public/. /var/www/berahost-frontend/

# Create Nginx site config
sudo nano /etc/nginx/sites-available/berahost
```

Paste this config (replace `yourdomain.com` with your actual domain or IP):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options       "SAMEORIGIN"  always;
    add_header X-Content-Type-Options "nosniff"    always;
    add_header Referrer-Policy       "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript image/svg+xml;

    # API + Socket.IO proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host       $host;
        proxy_set_header   X-Real-IP  $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # Static frontend (SPA)
    location / {
        root  /var/www/berahost-frontend;
        index index.html;
        try_files $uri $uri/ /index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/berahost /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx
```

Open `http://your-server-ip` in your browser — BERAHOST should be live.

---

## 3. HTTPS / SSL with Certbot

> Requires a domain name pointed to your server's IP.

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain a certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically. Test it:
sudo certbot renew --dry-run
```

Certbot will automatically update your Nginx config to handle HTTPS and redirect HTTP → HTTPS.

---

## 4. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | — | Secret for signing session cookies (`openssl rand -hex 32`) |
| `PORT` | ✅ | `8080` | Port the API server listens on |
| `NODE_ENV` | — | `development` | Set to `production` in production |
| `ADMIN_EMAIL` | — | `admin@berahost.com` | Email for the auto-seeded admin account |
| `ADMIN_PASSWORD` | — | `[redacted-default-password]` | Password for the auto-seeded admin (change this!) |
| `PLATFORM_URL` | — | — | Public URL of your deployment (used in links/emails) |
| `DB_PASSWORD` | Docker only | `changeme` | Password used by docker-compose to create the DB user |
| `HTTP_PORT` | Docker only | `80` | Host port exposed by the Nginx container |

---

## 5. Default Admin Credentials

On first startup, BERAHOST seeds an admin account automatically:

| Field | Default value |
|---|---|
| Email | `admin@berahost.com` |
| Password | `Admin@berahost1` |

> **Change the password immediately** after your first login via **Settings → Admin Password**, or set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in your `.env` before first launch.

---

## 6. Updating BERAHOST

### Docker

```bash
cd /var/www/berahost

# Pull latest code
git pull origin main

# Rebuild and restart (zero downtime for DB)
docker compose build
docker compose up -d
```

### Manual

```bash
cd /var/www/berahost

# Pull latest code
git pull origin main

# Install any new dependencies
pnpm install

# Run any new migrations
pnpm --filter @workspace/db run push

# Rebuild
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/berahost run build

# Copy fresh frontend files
sudo cp -r artifacts/berahost/dist/public/. /var/www/berahost-frontend/

# Restart the API
sudo systemctl restart berahost-api
```

---

## 7. Troubleshooting

### API server won't start

```bash
# Check logs
sudo journalctl -u berahost-api -n 50 --no-pager

# Most common causes:
# - DATABASE_URL is wrong or Postgres is not running
# - PORT is already in use
# - SESSION_SECRET is missing
```

### Database connection error

```bash
# Verify Postgres is running
sudo systemctl status postgresql

# Test the connection manually
psql "postgresql://berahost:your_password@localhost:5432/berahost" -c "SELECT 1;"
```

### Nginx 502 Bad Gateway

```bash
# The API server is probably not running
sudo systemctl status berahost-api

# Check what's on port 8080
sudo ss -tlnp | grep 8080
```

### Docker: migrate container keeps restarting

```bash
# View migration logs
docker compose logs migrate

# Usually means DB_PASSWORD in .env doesn't match what Postgres was initialized with.
# To reset: remove the volume and recreate
docker compose down -v
docker compose up -d
```

### Bots crash immediately after starting

Bot processes require `git` and `node` to be available in the server's PATH. Verify:

```bash
which git
which node
node -v  # Must be v18+
```

---

## 8. Running on Android (Termux)

Termux is a free Android app that gives you a full Linux terminal on your phone. BERAHOST runs on it with no Docker needed.

### 8.1 Install Termux

Download **Termux from F-Droid** (recommended — the Play Store version is outdated):
👉 https://f-droid.org/packages/com.termux/

---

### 8.2 Install Dependencies

Open Termux and run:

```bash
# Update package list
pkg update && pkg upgrade -y

# Install core tools
pkg install -y nodejs git postgresql openssl-tool

# Install pnpm
npm install -g pnpm

# Verify
node -v   # should be v22+
pnpm -v
```

---

### 8.3 Set Up PostgreSQL

```bash
# Initialize the database cluster (first time only)
initdb $PREFIX/var/lib/postgresql

# Start PostgreSQL
pg_ctl -D $PREFIX/var/lib/postgresql start

# Create the database (no password needed on Termux)
createdb berahost
```

To start PostgreSQL automatically every time you open Termux, add this to `~/.bashrc`:

```bash
echo 'pg_ctl -D $PREFIX/var/lib/postgresql start -l $PREFIX/var/lib/postgresql/pg.log' >> ~/.bashrc
```

---

### 8.4 Clone & Install BERAHOST

```bash
git clone https://github.com/bera-tech-ai/berahost.git
cd berahost
pnpm install
```

---

### 8.5 Configure Environment

```bash
# Get your Termux username (usually your phone's user)
whoami

# Set environment variables (add these to ~/.bashrc to make permanent)
export DATABASE_URL="postgresql://$(whoami)@localhost/berahost"
export SESSION_SECRET=$(openssl rand -hex 32)
export NODE_ENV=production
export PORT=8080
export ADMIN_EMAIL=admin@berahost.com
export ADMIN_PASSWORD="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
```

To make them permanent:

```bash
cat >> ~/.bashrc << 'EOF'
export DATABASE_URL="postgresql://$(whoami)@localhost/berahost"
export SESSION_SECRET="paste_your_generated_secret_here"
export NODE_ENV=production
export PORT=8080
EOF
source ~/.bashrc
```

---

### 8.6 Build & Run

```bash
cd ~/berahost

# Run database migration
pnpm --filter @workspace/db run push

# Build the API server
pnpm --filter @workspace/api-server run build

# Build the frontend
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/berahost run build

# Start the API server in the background
nohup node --enable-source-maps artifacts/api-server/dist/index.mjs > api.log 2>&1 &

# Serve the frontend static files
nohup npx serve artifacts/berahost/dist/public -l 3000 > frontend.log 2>&1 &

echo "BERAHOST is running!"
echo "Open http://localhost:3000 in your browser"
```

---

### 8.7 Access BERAHOST

- **On the same phone:** Open `http://localhost:3000` in your browser
- **From another device on the same Wi-Fi:** Open `http://<your-phone-ip>:3000`
  - Find your phone IP: `ip addr show | grep 'inet ' | grep -v 127`

---

### 8.8 Stop & Restart

```bash
# Stop all BERAHOST processes
pkill -f "artifacts/api-server"
pkill -f "npx serve"

# Restart
cd ~/berahost
nohup node --enable-source-maps artifacts/api-server/dist/index.mjs > api.log 2>&1 &
nohup npx serve artifacts/berahost/dist/public -l 3000 > frontend.log 2>&1 &
```

> **Tip:** Install the **Termux:Boot** add-on from F-Droid and place a startup script in `~/.termux/boot/` to auto-start BERAHOST when your phone reboots.

---

## 9. Running on Windows

### 9.1 Install Prerequisites

**Node.js 22**
1. Go to https://nodejs.org and download the **LTS installer** (v22)
2. Run the installer — check "Add to PATH"
3. Open **PowerShell** and verify: `node -v`

**pnpm**
```powershell
npm install -g pnpm
```

**Git**
1. Download from https://git-scm.com/download/win
2. Install with default settings

**PostgreSQL 16**
1. Download from https://www.postgresql.org/download/windows/
2. Run the installer — note the **password** you set for the `postgres` user
3. Keep the default port `5432`
4. Open **pgAdmin** or **SQL Shell (psql)** from the Start Menu

---

### 9.2 Create the Database

Open **SQL Shell (psql)** from the Start Menu, log in as `postgres`, then run:

```sql
CREATE USER berahost WITH PASSWORD 'your_strong_password';
CREATE DATABASE berahost OWNER berahost;
GRANT ALL PRIVILEGES ON DATABASE berahost TO berahost;
\q
```

---

### 9.3 Clone & Install BERAHOST

Open **PowerShell** (or Git Bash):

```powershell
# Clone the repo
git clone https://github.com/bera-tech-ai/berahost.git
cd berahost

# Install dependencies
pnpm install
```

---

### 9.4 Configure Environment Variables

Create a `.env` file in the project root:

```powershell
copy .env.example .env
notepad .env
```

Set these values in the file:

```env
DATABASE_URL=postgresql://berahost:your_strong_password@localhost:5432/berahost
SESSION_SECRET=replace_with_random_string
ADMIN_EMAIL=admin@berahost.com
ADMIN_PASSWORD="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
PORT=8080
NODE_ENV=production
```

To generate a secure `SESSION_SECRET` in PowerShell:

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

---

### 9.5 Run Database Migrations

In PowerShell (from the project folder):

```powershell
# Load env vars from .env
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#][^=]*)=(.*)$') {
    [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}

# Push schema
pnpm --filter @workspace/db run push
```

---

### 9.6 Build the Application

```powershell
# Build API server
pnpm --filter @workspace/api-server run build

# Build frontend (PowerShell syntax for multiple env vars)
$env:PORT="3000"; $env:BASE_PATH="/"; pnpm --filter @workspace/berahost run build
```

---

### 9.7 Run BERAHOST

**Option A — Simple (two PowerShell windows)**

Window 1 — API server:
```powershell
$env:PORT="8080"; $env:NODE_ENV="production"
$env:DATABASE_URL="postgresql://berahost:your_strong_password@localhost:5432/berahost"
$env:SESSION_SECRET="REPLACE_WITH_UNIQUE_SECRET_OUT_OF_BAND"
node --enable-source-maps artifacts/api-server/dist/index.mjs
```

Window 2 — Frontend:
```powershell
npx serve artifacts/berahost/dist/public -l 3000
```

Open `http://localhost:3000` in your browser.

---

**Option B — Run as a background service with PM2 (recommended)**

```powershell
# Install PM2 globally
npm install -g pm2

# Start API server
pm2 start "node --enable-source-maps artifacts/api-server/dist/index.mjs" `
  --name berahost-api `
  --env production

# Start frontend server
pm2 start "npx serve artifacts/berahost/dist/public -l 3000" `
  --name berahost-web

# Save and set PM2 to start on Windows boot
pm2 save
pm2 startup

# View running processes
pm2 list

# View logs
pm2 logs berahost-api
```

---

### 9.8 Windows Firewall (Optional — LAN access)

To access BERAHOST from other devices on your network:

```powershell
# Allow port 3000 through Windows Firewall
netsh advfirewall firewall add rule name="BERAHOST" dir=in action=allow protocol=TCP localport=3000
```

Then open `http://<your-windows-ip>:3000` from any device on your network.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 22, Express 5, Socket.IO |
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Database | PostgreSQL 16, Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| Package manager | pnpm 10 (workspaces monorepo) |
| Reverse proxy | Nginx |
| Containerization | Docker + Docker Compose |

---

## License

MIT — see [LICENSE](LICENSE) for details.
