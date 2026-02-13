# Kanban Board MVP

A self-hosted Kanban board with SQLite persistence, drag-and-drop workflow, and REST API for agent automation.

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📋 Kanban Workflow** | Backlog → To Do → Ongoing → Review → Done |
| **🎨 Modern UI** | Clean, responsive design with Tailwind CSS |
| **🔄 Drag & Drop** | Smooth task movement between columns |
| **🏷️ Priority Levels** | High, Medium, Low with color coding |
| **📅 Due Dates** | Overdue detection and reminders |
| **🤖 Agent API** | REST API for programmatic task management |
| **💾 SQLite Persistence** | Data survives restarts |
| **📱 Mobile Ready** | Works on phones and tablets |

## 🚀 Quick Start

### Docker (Recommended)

```bash
docker-compose up -d
# Open http://localhost:3000
# Default password: kanban123
```

### Node.js

```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Render Deployment

#### Option 1: With Persistent Disk (Recommended)

1. Create a **Web Service** on Render
2. Add a **Persistent Disk** (1GB recommended)
   - Mount path: `/var/data`
3. Configure environment variables:
   - `OWNER_PASSWORD` → your secure password
   - `AGENT_API_KEY` → your agent API key
   - `DB_PATH` → `/var/data/kanban.db`
   - `NODE_ENV` → `production`
4. Build Command: `npm ci`
5. Start Command: `node server.js`

The app will automatically create the database directory if it doesn't exist.

#### Option 2: Ephemeral (Development)

For quick testing without a disk:

1. Create a **Web Service** on Render
2. Environment variables:
   - `OWNER_PASSWORD` → your password
   - `AGENT_API_KEY` → your API key
   - `DB_PATH` → `./kanban.db` (default)
3. **Note:** Data will be lost on each deploy

**Production Disk Setup:**

```bash
# Render Dashboard Configuration:
Disk Name: kanban-data
Mount Path: /var/data
Size: 1 GB
```

## 🔧 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OWNER_PASSWORD` | Yes | - | Web UI password |
| `AGENT_API_KEY` | Yes | - | API key for agent endpoints |
| `DB_PATH` | No | `./kanban.db` | SQLite database path |
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
- **Database:** SQLite3
- **Frontend:** Vanilla JS + Tailwind CSS
- **Deployment:** Docker, Render

## 📄 License

MIT

## 🙏 Credits

Built with [Tailwind CSS](https://tailwindcss.com), [Express.js](https://expressjs.com), and [SQLite](https://www.sqlite.org).
