# Kanban Board MVP

A modern, self-hosted Kanban board with SQLite persistence, activity logging, and reminders.

## ✨ Features

- **📋 Full Kanban Workflow** — 5 columns: Backlog, To Do, Ongoing, Review, Done
- **🎨 Modern UI** — Clean, responsive design with Tailwind CSS
- **🔄 Drag & Drop** — Smooth task movement between columns
- **🏷️ Priority Labels** — High, Medium, Low with color coding
- **📅 Due Dates** — Overdue detection and upcoming reminders
- **👤 Assignees** — Track who owns each task
- **🔍 My Tasks Filter** — View all tasks or just "My Tasks"
- **📝 Activity Log** — See all changes made to tasks
- **🔐 Single-User Auth** — Simple password protection
- **💾 Persistent Storage** — SQLite database survives restarts
- **📱 Mobile Friendly** — Works on phones and tablets
- **🤖 Agent API** — REST API for programmatic task management

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start the app
docker-compose up -d

# Open http://localhost:3000
# Default password: kanban123
```

### Option 2: Node.js (Local Development)

```bash
# Install dependencies
npm install

# Copy environment file (optional - uses defaults)
cp .env.example .env

# Start development server
npm run dev

# Open http://localhost:3000
```

### Option 3: Deploy to Render (Free)

See [Deployment Guide](#render-deployment) below.

## ✅ Verification Checklist (One-Command Test)

Run these commands to verify the deployment:

```bash
# 1. Install dependencies
npm install

# 2. Copy environment file and set required values
cp .env.example .env

# 3. Start development server
npm run dev &
sleep 3

# 4. Verify Agent API works (returns 200)
curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: agent-secret-key-12345" http://localhost:3000/api/cards

# Expected output: 200

# 5. Verify no auth returns 401
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cards

# Expected output: 401

# 6. Kill the dev server
pkill -f "node server.js"
```

### Expected Startup Output

When running `npm run dev`, you should see:

```
✅ Environment validated
🤖 Agent API: ENABLED
🚀 Kanban MVP running on http://localhost:3000
📁 Database: ./kanban.db
🔐 Owner password: [masked]
🛡️ Agent safety gates: ENABLED
```

### Troubleshooting

| Symptom | Solution |
|---------|----------|
| "Missing required environment variables" | Run `cp .env.example .env` |
| "Invalid or missing API key" (401) | Check `AGENT_API_KEY` in `.env` |
| Server won't start | Check port 3000 is not in use |

### Web UI Authentication

Default password: `kanban123`

**Change the password:**
```bash
OWNER_PASSWORD=your-secure-password npm start
```

Or in Docker:
```yaml
environment:
  - OWNER_PASSWORD=your-secure-password
```

### Agent API Authentication

Agents authenticate using an API key via the `x-api-key` header:

```bash
# Set API key in environment
export AGENT_API_KEY=your-agent-api-key
```

**Example authenticated request:**
```bash
curl -X GET http://localhost:3000/api/cards \
  -H "x-api-key: your-agent-api-key"
