# Kanban Board MVP

A modern, self-hosted Kanban board with SQLite persistence, activity logging, and reminders.

![Kanban Board Screenshot](https://via.placeholder.com/800x400?text=Kanban+Board+MVP)

## ✨ Features

- **📋 Full Kanban Workflow** — 5 columns: Backlog, To Do, Ongoing, Review, Done
- **🎨 Modern UI** — Clean, responsive design with Tailwind CSS
- **🔄 Drag & Drop** — Smooth task movement between columns
- **🏷️ Priority Labels** — High, Medium, Low with color coding
- **📅 Due Dates** — Overdue detection and upcoming reminders
- **👤 Assignees** — Track who owns each task
- **📝 Activity Log** — See all changes made to tasks
- **🔐 Single-User Auth** — Simple password protection
- **💾 Persistent Storage** — SQLite database survives restarts
- **📱 Mobile Friendly** — Works on phones and tablets

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# Start the app
docker-compose up -d

# Open http://localhost:3000
# Default password: kanban123
```

### Option 2: Node.js

```bash
npm install
npm start

# Open http://localhost:3000
```

### Option 3: Deploy to Render (Free)

See [Deployment Guide](#render-deployment) below.

## 🔐 Authentication

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
