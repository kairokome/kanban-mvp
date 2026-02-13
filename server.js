// Load environment variables FIRST - before any other code
require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const pkg = require('./package.json');
const { Client } = require('pg');

// ============ Environment Validation ============
const REQUIRED_ENV_VARS = ['AGENT_API_KEY', 'OWNER_PASSWORD'];
const missingVars = [];

for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
        missingVars.push(varName);
    }
}

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error('Please copy .env.example to .env and fill in the values.');
    process.exit(1);
}

console.log('✅ Environment validated');
console.log('🤖 Agent API: ENABLED');

// ============ Database Layer Abstraction ============
const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || './kanban.db';

let db;
let isPostgres = false;

// PostgreSQL client wrapper for sqlite-like API
class PostgresWrapper {
    constructor(client) {
        this.client = client;
    }

    async get(sql, params = []) {
        const result = await this.client.query(sql, params);
        return result.rows[0] || null;
    }

    async all(sql, params = []) {
        const result = await this.client.query(sql, params);
        return result.rows;
    }

    async run(sql, params = []) {
        const result = await this.client.query(sql, params);
        return { lastID: result.rowCount, changes: result.rowCount };
    }

    serialize(callback) {
        callback();
    }

    async close() {
        await this.client.end();
    }
}

// Initialize database connection
async function initDatabase() {
    if (DATABASE_URL) {
        console.log('📦 Using PostgreSQL (DATABASE_URL set)');
        const client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        console.log('✅ Connected to PostgreSQL');
        db = new PostgresWrapper(client);
        isPostgres = true;
        
        // Run migrations
        await runMigrations();
    } else {
        console.log(`📦 Using SQLite (${DB_PATH})`);
        const dbPathDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbPathDir)) {
            fs.mkdirSync(dbPathDir, { recursive: true });
            console.log(`📁 Created database directory: ${dbPathDir}`);
        }
        
        db = await new Promise((resolve, reject) => {
            const sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
                if (err) {
                    console.error(`❌ Failed to open database: ${err.message}`);
                    process.exit(1);
                }
                console.log('✅ Connected to SQLite database');
                resolve(sqliteDb);
            });
        });
        
        // Run SQLite migrations synchronously
        runSqliteMigrations();
    }
}

// PostgreSQL migrations
async function runMigrations() {
    const migrations = [
        `CREATE TABLE IF NOT EXISTS tasks (
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY,
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
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS reminders (
            id SERIAL PRIMARY KEY,
            task_id TEXT NOT NULL,
            task_title TEXT,
            due_date TEXT,
            notified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            task_id TEXT NOT NULL,
            content TEXT NOT NULL,
            agent_id TEXT,
            agent_role TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    
    for (const sql of migrations) {
        await db.run(sql);
    }
    console.log('✅ Database migrations complete');
}

// SQLite migrations (synchronous)
function runSqliteMigrations() {
    db.serialize(() => {
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

        db.run(`ALTER TABLE tasks ADD COLUMN owner_agent TEXT`, () => {});
        db.run(`ALTER TABLE tasks ADD COLUMN branch TEXT`, () => {});
        db.run(`ALTER TABLE tasks ADD COLUMN repo TEXT`, () => {});

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

        db.run(`ALTER TABLE activity_log ADD COLUMN agent_id TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN agent_role TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN from_status TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN to_status TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN branch TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN repo TEXT`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN transition_allowed INTEGER DEFAULT 1`, () => {});
        db.run(`ALTER TABLE activity_log ADD COLUMN denial_reason TEXT`, () => {});

        db.run(`CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            task_title TEXT,
            due_date TEXT,
            notified INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id TEXT NOT NULL,
            content TEXT NOT NULL,
            agent_id TEXT,
            agent_role TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )`);
        
        console.log('✅ Database migrations complete');
    });
}

// ============ Helper Functions ============

// Helper to get timestamp for current database type
function now() {
    return isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";
}