```

**Required Headers for Agent Endpoints:**
- `x-api-key` — Your agent API key (required for all agent endpoints)
- `x-agent-id` — Agent identifier (optional, used for task ownership)
- `x-agent-role` — Agent role: `founder`, `agent`, or `member` (optional, defaults to `member`)

## 📁 Data Storage

| Deployment | Location |
|------------|----------|
| Docker | `./data/kanban.db` |
| Node.js local | `./kanban.db` |
| Render | `/app/data/kanban.db` |

**Persistence verified** ✅ — Tasks survive app restarts.

## 🎯 Usage Guide

### Assigning Tasks to Agents

When creating or editing tasks, you can assign them to configured agents via the **Owner Agent** dropdown:

**Available Agents:**
- **Unassigned** — Task has no owner (only Founder can modify)
- **founder** — Project founder with full access
- **manager** — Manager role
- **worker** — Worker/agent role

The Owner Agent dropdown populates from the `/api/agents` endpoint.

1. Click **+ Add Task**
2. Enter title (required)
3. Optionally add description, assignee, priority, and due date
4. Click **Save Task**

### Managing Tasks

- **Drag & Drop** — Move cards between columns
- **Edit** — Click the pencil icon to modify any field
- **Delete** — Click the trash icon to remove a task
- **Priority** — Color-coded badges (🔴 High, 🟡 Medium, 🟢 Low)
- **Due Dates** — Shown on cards; overdue items highlighted red

### Activity Log

Click the 📋 icon in the header to view:
- Task creations
- Status changes
- Field updates
- Deletions

## 📱 Mobile Use

The board is fully responsive:
- Horizontal scrolling on phone
- Touch-friendly drag & drop
- Optimized card layout

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Express.js |
| Database | SQLite3 |
| Frontend | Vanilla JS + Tailwind CSS |
| Deployment | Docker, Render (free tier) |

## 🔧 API Reference

### Web API (Owner Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Get all tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/agents` | Get configured agents (founder, manager, worker) |
| GET | `/api/activity` | Activity log |
| GET | `/api/reminders` | Upcoming tasks |
| GET | `/api/stats` | Task statistics |

**Auth Header:** `x-owner-password: YOUR_PASSWORD`

### Agent API (API Key Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cards?status=` | Get tasks filtered by status |
| POST | `/api/cards` | Create task (default: "Agent Inbox") |
| GET | `/api/cards/:id/comments` | Get comments for a task |
| POST | `/api/cards/:id/comment` | Add comment to task |
| POST | `/api/cards/:id/transition` | Move task with role validation |

**Auth Headers:**
- `x-api-key: YOUR_AGENT_API_KEY` (required)
- `x-agent-id: agent-identifier` (optional, maps to configured agents: founder, manager, worker)
- `x-agent-role: founder|agent|member` (optional, defaults to `member`)

#### Agent API Examples

```bash
# Get all tasks
curl -X GET http://localhost:3000/api/cards \
  -H "x-api-key: your-agent-api-key"

# Get tasks with specific status
curl -X GET "http://localhost:3000/api/cards?status=Ongoing" \
  -H "x-api-key: your-agent-api-key"

# Create a new task
curl -X POST http://localhost:3000/api/cards \
  -H "x-api-key: your-agent-api-key" \
  -H "x-agent-id: agent-1" \
  -H "x-agent-role: agent" \
  -H "Content-Type: application/json" \
  -d '{"title": "Process customer request", "priority": "High"}'

# Add a comment to a task
curl -X POST http://localhost:3000/api/cards/abc123/comment \
  -H "x-api-key: your-agent-api-key" \
  -H "x-agent-id: agent-1" \
  -H "Content-Type: application/json" \
  -d '{"content": "Working on this now"}'

# Transition task to a new status
curl -X POST http://localhost:3000/api/cards/abc123/transition \
  -H "x-api-key: your-agent-api-key" \
  -H "x-agent-id: agent-1" \
  -H "x-agent-role: agent" \
  -H "Content-Type: application/json" \
  -d '{"status": "Ongoing"}'
```

#### Server-Side Rules for Agents

1. **Only Founder can move tasks to Done** — The `Review → Done` transition requires `x-agent-role: founder`
2. **Agents cannot modify unassigned tasks** — Only Founder can modify tasks without an owner
3. **Claim requirement** — Agents must claim unassigned tasks via `/api/tasks/:id/claim` before moving them

## 📊 Executive Summary Poller (Discord Notifications)

The manager poller posts clean executive-level Kanban summaries to Discord. Designed for founders to identify bottlenecks instantly.

### Features

- **Single-message summary** — All key metrics in one embed
- **Counts at a glance** — Total, Inbox, Ongoing, Review, Done Today, Overdue
- **Priority sections** — Manager tasks, Founder review queue, Overdue items
- **Visual alerts** — Red embed when overdue tasks exist
- **Empty state handling** — Gracefully handles zero-task scenarios

