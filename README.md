# Kanban MVP

A self-hosted Kanban board with SQLite persistence, activity logging, and reminders.

## Features

- ✅ 5 Kanban columns (Backlog, To Do, Ongoing, Review, Done)
- ✅ CRUD operations for tasks
- ✅ Drag and drop between columns
- ✅ Priority badges (High/Medium/Low)
- ✅ Due dates with overdue detection
- ✅ Activity log (tracks all changes)
- ✅ In-app reminders (upcoming due dates)
- ✅ Single-user authentication (owner password)
- ✅ SQLite database persistence
- ✅ Docker support

## Quick Start

### Option 1: Docker Compose (Recommended for Local)

```bash
# Clone or navigate to the project
cd kanban-mvp

# Start the app
docker-compose up -d

# Open http://localhost:3000
# Default password: kanban123
```

### Option 2: Node.js (Local Development)

```bash
cd kanban-mvp
npm install
npm start

# Open http://localhost:3000
# Default password: kanban123
```

### Option 3: Deploy to Render (Free Tier)

1. **Push to GitHub**
   ```bash
   cd kanban-mvp
   git init
   git add .
   git commit -m "Initial Kanban MVP"
   git remote add origin https://github.com/YOUR_USERNAME/kanban-mvp.git
   git push -u origin main
   ```

2. **Deploy to Render**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - Configure:
     - Build Command: `npm ci`
     - Start Command: `node server.js`
     - Plan: Free
   - Add Environment Variables:
     - `OWNER_PASSWORD`: your-password (change from default!)
     - `NODE_ENV`: `production`
   - Add Disk:
     - Name: `kanban-data`
     - Mount Path: `/app/data`
     - Size: 1 GB
   - Click "Create Web Service"

3. **Your Kanban URL**: `https://kanban-mvp-xxxx.onrender.com`

## Data Storage

| Deployment | Location |
|------------|----------|
| Local (Docker) | `./data/kanban.db` |
| Local (Node.js) | `./kanban.db` |
| Render | `/app/data/kanban.db` (persistent disk) |

**Persistence verified**: Tasks survive app restarts and deploys.

## Default Credentials

- **Owner Password**: `kanban123` ⚠️ **Change this in production!**

### Changing the Password

**Docker Compose:**
```yaml
environment:
  - OWNER_PASSWORD=your-secure-password
```

**Render:**
- Environment Variables → OWNER_PASSWORD → your-secure-password

**Node.js:**
```bash
OWNER_PASSWORD=your-secure-password npm start
```

## API Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| GET | `/api/tasks` | Yes | Get all tasks |
| POST | `/api/tasks` | Yes | Create task |
| PUT | `/api/tasks/:id` | Yes | Update task |
| DELETE | `/api/tasks/:id` | Yes | Delete task |
| GET | `/api/activity` | Yes | Get activity log |
| GET | `/api/reminders` | Yes | Get upcoming tasks |
| GET | `/api/stats` | Yes | Get task statistics |
| GET | `/health` | No | Health check |

**Auth Header**: `x-owner-password: YOUR_PASSWORD`

## Demo Checklist

After deployment, verify these features:

- [ ] Login screen appears with password prompt
- [ ] Can create a new task (click "+ Add Task")
- [ ] Task appears in "Backlog" column
- [ ] Can drag task to "To Do" column
- [ ] Priority badge displays correctly (High/Medium/Low)
- [ ] Can edit task (click "Edit" button)
- [ ] Can delete task (click "Delete" button)
- [ ] Due date appears on task card
- [ ] Overdue tasks show red highlight
- [ ] Activity Log shows all changes
- [ ] Stats show correct counts (total, done, overdue)
- [ ] Page refresh preserves all data
- [ ] Restart app → data persists

## Limitations

- Single-user only (owner password, no multiple accounts)
- No task comments or attachments
- No subtasks
- No search/filter (use browser find)
- No export/import
- No email notifications (in-app only)
- Free tier has limits (Render: 750 hours/month, 15GB bandwidth)

## Tech Stack

- **Backend**: Express.js, SQLite3
- **Frontend**: Vanilla HTML/CSS/JS
- **Deployment**: Docker, Render (free tier)

## License

MIT