// Helper for async logging
function logActivity(action, taskId, taskTitle, details, agentInfo = {}, transitionInfo = {}) {
    const { agentId, agentRole } = agentInfo;
    const { fromStatus, toStatus, branch, repo, allowed, denialReason } = transitionInfo;
    
    const sql = `INSERT INTO activity_log
     (action, task_id, task_title, details, agent_id, agent_role, from_status, to_status, branch, repo, transition_allowed, denial_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;
    
    db.run(sql, [
        action, taskId, taskTitle, details, agentId, agentRole, 
        fromStatus, toStatus, branch, repo, allowed ? 1 : 0, denialReason || null
    ]).catch(err => console.error('Log error:', err));
}

function logTransitionAttempt(taskId, taskTitle, fromStatus, toStatus, agentInfo, allowed, denialReason = null, branch = null, repo = null) {
    logActivity('transition', taskId, taskTitle,
        `Status transition: ${fromStatus} → ${toStatus}`,
        agentInfo,
        { fromStatus, toStatus, branch, repo, allowed, denialReason }
    );
}

// ============ App Setup ============
const app = express();
const PORT = process.env.PORT || 3000;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;

// Debug: Log that OWNER_PASSWORD is defined (not the value)
console.log('🔐 Owner password:', OWNER_PASSWORD ? 'DEFINED (length: ' + OWNER_PASSWORD.length + ')' : 'NOT DEFINED');

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

// Agent API key authentication middleware
const agentAuthMiddleware = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey && apiKey === process.env.AGENT_API_KEY) {
        next();
    } else {
        res.status(401).json({ error: 'Invalid or missing API key' });
    }
};

// Agent identity extraction
function getAgentIdentity(req) {
    const password = req.headers['x-owner-password'];
    const apiKey = req.headers['x-api-key'];
    
    // If using owner password, treat as Founder
    if (password && password === OWNER_PASSWORD) {
        return { agentId: 'owner', agentRole: 'founder', ip: req.ip || req.connection?.remoteAddress };
    }
    
    // Otherwise extract from headers
    const agentId = req.headers['x-agent-id'] || req.headers['x-owner-password'] || 'unknown';
    const agentRole = req.headers['x-agent-role'] || 'member';
    return { agentId, agentRole, ip: req.ip || req.connection?.remoteAddress };
}

// ============ Safety Gate Configuration ============

// Role definitions
const ROLES = {
    FOUNDER: 'founder',
    AGENT: 'agent',
    MEMBER: 'member'
};

// ============ Unassigned Task Safety ============

// Check if task is unassigned (null or empty string)
function isUnassigned(task) {
    return !task.owner_agent || task.owner_agent === '' || task.owner_agent === null;
}

// Validate action on unassigned task
function validateUnassignedAction(task, agentInfo, action) {
    const { agentId, agentRole } = agentInfo;
    const role = (agentRole || '').toLowerCase();
    
    // Unassigned tasks can only be modified by Founder
    if (isUnassigned(task)) {
        if (role !== ROLES.FOUNDER) {
            return {
                allowed: false,
                reason: `Cannot ${action} unassigned task. Only Founder can modify unassigned tasks.`
            };
        }
    }
    
    return { allowed: true };
}

// Validate claim action
function validateClaimAction(task, agentInfo) {
    const { agentId, agentRole } = agentInfo;
    const role = (agentRole || '').toLowerCase();
    
    // Only agents can claim tasks
    if (role !== ROLES.FOUNDER && role !== ROLES.AGENT) {
        return {
            allowed: false,
            reason: 'Only Founder or Agents can claim tasks'
        };
    }
    
    // Cannot claim if already assigned to someone
    if (!isUnassigned(task)) {
        return {
            allowed: false,
            reason: `Task is already assigned to ${task.owner_agent}`
        };
    }
    
    return { allowed: true };
}

// Status transition rules with safety gates
const TRANSITION_RULES = {
    // Work lock: only assigned agent can move to Ongoing
    'Ongoing': {
        requiresOwnership: true,
        fromStatuses: ['To Do', 'Backlog', 'Agent Inbox'],
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

// ============ Safety Gate Validation ============

function validateTransition(task, newStatus, agentInfo) {
    const { agentId, agentRole } = agentInfo;
    const role = (agentRole || '').toLowerCase();
    
    // ============ Unassigned Task Safety ============
    // Only Founder can move/change status of unassigned tasks
    const unassignedCheck = validateUnassignedAction(task, agentInfo, 'move or change status');
    if (!unassignedCheck.allowed) {
        return unassignedCheck;
    }
    // ===============================================
    
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
    const actorRole = (agentRole || '').toLowerCase();
    if (rule.requiresFounder && actorRole !== ROLES.FOUNDER) {
        return {
            allowed: false,
            reason: 'Only Founder can complete this transition'
        };
    }

    // Check ownership requirement (only assigned agent can move to certain statuses)
    if (rule.requiresOwnership) {
        const isOwner = task.owner_agent === agentId || task.assignee === agentId;
        const isFounder = actorRole === ROLES.FOUNDER;
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

// Get configured agents (v2 - renamed for clarity)
app.get('/api/agents', authMiddleware, (req, res) => {
    const agents = [
        'founder',
        'manager',
        'worker'
    ];
    res.json({ agents });
});

// Get server version from package.json
app.get('/api/version', (req, res) => {
    res.json({ version: pkg.version });
});

// ============ Agent API Endpoints (Phase 1) ============

// GET /api/cards?status= - Get tasks filtered by status (Agent API)
app.get('/api/cards', agentAuthMiddleware, async (req, res) => {
    try {
        const status = req.query.status;
        let sql = 'SELECT * FROM tasks';
        const params = [];

        if (status) {
            sql += ' WHERE status = $1';
            params.push(status);
        }

        sql += ' ORDER BY created_at DESC';

        const rows = await db.all(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/cards - Create task with default list = "Agent Inbox" (Agent API)
app.post('/api/cards', agentAuthMiddleware, async (req, res) => {
    try {
        const { title, description, assignee, priority, status, due_date, branch, repo } = req.body;
        const agentInfo = getAgentIdentity(req);
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

        // Default to "Agent Inbox" if no status provided
        const finalStatus = status || 'Agent Inbox';
        const finalOwnerAgent = agentInfo.agentId;

        await db.run(
            'INSERT INTO tasks (id, title, description, assignee, owner_agent, priority, status, due_date, branch, repo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [id, title, description || '', assignee || '', finalOwnerAgent, priority || 'Medium', finalStatus, due_date || null, branch || null, repo || null]
        );
        
        logActivity('create', id, title, `Created task "${title}" via Agent API`, agentInfo);
        res.status(201).json({
            id, title, description, assignee,
            owner_agent: finalOwnerAgent, priority, status: finalStatus,
            due_date, branch, repo, message: 'Task created successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/cards/:id/comment - Add comment to task (Agent API)
app.post('/api/cards/:id/comment', agentAuthMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { content } = req.body;
        const agentInfo = getAgentIdentity(req);

        if (!content) {
            return res.status(400).json({ error: 'Comment content is required' });
        }

        // Verify task exists
        const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        await db.run(
            'INSERT INTO comments (task_id, content, agent_id, agent_role) VALUES ($1, $2, $3, $4)',
            [taskId, content, agentInfo.agentId, agentInfo.agentRole]
        );
        
        logActivity('comment', taskId, task.title, `Comment added by ${agentInfo.agentId}: "${content.substring(0, 50)}..."`, agentInfo);
        res.status(201).json({
            id: taskId, // SQLite uses lastID, Postgres uses serial
            task_id: taskId,
            content,
            agent_id: agentInfo.agentId,
            agent_role: agentInfo.agentRole,
            message: 'Comment added successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/cards/:id/claim - Atomic claim task (first-claim-wins)
app.post('/api/cards/:id/claim', agentAuthMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const agentInfo = getAgentIdentity(req);

        // Start transaction
        if (isPostgres) {
            await db.client.query('BEGIN');
        }

        try {
            const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
            if (!task) {
                if (isPostgres) await db.client.query('ROLLBACK');
                return res.status(404).json({ error: 'Task not found' });
            }

            // Validate claim action
            const claimValidation = validateClaimAction(task, agentInfo);
            if (!claimValidation.allowed) {
                if (isPostgres) await db.client.query('ROLLBACK');
                logActivity('claim_denied', taskId, task.title,
                    `Claim attempt by ${agentInfo.agentId} denied: ${claimValidation.reason}`,
                    agentInfo);
                return res.status(409).json({
                    error: 'Claim denied',
                    reason: claimValidation.reason,
                    current_owner: task.owner_agent
                });
            }

            // Perform the claim
            await db.run(
                'UPDATE tasks SET owner_agent = $1, updated_at = ' + now() + ' WHERE id = $2',
                [agentInfo.agentId, taskId]
            );

            if (isPostgres) {
                await db.client.query('COMMIT');
            }

            logActivity('claim', taskId, task.title,
                `Task claimed by ${agentInfo.agentId}`,
                agentInfo);

            res.json({
                id: taskId,
                owner_agent: agentInfo.agentId,
                status: task.status,
                message: 'Task claimed successfully'
            });
        } catch (err) {
            if (isPostgres) await db.client.query('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/cards/:id/transition - Atomic status transition (Agent API)
app.post('/api/cards/:id/transition', agentAuthMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const { status: newStatus } = req.body;
        const agentInfo = getAgentIdentity(req);

        if (!newStatus) {
            return res.status(400).json({ error: 'New status is required' });
        }

        // Start transaction
        if (isPostgres) {
            await db.client.query('BEGIN');
        }

        try {
            const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
            if (!task) {
                if (isPostgres) await db.client.query('ROLLBACK');
                return res.status(404).json({ error: 'Task not found' });
            }

            // Validate transition with safety gates
            const validation = validateTransition(task, newStatus, agentInfo);

            if (!validation.allowed) {
                if (isPostgres) await db.client.query('ROLLBACK');
                logTransitionAttempt(
                    taskId, task.title, task.status, newStatus,
                    agentInfo, false, validation.reason,
                    task.branch, task.repo
                );
                return res.status(403).json({
                    error: 'Transition denied',
                    reason: validation.reason,
                    from_status: task.status,
                    to_status: newStatus
                });
            }

            // Perform the transition
            await db.run(
                'UPDATE tasks SET status = $1, updated_at = ' + now() + ' WHERE id = $2',
                [newStatus, taskId]
            );

            if (isPostgres) {
                await db.client.query('COMMIT');
            }

            // Log successful transition
            logTransitionAttempt(
                taskId, task.title, task.status, newStatus,
                agentInfo, true, null,
                task.branch, task.repo
            );

            res.json({
                id: taskId,
                from_status: task.status,
                to_status: newStatus,
                message: 'Task transitioned successfully'
            });
        } catch (err) {
            if (isPostgres) await db.client.query('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/cards/:id/comments - Get comments for a task (Agent API helper)
app.get('/api/cards/:id/comments', agentAuthMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const rows = await db.all('SELECT * FROM comments WHERE task_id = $1 ORDER BY created_at ASC', [taskId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ End Agent API Endpoints ============

// Get all tasks
app.get('/api/tasks', authMiddleware, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM tasks ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create task
app.post('/api/tasks', authMiddleware, async (req, res) => {
    try {
        const { title, description, assignee, priority, status, due_date, owner_agent, branch, repo } = req.body;
        const agentInfo = getAgentIdentity(req);
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);

        // Auto-assign owner_agent from agent identity if not provided
        const finalOwnerAgent = owner_agent || agentInfo.agentId;

        await db.run(
            'INSERT INTO tasks (id, title, description, assignee, owner_agent, priority, status, due_date, branch, repo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [id, title, description || '', assignee || '', finalOwnerAgent, priority || 'Medium', status || 'Backlog', due_date || null, branch || null, repo || null]
        );
        
        logActivity('create', id, title, `Created task "${title}"`, agentInfo);
        res.json({
            id, title, description, assignee, owner_agent: finalOwnerAgent,
            priority, status, due_date, branch, repo
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============ Claim Task ============
// Agent can claim an unassigned task
app.post('/api/tasks/:id/claim', authMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const agentInfo = getAgentIdentity(req);

        const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Validate claim action
        const claimValidation = validateClaimAction(task, agentInfo);
        if (!claimValidation.allowed) {
            logActivity('claim_denied', taskId, task.title, 
                `Claim attempt by ${agentInfo.agentId} denied: ${claimValidation.reason}`, 
                agentInfo);
            return res.status(403).json({ error: 'Claim denied', reason: claimValidation.reason });
        }

        // Perform the claim
        await db.run(
            'UPDATE tasks SET owner_agent = $1, updated_at = ' + now() + ' WHERE id = $2',
            [agentInfo.agentId, taskId]
        );

        logActivity('claim', taskId, task.title, 
            `Task claimed by ${agentInfo.agentId}`, 
            agentInfo);

        res.json({
            id: taskId,
            owner_agent: agentInfo.agentId,
            message: 'Task claimed successfully'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update task (with safety gates for status transitions)
app.put('/api/tasks/:id', authMiddleware, async (req, res) => {
    try {
        const { title, description, assignee, priority, status, due_date, owner_agent, branch, repo } = req.body;
        const taskId = req.params.id;
        const agentInfo = getAgentIdentity(req);

        const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // ============ Unassigned Task Safety ============
        // Validate owner_agent changes on unassigned tasks
        if (owner_agent !== undefined && owner_agent !== task.owner_agent) {
            const role = (agentInfo.agentRole || '').toLowerCase();
            if (isUnassigned(task) && role !== ROLES.FOUNDER && role !== ROLES.AGENT) {
                return res.status(403).json({
                    error: 'Assignment denied',
                    reason: 'Only Founder or Agents can assign unassigned tasks'
                });
            }
        }
        // ===============================================

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

        await db.run(
            `UPDATE tasks SET title = $1, description = $2, owner_agent = $3, assignee = $4,
             priority = $5, status = $6, due_date = $7, branch = $8, repo = $9, updated_at = ` + now() + `
             WHERE id = $10`,
            [
                title || task.title, description || task.description,
                owner_agent || task.owner_agent || '',
                assignee || task.assignee || '',
                priority || task.priority, status || task.status,
                due_date || task.due_date, branch || task.branch, repo || task.repo,
                taskId
            ]
        );

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
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete task
app.delete('/api/tasks/:id', authMiddleware, async (req, res) => {
    try {
        const taskId = req.params.id;
        const agentInfo = getAgentIdentity(req);

        const task = await db.get('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        await db.run('DELETE FROM tasks WHERE id = $1', [taskId]);
        logActivity('delete', taskId, task.title, `Deleted task "${task.title}"`, agentInfo);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get activity log (enhanced with agent info)
app.get('/api/activity', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const rows = await db.all('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1', [limit]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get denied transitions (for monitoring)
app.get('/api/activity/denied', authMiddleware, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM activity_log WHERE transition_allowed = 0 ORDER BY created_at DESC LIMIT 50');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get reminders (upcoming due dates)
app.get('/api/reminders', authMiddleware, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM tasks WHERE due_date IS NOT NULL AND status != $1 ORDER BY due_date ASC', ['Done']);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get stats
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        const total = await db.get('SELECT COUNT(*) as total FROM tasks');
        const done = await db.get('SELECT COUNT(*) as done FROM tasks WHERE status = $1', ['Done']);
        const overdue = await db.get('SELECT COUNT(*) as overdue FROM tasks WHERE due_date < date($1) AND status != $2', ['now', 'Done']);
        const denied = await db.get('SELECT COUNT(*) as denied FROM activity_log WHERE transition_allowed = 0');
        
        res.json({
            total: total?.total || 0,
            done: done?.done || 0,
            overdue: overdue?.overdue || 0,
            denied_transitions: denied?.denied || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health check
app.get('/health', (req, res) => res.json({
    status: 'ok',
    database: isPostgres ? 'postgresql' : 'sqlite',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
}));

// Auth debug endpoint (for troubleshooting - safe to expose)
app.get('/auth-debug', (req, res) => {
    const headerPw = req.headers['x-owner-password'];
    res.json({
        headerProvided: !!headerPw,
        headerLength: headerPw ? headerPw.length : 0,
        envDefined: !!OWNER_PASSWORD,
        envLength: OWNER_PASSWORD ? OWNER_PASSWORD.length : 0,
        match: headerPw === OWNER_PASSWORD
    });
});

// ============ Start Server ============
async function startServer() {
    await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`🚀 Kanban MVP running on http://localhost:${PORT}`);
        console.log(`📦 Database: ${isPostgres ? 'PostgreSQL' : 'SQLite (' + DB_PATH + ')'}`);
        console.log(`🔐 Owner password: ${OWNER_PASSWORD}`);
        console.log(`🛡️ Agent safety gates: ENABLED`);
    });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📴 Shutting down gracefully...');
    if (db) {
        await db.close();
    }
    process.exit(0);
});

startServer().catch(err => {
    console.error('💥 Failed to start server:', err);
    process.exit(1);
});
