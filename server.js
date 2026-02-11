const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './kanban.db';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'kanban123';

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Simple auth middleware
const authMiddleware = (req, res, next) => {
    const password = req.headers['x-owner-password'];
    if (password === OWNER_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Database setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB error:', err);
    else console.log('Connected to SQLite:', DB_PATH);
});

// Initialize tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assignee TEXT,
        status TEXT DEFAULT 'Backlog',
        priority TEXT DEFAULT 'Medium',
        due_date TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        task_id TEXT,
        task_title TEXT,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        task_title TEXT,
        due_date TEXT,
        notified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
});

// Activity logger
function logActivity(action, taskId, taskTitle, details) {
    db.run(
        'INSERT INTO activity_log (action, task_id, task_title, details) VALUES (?, ?, ?, ?)',
        [action, taskId, taskTitle, details],
        (err) => { if (err) console.error('Log error:', err); }
    );
}

// ============ API Routes ============

// Get all tasks
app.get('/api/tasks', authMiddleware, (req, res) => {
    db.all('SELECT * FROM tasks ORDER BY created_at DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create task
app.post('/api/tasks', authMiddleware, (req, res) => {
    const { title, description, assignee, priority, status, due_date } = req.body;
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    db.run(
        'INSERT INTO tasks (id, title, description, assignee, priority, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, title, description || '', assignee || '', priority || 'Medium', status || 'Backlog', due_date || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity('create', id, title, `Created task "${title}"`);
            res.json({ id, title, description, assignee, priority, status, due_date });
        }
    );
});

// Update task
app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    const { title, description, assignee, priority, status, due_date } = req.body;
    const taskId = req.params.id;
    
    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err || !task) return res.status(404).json({ error: 'Task not found' });
        
        const changes = [];
        if (title !== undefined && title !== task.title) changes.push(`title: "${task.title}" → "${title}"`);
        if (assignee !== undefined && assignee !== (task.assignee || '')) changes.push(`assignee: ${task.assignee || 'none'} → ${assignee || 'none'}`);
        if (priority !== undefined && priority !== task.priority) changes.push(`priority: ${task.priority} → ${priority}`);
        if (status !== undefined && status !== task.status) changes.push(`status: ${task.status} → ${status}`);
        if (due_date !== undefined && due_date !== task.due_date) changes.push(`due_date: ${task.due_date || 'none'} → ${due_date || 'none'}`);
        
        db.run(
            'UPDATE tasks SET title = ?, description = ?, assignee = ?, priority = ?, status = ?, due_date = ?, updated_at = datetime("now") WHERE id = ?',
            [title || task.title, description || task.description, assignee || task.assignee || '', priority || task.priority, status || task.status, due_date || task.due_date, taskId],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                logActivity('update', taskId, task.title, `Updated: ${changes.join(', ')}`);
                res.json({ id: taskId, title, description, assignee, priority, status, due_date });
            }
        );
    });
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    const taskId = req.params.id;
    
    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err || !task) return res.status(404).json({ error: 'Task not found' });
        
        db.run('DELETE FROM tasks WHERE id = ?', [taskId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity('delete', taskId, task.title, `Deleted task "${task.title}"`);
            res.json({ success: true });
        });
    });
});

// Get activity log
app.get('/api/activity', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    db.all('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get reminders (upcoming due dates)
app.get('/api/reminders', authMiddleware, (req, res) => {
    db.all('SELECT * FROM tasks WHERE due_date IS NOT NULL AND status != "Done" ORDER BY due_date ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get stats
app.get('/api/stats', authMiddleware, (req, res) => {
    db.get('SELECT COUNT(*) as total FROM tasks', (err, total) => {
        db.get('SELECT COUNT(*) as done FROM tasks WHERE status = "Done"', (err, done) => {
            db.get('SELECT COUNT(*) as overdue FROM tasks WHERE due_date < date("now") AND status != "Done"', (err, overdue) => {
                res.json({
                    total: total?.total || 0,
                    done: done?.done || 0,
                    overdue: overdue?.overdue || 0
                });
            });
        });
    });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Health check (no auth required)
app.get('/health', (req, res) => res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
}));

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Kanban MVP running on http://localhost:${PORT}`);
    console.log(`📁 Database: ${DB_PATH}`);
    console.log(`🔐 Owner password: ${OWNER_PASSWORD}`);
});
