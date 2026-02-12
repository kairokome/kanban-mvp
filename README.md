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

### Creating Tasks

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
- `x-agent-id: agent-identifier` (optional)
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
