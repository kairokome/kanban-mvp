# Kanban Board MVP

A self-hosted Kanban board with PostgreSQL/SQLite persistence, drag-and-drop workflow, and REST API for agent automation.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Kanban Workflow** | Backlog → To Do → Ongoing → Review → Done |
| **🎨 Modern UI** | Clean, responsive design with Tailwind CSS |
| **🔄 Drag & Drop** | Smooth task movement between columns |
| **🏷️ Priority Levels** | High, Medium, Low with color coding |
| **📅 Due Dates** | Overdue detection and reminders |
| **🤖 Agent API** | REST API for programmatic task management |
| **💾 Database Options** | PostgreSQL (recommended) or SQLite fallback |
| **📱 Mobile Ready** | Works on phones and tablets |

## 🚀 Quick Start

### Docker with PostgreSQL (Recommended)

```bash
docker-compose up -d
# Open http://localhost:3000
# Default password: kanban123
```

### Docker with SQLite (Development)

```bash
# No DATABASE_URL = uses SQLite by default
docker-compose -f docker-compose.sqlite.yml up -d
```

### Node.js (SQLite - Default)

```bash
npm install
npm run migrate
npm run dev
# Open http://localhost:3000
```

### Node.js with PostgreSQL

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/kanban"
npm install
npm run migrate:pg
npm run dev
```

## 🐘 PostgreSQL Setup

### Local PostgreSQL

```bash
# Using Docker
docker run --name kanban-postgres \
  -e POSTGRES_USER=kanban \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=kanban \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  -d postgres:15-alpine

# Set environment variable
export DATABASE_URL="postgresql://kanban:secret@localhost:5432/kanban"

# Run migrations
npm run migrate:pg

# Start the app
npm run dev
```

### Render Deployment with Managed PostgreSQL

1. Create a **Web Service** on Render
2. Create a **PostgreSQL** database in Render dashboard
3. Add environment variables:
   - `DATABASE_URL` → from Render PostgreSQL connection string
   - `OWNER_PASSWORD` → your secure password
   - `AGENT_API_KEY` → your agent API key
   - `NODE_ENV` → `production`
4. Build Command: `npm ci`
5. Start Command: `node server.js`

The `DATABASE_URL` takes precedence over SQLite. When set, the app automatically uses PostgreSQL.

### Render with External PostgreSQL

For external PostgreSQL providers (Supabase, Neon, Railway, etc.):

```
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

## 🗃️ SQLite Fallback

If `DATABASE_URL` is not set, the app automatically falls back to SQLite.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PATH` | No | `./kanban.db` | SQLite database path |

```bash
# Custom SQLite path
export DB_PATH=/var/data/kanban.db
npm run dev
```

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | No | - | PostgreSQL connection string (uses PostgreSQL if set) |
| `DB_PATH` | No | `./kanban.db` | SQLite database path (fallback when DATABASE_URL not set) |
| `OWNER_PASSWORD` | Yes | - | Web UI password |
| `AGENT_API_KEY` | Yes | - | API key for agent endpoints |
| `PORT` | No | `3000` | Server port |

## 🌐 API Reference

### Owner API (Web UI)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |

**Auth:** `x-owner-password: YOUR_PASSWORD`

### Agent API (Automation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cards` | List cards (filter by `?status=`) |
| POST | `/api/cards` | Create card |
| POST | `/api/cards/:id/claim` | Atomic claim (first wins) |
| POST | `/api/cards/:id/transition` | Move card with rules |
| POST | `/api/cards/:id/comment` | Add comment |

**Auth:** `x-api-key: YOUR_API_KEY`

### Workflow Rules

```
Backlog → To Do → Ongoing → Review → Done
                 ↑
            Only Founder can transition Review → Done
```

### Example Requests

```bash
# List tasks
curl http://localhost:3000/api/cards \
  -H "x-api-key: your-api-key"

# Create task
curl -X POST http://localhost:3000/api/cards \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"title": "New feature", "priority": "High"}'

# Claim task (atomic)
curl -X POST http://localhost:3000/api/cards/:id/claim \
  -H "x-api-key: your-api-key"

# Transition status
curl -X POST http://localhost:3000/api/cards/:id/transition \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"status": "Ongoing"}'
```

## 🛠️ Migration

### Run Migrations

```bash
# SQLite (default)
npm run migrate

# PostgreSQL
npm run migrate:pg
```

### Migrate from SQLite to PostgreSQL

1. Set up PostgreSQL database
2. Set `DATABASE_URL` environment variable
3. Run migrations: `npm run migrate:pg`
4. (Optional) Manually transfer data if needed

## 🤖 Agent CLI

```bash
# Install CLI
npm run link-cli

# List tasks
agent-cli list --status="To Do"

# Claim and move
agent-cli claim <task-id>
agent-cli move <task-id> "Ongoing"
agent-cli comment <task-id> "Working on this"
```

## 📊 Discord Notifications (Optional)

Configure Discord webhooks for executive summaries:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
POLL_INTERVAL_SECONDS=300
npm run poller
```

## 🛠️ Tech Stack

- **Backend:** Express.js
- **Database:** PostgreSQL (default) or SQLite (fallback)
- **Frontend:** Vanilla JS + Tailwind CSS
- **Deployment:** Docker, Render

## 📄 License

MIT

## 🙏 Credits

Built with [Tailwind CSS](https://tailwindcss.com), [Express.js](https://expressjs.com), and [PostgreSQL](https://www.postgresql.org).
