#!/usr/bin/env node
/**
 * Migration script for kanban-mvp
 * Creates tables in PostgreSQL or SQLite depending on DATABASE_URL
 */

const { Client } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
const DB_PATH = process.env.DB_PATH || './kanban.db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
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
);

CREATE TABLE IF NOT EXISTS activity_log (
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
);

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    task_title TEXT,
    due_date TEXT,
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    content TEXT NOT NULL,
    agent_id TEXT,
    agent_role TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
`;

async function migratePostgres() {
    console.log('🔄 Connecting to PostgreSQL...');
    const client = new Client({ connectionString: DATABASE_URL });
    
    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // Execute schema
        // Note: PostgreSQL uses CURRENT_TIMESTAMP instead of datetime('now')
        const schemaPg = SCHEMA.replace(/datetime\('now'\)/g, "CURRENT_TIMESTAMP");
        
        // Split and execute each statement
        const statements = schemaPg.split(';').filter(s => s.trim());
        
        for (const stmt of statements) {
            if (stmt.trim()) {
                await client.query(stmt);
            }
        }
        
        console.log('✅ PostgreSQL schema created successfully');
        await client.end();
        return true;
    } catch (err) {
        console.error('❌ PostgreSQL migration failed:', err.message);
        await client.end();
        throw err;
    }
}

function migrateSqlite() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Using SQLite fallback...');
        
        const dbPathDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbPathDir)) {
            fs.mkdirSync(dbPathDir, { recursive: true });
            console.log(`📁 Created database directory: ${dbPathDir}`);
        }
        
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('❌ Failed to open SQLite database:', err.message);
                return reject(err);
            }
            console.log('✅ Connected to SQLite database');
            
            db.serialize(() => {
                // Create tasks table
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
                
                // Activity log
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
                
                // Reminders
                db.run(`CREATE TABLE IF NOT EXISTS reminders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    task_title TEXT,
                    due_date TEXT,
                    notified INTEGER DEFAULT 0,
                    created_at TEXT DEFAULT (datetime('now'))
                )`);
                
                // Comments
                db.run(`CREATE TABLE IF NOT EXISTS comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id TEXT NOT NULL,
                    content TEXT NOT NULL,
                    agent_id TEXT,
                    agent_role TEXT,
                    created_at TEXT DEFAULT (datetime('now'))
                )`);
                
                console.log('✅ SQLite schema created successfully');
                db.close();
                resolve(true);
            });
        });
    });
}

async function main() {
    console.log('🚀 Kanban MVP Migration Script');
    console.log('==============================');
    
    if (DATABASE_URL) {
        console.log(`📦 Database: PostgreSQL (DATABASE_URL set)`);
        try {
            await migratePostgres();
            console.log('✅ Migration complete!');
            process.exit(0);
        } catch (err) {
            console.error('💥 PostgreSQL migration failed, falling back to SQLite...');
            await migrateSqlite();
            console.log('✅ Migration complete (SQLite fallback)!');
            process.exit(0);
        }
    } else {
        console.log(`📦 Database: SQLite (${DB_PATH})`);
        await migrateSqlite();
        console.log('✅ Migration complete!');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('💥 Migration failed:', err);
    process.exit(1);
});