### Configuration

Add these variables to your `.env` file:

```bash
# Discord webhook URL (required for poller)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN

# Poll interval in seconds (default: 300 = 5 minutes)
POLL_INTERVAL_SECONDS=300

# Kanban API base URL (default: http://localhost:3000)
KANBAN_BASE_URL=http://localhost:3000

# Manager agent ID (default: manager)
MANAGER_AGENT_ID=manager
```

### Getting a Discord Webhook

1. Open Discord and go to Server Settings → Integrations
2. Click "Create Webhook" or "Manage Webhooks"
3. Copy the webhook URL

### Usage

```bash
# Start continuous polling (every 5 minutes)
npm run poller

# Send a test summary to verify Discord connectivity
npm run poller:test
```

### Executive Summary Format

The summary displays in Discord as:

```
📊 Kanban Executive Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 12 | Inbox: 3 | Ongoing: 5 | Review: 2 | Done Today: 2 | ⚠️ Overdue: 2

🔄 Manager Tasks (Inbox)
🔴 Review Q4 Budget (Feb 11 ⚠️ OVERDUE)
🔴 Approve Vendor Contract (Feb 10 ⚠️ OVERDUE)
🟡 Team Performance Review (Feb 13)

👀 Waiting for Founder (Review)
🔴 Marketing Campaign Proposal (Feb 15)
🟡 Product Roadmap v2.0 (Feb 18)

⚠️ Overdue Tasks
🔴 Q1 Planning Document (Feb 8)
🔴 Compliance Audit Response (Feb 2)
```

**Key indicators:**
- 🔴 High priority | 🟡 Medium priority | 🟢 Low priority
- ⚠️ OVERDUE suffix on past-due tasks
- **Red embed** when overdue tasks exist
- **Green embed** when board is clear
- **Blue embed** (default) for normal operation

### Example Discord Output

```
📊 Kanban Executive Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 8 | Inbox: 2 | Ongoing: 4 | Review: 1 | Done Today: 1 | ⚠️ Overdue: 1

🔄 Manager Tasks (Inbox)
🔴 Q1 Budget Review (Feb 15)
🟡 Weekly Report (Feb 20)

👀 Waiting for Founder (Review)
🔴 Product Strategy v2 (Feb 18)

⚠️ Overdue Tasks
🔴 Compliance Audit (Feb 10)
```

When all clear:
```
📊 Kanban Executive Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 6 | Inbox: 0 | Ongoing: 3 | Review: 0 | Done Today: 3 | Overdue: 0

✅ All Clear
No tasks require attention. Board is up to date.
```

### Docker Deployment

Add poller to your docker-compose.yml:

```yaml
services:
  kanban:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OWNER_PASSWORD=your-password
      - AGENT_API_KEY=agent-secret-key
      - DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
      - POLL_INTERVAL_SECONDS=300
    volumes:
      - ./data:/app/data

  kanban-poller:
    image: node:18-alpine
    working_dir: /app
    command: node poller.js
    environment:
      - DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
      - AGENT_API_KEY=agent-secret-key
      - KANBAN_BASE_URL=http://kanban:3000
      - POLL_INTERVAL_SECONDS=300
      - MANAGER_AGENT_ID=manager
    volumes:
      - ./kanban-mvp/poller.js:/app/poller.js:ro
```

## 🎨 Customization

### Change Colors

Edit `public/index.html` and modify Tailwind classes.

### Add Columns

1. Update `COLUMNS` array in `public/app.js`
2. Add new column in `server.js` if needed

## 📦 Render Deployment

### Step 1: Push to GitHub

```bash
cd kanban-mvp
git remote add origin https://github.com/YOUR_USERNAME/kanban-mvp.git
git push -u origin main
```

### Step 2: Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Build Command:** `npm ci`
   - **Start Command:** `node server.js`
   - **Plan:** Free

