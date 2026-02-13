#!/usr/bin/env node

/**
 * Agent CLI for Kanban MVP
 * Standalone CLI for agents to interact with Kanban without UI
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

// Load .env from project root or current directory
function loadEnv() {
    const envPaths = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '.env'),
        '.env',
        '/Users/kairo/.openclaw-manager/workspace-saas/projects/kanban-mvp/.env'
    ];
    
    for (const envPath of envPaths) {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...rest] = trimmed.split('=');
                    const value = rest.join('=').trim();
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
            return;
        }
    }
}

loadEnv();

// Configuration
const DEFAULT_BASE_URL = process.env.KANBAN_BASE_URL || 'http://localhost:3000';
const DEFAULT_AGENT_ID = process.env.AGENT_ID || 'manager';
const DEFAULT_AGENT_ROLE = process.env.AGENT_ROLE || 'member';
const DEFAULT_API_KEY = process.env.AGENT_API_KEY || 'agent-secret-key-12345';

// Parse CLI args
const args = process.argv.slice(2);
const flags = {};
let command = null;
let commandArgs = [];

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        flags[key.toLowerCase()] = value || true;
    } else if (arg.startsWith('-')) {
        const key = arg.slice(1).toLowerCase();
        flags[key] = true;
    } else if (!command) {
        command = arg;
    } else {
        commandArgs.push(arg);
    }
}

// Helper to make API requests
function apiRequest(method, endpoint, data = null, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, options.baseUrl || DEFAULT_BASE_URL);
        
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': options.apiKey || DEFAULT_API_KEY,
            'x-agent-id': options.agentId || DEFAULT_AGENT_ID,
            'x-agent-role': options.agentRole || DEFAULT_AGENT_ROLE,
            ...options.headers
        };

        const reqOptions = {
            hostname: url.hostname,
            port: url.port || 3000,
            path: url.pathname + url.search,
            method,
            headers
        };

        const req = http.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = body ? JSON.parse(body) : {};
                    if (res.statusCode >= 400) {
                        reject({ statusCode: res.statusCode, error: json.error || json.message || 'Request failed' });
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject({ statusCode: res.statusCode, error: 'Invalid JSON response' });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Format output
function output(data, format = 'json') {
    if (format === 'table') {
        if (Array.isArray(data)) {
            if (data.length === 0) {
                console.log('No tasks found.');
                return;
            }
            // Simple table format
            const maxTitleLen = Math.min(Math.max(...data.map(t => t.title?.length || 0)), 40);
            const maxIdLen = Math.max(...data.map(t => t.id?.length || 0));
            
            console.log(`ID${' '.repeat(Math.max(0, maxIdLen - 2))} | STATUS | PRIORITY | ${'TITLE'.padEnd(maxTitleLen)} | OWNER`);
            console.log('-'.repeat(maxIdLen + 1) + '-+-' + '-'.repeat(8) + '-+-' + '-'.repeat(10) + '-+-' + '-'.repeat(maxTitleLen + 2) + '-+-' + '-'.repeat(20));
            
            data.forEach(task => {
                const id = (task.id || '').padEnd(maxIdLen);
                const status = (task.status || '').padEnd(8);
                const priority = (task.priority || '').padEnd(10);
                const title = (task.title || '').substring(0, maxTitleLen).padEnd(maxTitleLen);
                const owner = (task.owner_agent || task.assignee || 'unassigned').substring(0, 20);
                console.log(`${id} | ${status} | ${priority} | ${title} | ${owner}`);
            });
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

// Commands
const commands = {
    // List tasks
    list: async () => {
        const status = flags.status;
        const format = flags.format || flags.f || 'json';
        
        try {
            const tasks = await apiRequest('GET', `/api/cards${status ? `?status=${encodeURIComponent(status)}` : ''}`);
            output(tasks, format);
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Get single task
    get: async () => {
        const taskId = commandArgs[0];
        if (!taskId) {
            console.error('Error: Task ID required');
            console.error('Usage: agent-cli get <task-id>');
            process.exit(1);
        }

        try {
            // Fetch all tasks and find the one with matching ID
            const tasks = await apiRequest('GET', '/api/cards');
            const task = tasks.find(t => t.id === taskId);
            
            if (!task) {
                console.error(`Error: Task ${taskId} not found`);
                process.exit(1);
            }
            
            const comments = await apiRequest('GET', `/api/cards/${taskId}/comments`);
            
            console.log('\n=== TASK ===');
            console.log(JSON.stringify(task, null, 2));
            
            if (comments && comments.length > 0) {
                console.log('\n=== COMMENTS ===');
                console.log(JSON.stringify(comments, null, 2));
            }
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Claim a task
    claim: async () => {
        const taskId = commandArgs[0];
        if (!taskId) {
            console.error('Error: Task ID required');
            console.error('Usage: agent-cli claim <task-id>');
            process.exit(1);
        }

        try {
            const result = await apiRequest('POST', `/api/tasks/${taskId}/claim`, {}, {
                headers: {
                    'x-owner-password': flags.password || process.env.OWNER_PASSWORD || 'kanban123'
                }
            });
            console.log(`✅ Task ${taskId} claimed successfully`);
            console.log(`   Owner: ${result.owner_agent}`);
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Move/transition task
    move: async () => {
        const taskId = commandArgs[0];
        const newStatus = commandArgs[1];
        
        if (!taskId || !newStatus) {
            console.error('Error: Task ID and new status required');
            console.error('Usage: agent-cli move <task-id> <status>');
            console.error('Valid statuses: Agent Inbox, Ongoing, Review, Done, Backlog, To Do');
            process.exit(1);
        }

        try {
            const result = await apiRequest('POST', `/api/cards/${taskId}/transition`, { status: newStatus });
            console.log(`✅ Task ${taskId} moved: ${result.from_status} → ${result.to_status}`);
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            if (err.reason) {
                console.error(`Reason: ${err.reason}`);
            }
            process.exit(1);
        }
    },

    // Add comment to task
    comment: async () => {
        const taskId = commandArgs[0];
        const message = commandArgs.slice(1).join(' ');
        
        if (!taskId || !message) {
            console.error('Error: Task ID and message required');
            console.error('Usage: agent-cli comment <task-id> <message>');
            process.exit(1);
        }

        try {
            const result = await apiRequest('POST', `/api/cards/${taskId}/comment`, { content: message });
            console.log(`✅ Comment added to task ${taskId}`);
            console.log(`   ID: ${result.id}`);
            console.log(`   Agent: ${result.agent_id} (${result.agent_role})`);
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Create new task
    create: async () => {
        const title = flags.title || flags.t;
        const description = flags.description || flags.d || '';
        const priority = flags.priority || flags.p || 'Medium';
        const owner = flags.owner || flags.o || DEFAULT_AGENT_ID;
        const dueDate = flags.due || flags.dueDate || null;
        
        if (!title) {
            console.error('Error: --title is required');
            console.error('Usage: agent-cli create --title="Task title" [--priority=High] [--owner=agent-id]');
            process.exit(1);
        }

        const taskData = {
            title,
            description,
            priority,
            owner_agent: owner,
            due_date: dueDate,
            status: flags.status || 'Agent Inbox'
        };

        try {
            const result = await apiRequest('POST', '/api/cards', taskData);
            console.log(`✅ Task created successfully`);
            console.log(`   ID: ${result.id}`);
            console.log(`   Title: ${result.title}`);
            console.log(`   Status: ${result.status}`);
            console.log(`   Owner: ${result.owner_agent}`);
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Show tasks assigned to current agent
    mine: async () => {
        const format = flags.format || flags.f || 'json';
        const agentId = flags.agent || flags['agent-id'] || DEFAULT_AGENT_ID;
        
        try {
            // Get all tasks and filter for this agent
            const allTasks = await apiRequest('GET', '/api/cards');
            const myTasks = allTasks.filter(t => 
                t.owner_agent === agentId || t.assignee === agentId
            );
            
            if (myTasks.length === 0) {
                console.log(`No tasks found for agent: ${agentId}`);
            } else {
                output(myTasks, format);
            }
        } catch (err) {
            console.error(`Error: ${err.error || err.message}`);
            process.exit(1);
        }
    },

    // Help
    help: () => {
        console.log(`
Agent CLI for Kanban MVP
========================

Usage: agent-cli <command> [options]

Commands:
  list [--status=<status>]      List all tasks (optional: filter by status)
  get <task-id>                 Show task details
  claim <task-id>               Claim an unassigned task
  move <task-id> <status>       Move task to new status
  comment <task-id> <message>   Add comment to task
  create --title="..."          Create new task
  mine                          Show tasks assigned to me
  help                          Show this help

Global Options:
  --status=<status>             Filter by status (Agent Inbox, Ongoing, Review, Done)
  --priority=<priority>         Task priority (Low, Medium, High)
  --owner=<agent-id>            Task owner/assignee
  --format=<json|table>         Output format (default: json)
  --agent-id=<id>               Agent ID (default: manager)
  --agent-role=<role>           Agent role (founder, agent, member)
  --api-key=<key>               API key
  --base-url=<url>              Kanban server URL

Environment Variables:
  AGENT_ID          Agent ID (default: manager)
  AGENT_ROLE        Agent role (default: member)
  AGENT_API_KEY     API key for authentication
  KANBAN_BASE_URL   Kanban server URL (default: http://localhost:3000)

Examples:
  agent-cli list --status="Agent Inbox"
  agent-cli get abc123
  agent-cli claim abc123
  agent-cli move abc123 "Ongoing"
  agent-cli comment abc123 "Starting work on this"
  agent-cli create --title="Fix bug" --priority=High
  agent-cli mine --format=table

Status Values:
  Agent Inbox, Ongoing, Review, Done, Backlog, To Do
`);
    }
};

// Main
function main() {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        commands.help();
        return;
    }

    if (!commands[command]) {
        console.error(`Unknown command: ${command}`);
        console.error('Run "agent-cli help" for usage');
        process.exit(1);
    }

    commands[command]().catch(err => {
        console.error(`Error: ${err.message || err}`);
        process.exit(1);
    });
}

main();
