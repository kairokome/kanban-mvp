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

// Agent identity extraction
function getAgentIdentity(req) {
    // Try x-agent-id first, fall back to assignee for backward compat
    const agentId = req.headers['x-agent-id'] || req.headers['x-owner-password'] || 'unknown';
    const agentRole = req.headers['x-agent-role'] || 'member';
    return { agentId, agentRole, ip: req.ip || req.connection?.remoteAddress };
}

// Database setup
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error('DB error:', err);
    else console.log('Connected to SQLite:', DB_PATH);
});

// Initialize tables with migrations for new columns
db.serialize(() => {
    // Create tasks table with base columns
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assignee TEXT,
        owner_agent TEXT,
        status TEXT DEFAULT 'Backlog',
        priority TEXT DEFAULT 'Medium',
        due_date TEXT,
        branch TEXT,
        repo TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    // Migrate: add new columns if they don't exist (backward compatible)
    db.run(`ALTER TABLE tasks ADD COLUMN owner_agent TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE tasks ADD COLUMN branch TEXT`, (err) => {
        // Ignore error if column already exists
    });
    db.run(`ALTER TABLE tasks ADD COLUMN repo TEXT`, (err) => {
        // Ignore error if column already exists
    });

    // Activity log with enhanced fields
    db.run(`CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        task_id TEXT,
        task_title TEXT,
        details TEXT,
        agent_id TEXT,
        agent_role TEXT,
        from_status TEXT,
        to_status TEXT,
        branch TEXT,
        repo TEXT,
        transition_allowed INTEGER DEFAULT 1,
        denial_reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Migration: add enhanced columns to existing activity_log
    db.run(`ALTER TABLE activity_log ADD COLUMN agent_id TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN agent_role TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN from_status TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN to_status TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN branch TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN repo TEXT`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN transition_allowed INTEGER DEFAULT 1`, (err) => {});
    db.run(`ALTER TABLE activity_log ADD COLUMN denial_reason TEXT`, (err) => {});

    db.run(`CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        task_title TEXT,
        due_date TEXT,
        notified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);
});

// ============ Safety Gate Configuration ============

// Role definitions
const ROLES = {
    FOUNDER: 'founder',
    AGENT: 'agent',
    MEMBER: 'member'
};

// Status transition rules with safety gates
const TRANSITION_RULES = {
    // Work lock: only assigned agent can move to Ongoing
    'Ongoing': {
        requiresOwnership: true,
        fromStatuses: ['To Do', 'Backlog'],
        allowedRoles: [ROLES.FOUNDER, ROLES.AGENT, ROLES.MEMBER]
    },
    // Review → Done restriction to Founder only
    'Done': {
        requiresFounder: true,
        fromStatuses: ['Review', 'Ongoing'],
        allowedRoles: [ROLES.FOUNDER]
    },
    // Review entry: assigned agent or founder
    'Review': {
        requiresOwnership: true,
        fromStatuses: ['Ongoing'],
        allowedRoles: [ROLES.FOUNDER, ROLES.AGENT, ROLES.MEMBER]
    }
};

// ============ Logging Functions ============

function logActivity(action, taskId, taskTitle, details, agentInfo = {}, transitionInfo = {}) {
    const { agentId, agentRole } = agentInfo;
    const { fromStatus, toStatus, branch, repo, allowed, denialReason } = transitionInfo;

    db.run(
        `INSERT INTO activity_log
         (action, task_id, task_title, details, agent_id, agent_role, from_status, to_status, branch, repo, transition_allowed, denial_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [action, taskId, taskTitle, details, agentId, agentRole, fromStatus, toStatus, branch, repo, allowed ? 1 : 0, denialReason || null],
        (err) => { if (err) console.error('Log error:', err); }
    );
}

function logTransitionAttempt(taskId, taskTitle, fromStatus, toStatus, agentInfo, allowed, denialReason = null, branch = null, repo = null) {
    logActivity('transition', taskId, taskTitle,
        `Status transition: ${fromStatus} → ${toStatus}`,
        agentInfo,
        { fromStatus, toStatus, branch, repo, allowed, denialReason }
    );
}

// ============ Safety Gate Validation ============

function validateTransition(task, newStatus, agentInfo) {
    const { agentId, agentRole } = agentInfo;
    const rule = TRANSITION_RULES[newStatus];

    // If no special rule for this transition, allow it
    if (!rule) {
        return { allowed: true };
    }

    // Check if transition is valid for this status
    if (!rule.fromStatuses.includes(task.status)) {
        return {
            allowed: false,
            reason: `Cannot transition from "${task.status}" to "${newStatus}". Valid from: ${rule.fromStatuses.join(', ')}`
        };
    }

    // Check role restrictions
    const role = (agentRole || '').toLowerCase();
    if (rule.requiresFounder && role !== ROLES.FOUNDER) {
        return {
            allowed: false,
            reason: 'Only Founder can complete this transition'
        };
    }

    // Check ownership requirement (only assigned agent can move to certain statuses)
    if (rule.requiresOwnership) {
        const isOwner = task.owner_agent === agentId || task.assignee === agentId;
        const isFounder = role === ROLES.FOUNDER;
        if (!isOwner && !isFounder) {
            return {
                allowed: false,
                reason: `Only the assigned agent (${task.owner_agent || task.assignee}) can move to "${newStatus}"`
            };
        }
    }

    return { allowed: true };
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
    const { title, description, assignee, priority, status, due_date, owner_agent, branch, repo } = req.body;
    const agentInfo = getAgentIdentity(req);
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

    // Auto-assign owner_agent from agent identity if not provided
    const finalOwnerAgent = owner_agent || agentInfo.agentId;

    db.run(
        'INSERT INTO tasks (id, title, description, assignee, owner_agent, priority, status, due_date, branch, repo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, title, description || '', assignee || '', finalOwnerAgent, priority || 'Medium', status || 'Backlog', due_date || null, branch || null, repo || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity('create', id, title, `Created task "${title}"`, agentInfo);
            res.json({
                id, title, description, assignee, owner_agent: finalOwnerAgent,
                priority, status, due_date, branch, repo
            });
        }
    );
});