### Step 3: Environment Variables

Add in Render dashboard:
- `OWNER_PASSWORD` → your password
- `NODE_ENV` → `production`

### Step 4: Persistent Disk

1. Scroll to **Disks** section
2. Click **Add Disk**
3. Configure:
   - **Name:** `kanban-data`
   - **Mount Path:** `/app/data`
   - **Size:** 1 GB
4. Click **Create**

### Step 5: Deploy

Click **Create Web Service**. After build completes, your Kanban board will be live at:
```
https://kanban-mvp-xxxx.onrender.com
```

## 🔒 Security Notes

- Single-user auth only (no multi-user support)
- Password transmitted in headers (use HTTPS in production)
- No encrypted storage (SQLite is plaintext)

## 📄 License

MIT — Feel free to modify and use.

## 🙏 Credits

Built with:
- [Tailwind CSS](https://tailwindcss.com)
- [Express.js](https://expressjs.com)
- [SQLite](https://www.sqlite.org)

---

## 🤖 Agent CLI Tool

A standalone CLI for agents to interact with Kanban without UI.

### Installation

```bash
# From project directory
npm run link-cli

# Or run directly
node bin/agent-cli.js <command>
```

### Configuration

Set environment variables or use CLI flags:

```bash
export AGENT_ID=manager
export AGENT_ROLE=agent
export AGENT_API_KEY=agent-secret-key-12345
export KANBAN_BASE_URL=http://localhost:3000
```

### Commands

| Command | Description |
|---------|-------------|
| `agent-cli list [--status=<status>]` | List all tasks (filter by status) |
| `agent-cli get <task-id>` | Show task details |
| `agent-cli claim <task-id>` | Claim an unassigned task |
| `agent-cli move <task-id> <status>` | Move task to new status |
| `agent-cli comment <task-id> <message>` | Add comment to task |
| `agent-cli create --title="..."` | Create new task |
| `agent-cli mine` | Show tasks assigned to you |
| `agent-cli help` | Show help |

### Examples

```bash
# List tasks in Agent Inbox
agent-cli list --status="Agent Inbox"

# List tasks in table format
agent-cli list --format=table

# Get task details
agent-cli get abc123

# Claim a task
agent-cli claim abc123

# Move task to Ongoing
agent-cli move abc123 "Ongoing"

# Add comment
agent-cli comment abc123 "Starting work on this"

# Create new task
agent-cli create --title="Fix login bug" --priority=High

# Show my tasks
agent-cli mine --format=table

# Use different agent credentials
agent-cli list --agent-id=worker --agent-role=agent
```

### Global Options

| Flag | Description |
|------|-------------|
| `--status=<status>` | Filter by status |
| `--priority=<priority>` | Task priority (Low, Medium, High) |
| `--owner=<agent-id>` | Task owner |
| `--format=<json\|table>` | Output format |
| `--agent-id=<id>` | Agent ID |
| `--agent-role=<role>` | Agent role |
| `--api-key=<key>` | API key |
| `--base-url=<url>` | Kanban server URL |

### Valid Status Values

- `Agent Inbox` - New tasks awaiting assignment
- `Ongoing` - Tasks actively being worked
- `Review` - Tasks awaiting review
- `Done` - Completed tasks
- `Backlog` - Future tasks
- `To Do` - Planned tasks

### Automation Example

```bash
#!/bin/bash
# Example: Process all tasks in Agent Inbox

# Set agent credentials
export AGENT_ID=worker
export AGENT_ROLE=agent

# Get all tasks in inbox
TASKS=$(agent-cli list --status="Agent Inbox" --format=json)

# Process each task
echo "$TASKS" | jq -r '.[].id' | while read taskId; do
    echo "Claiming $taskId..."
    agent-cli claim "$taskId"
    agent-cli move "$taskId" "Ongoing"
    agent-cli comment "$taskId" "Auto-claimed and started"
done
```