// Update task (with safety gates for status transitions)
app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    const { title, description, assignee, priority, status, due_date, owner_agent, branch, repo } = req.body;
    const taskId = req.params.id;
    const agentInfo = getAgentIdentity(req);

    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err || !task) return res.status(404).json({ error: 'Task not found' });

        // Handle status transition validation
        let statusChangeInfo = null;
        if (status !== undefined && status !== task.status) {
            const validation = validateTransition(task, status, agentInfo);
            statusChangeInfo = {
                attemptedStatus: status,
                wasAllowed: validation.allowed,
                denialReason: validation.reason
            };

            if (!validation.allowed) {
                // Log the failed transition attempt
                logTransitionAttempt(
                    taskId, task.title, task.status, status,
                    agentInfo, false, validation.reason,
                    branch || task.branch, repo || task.repo
                );
                return res.status(403).json({
                    error: 'Transition denied',
                    reason: validation.reason,
                    from_status: task.status,
                    to_status: status
                });
            }

            // Log successful transition
            logTransitionAttempt(
                taskId, task.title, task.status, status,
                agentInfo, true, null,
                branch || task.branch, repo || task.repo
            );
        }

        const changes = [];
        if (title !== undefined && title !== task.title) changes.push(`title: "${task.title}" → "${title}"`);
        if (assignee !== undefined && assignee !== (task.assignee || '')) changes.push(`assignee: ${task.assignee || 'none'} → ${assignee || 'none'}`);
        if (owner_agent !== undefined && owner_agent !== (task.owner_agent || '')) changes.push(`owner_agent: ${task.owner_agent || 'none'} → ${owner_agent || 'none'}`);
        if (priority !== undefined && priority !== task.priority) changes.push(`priority: ${task.priority} → ${priority}`);
        if (status !== undefined && status !== task.status) changes.push(`status: ${task.status} → ${status}`);
        if (due_date !== undefined && due_date !== task.due_date) changes.push(`due_date: ${task.due_date || 'none'} → ${due_date || 'none'}`);
        if (branch !== undefined && branch !== task.branch) changes.push(`branch: ${task.branch || 'none'} → ${branch || 'none'}`);
        if (repo !== undefined && repo !== task.repo) changes.push(`repo: ${task.repo || 'none'} → ${repo || 'none'}`);

        db.run(
            `UPDATE tasks SET title = ?, description = ?, assignee = ?, owner_agent = ?,
             priority = ?, status = ?, due_date = ?, branch = ?, repo = ?, updated_at = datetime("now")
             WHERE id = ?`,
            [
                title || task.title, description || task.description,
                owner_agent || task.owner_agent || '',
                assignee || task.assignee || '',
                priority || task.priority, status || task.status,
                due_date || task.due_date, branch || task.branch, repo || task.repo,
                taskId
            ],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });

                // Log the update
                logActivity('update', taskId, task.title, `Updated: ${changes.join(', ')}`, agentInfo, {
                    fromStatus: task.status,
                    toStatus: status || task.status,
                    allowed: true
                });

                res.json({
                    id: taskId,
                    title: title || task.title,
                    description: description || task.description,
                    assignee: assignee || task.assignee,
                    owner_agent: owner_agent || task.owner_agent,
                    priority: priority || task.priority,
                    status: status || task.status,
                    due_date: due_date || task.due_date,
                    branch: branch || task.branch,
                    repo: repo || task.repo
                });
            }
        );
    });
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    const taskId = req.params.id;
    const agentInfo = getAgentIdentity(req);

    db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, task) => {
        if (err || !task) return res.status(404).json({ error: 'Task not found' });

        db.run('DELETE FROM tasks WHERE id = ?', [taskId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity('delete', taskId, task.title, `Deleted task "${task.title}"`, agentInfo);
            res.json({ success: true });
        });
    });
});

// Get activity log (enhanced with agent info)
app.get('/api/activity', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    db.all('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get denied transitions (for monitoring)
app.get('/api/activity/denied', authMiddleware, (req, res) => {
    db.all('SELECT * FROM activity_log WHERE transition_allowed = 0 ORDER BY created_at DESC LIMIT 50', [], (err, rows) => {
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
                db.get('SELECT COUNT(*) as denied FROM activity_log WHERE transition_allowed = 0', (err, denied) => {
                    res.json({
                        total: total?.total || 0,
                        done: done?.done || 0,
                        overdue: overdue?.overdue || 0,
                        denied_transitions: denied?.denied || 0
                    });
                });
            });
        });
    });
});

// Health check
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
    console.log(`🛡️ Agent safety gates: ENABLED`);
});
