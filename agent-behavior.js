#!/usr/bin/env node
/**
 * Kanban MVP - Autonomous Agent Behavior Script
 * 
 * Maintains backlog health and processes cards through the workflow.
 * 
 * Behavior Rules:
 * - Maintain Backlog <= 10 cards (generate new ideas if < 10)
 * - Only pick unclaimed cards in "To Do"
 * - Claim → move to Ongoing → comment progress
 * - When finished, move to Review
 * - Never move Review → Done
 * 
 * Environment Variables:
 * - AGENT_API_KEY (required): API key for authentication
 * - BEHAVIOR_INTERVAL_MS (optional): Loop interval in ms (default: 30000)
 * - KANBAN_BASE_URL (optional): API base URL (default: http://localhost:3000)
 * - AGENT_ID (optional): Agent identifier (default: auto-agent)
 */

require('dotenv').config();

// ============ Configuration ============
const API_KEY = process.env.AGENT_API_KEY;
const INTERVAL_MS = parseInt(process.env.BEHAVIOR_INTERVAL_MS) || 30000;
const BASE_URL = process.env.KANBAN_BASE_URL || 'http://localhost:3000';
const AGENT_ID = process.env.AGENT_ID || 'auto-agent';

// ============ Validation ============
if (!API_KEY) {
    console.error('❌ ERROR: AGENT_API_KEY environment variable is required');
    process.exit(1);
}

console.log('🤖 Kanban Agent Started');
console.log(`   API URL: ${BASE_URL}`);
console.log(`   Agent ID: ${AGENT_ID}`);
console.log(`   Interval: ${INTERVAL_MS}ms`);
console.log('');

// ============ HTTP Client ============
const http = require('http');

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': API_KEY,
                'X-Agent-Id': AGENT_ID,
                'X-Agent-Role': 'agent'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// ============ Logging ============
function log(action, message, details = {}) {
    const timestamp = new Date().toISOString();
    const detailsStr = Object.keys(details).length > 0 ? ` | ${JSON.stringify(details)}` : '';
    console.log(`[${timestamp}] ${action.toUpperCase()}: ${message}${detailsStr}`);
}

function logError(action, error) {
    const msg = error?.data?.error || error?.message || error || 'Unknown error';
    const details = error?.data ? JSON.stringify(error.data) : '';
    console.error(`[ERROR] ${action}: ${msg} ${details}`);
}

// ============ Idea Generator ============
const ideaTemplates = [
    'Add user authentication feature',
    'Implement search functionality',
    'Create dashboard analytics',
    'Add notification system',
    'Improve API response times',
    'Add unit tests for module X',
    'Refactor legacy code',
    'Add input validation',
    'Create API documentation',
    'Optimize database queries',
    'Add logging and monitoring',
    'Implement caching layer',
    'Add rate limiting',
    'Create backup system',
    'Improve error handling',
    'Add data export feature',
    'Implement WebSocket support',
    'Add internationalization',
    'Create admin panel',
    'Add performance metrics'
];

function generateIdea() {
    const template = ideaTemplates[Math.floor(Math.random() * ideaTemplates.length)];
    const id = Date.now().toString(36);
    const adjectives = ['Critical', 'High Priority', 'Quick Win', 'Technical Debt', 'Enhancement'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    return `${adjective}: ${template} - ${id}`;
}

// ============ Agent Actions ============

/**
 * Get cards by status
 */
async function getCardsByStatus(status) {
    try {
        const res = await request('GET', `/api/cards?status=${encodeURIComponent(status)}`);
        if (res.status === 200 && Array.isArray(res.data)) {
            return res.data;
        }
        return [];
    } catch (err) {
        logError('getCardsByStatus', err);
        return [];
    }
}

/**
 * Generate and create new card in Backlog
 */
async function generateBacklogCard() {
    const title = generateIdea();
    try {
        const res = await request('POST', '/api/cards', {
            title,
            description: `Auto-generated idea by ${AGENT_ID}`,
            priority: 'Medium',
            status: 'Backlog'
        });
        
        if (res.status === 201) {
            log('generate_backlog', `Created new backlog card`, { id: res.data.id, title });
            return res.data;
        } else {
            logError('generate_backlog', res);
            return null;
        }
    } catch (err) {
        logError('generate_backlog', err);
        return null;
    }
}

/**
 * Get unclaimed cards in "To Do"
 */
async function getUnclaimedToDoCards() {
    try {
        const res = await request('GET', '/api/cards?status=To+Do');
        if (res.status === 200 && Array.isArray(res.data)) {
            // Filter for unclaimed cards (owner_agent is null/empty)
            return res.data.filter(card => !card.owner_agent || card.owner_agent === '');
        }
        return [];
    } catch (err) {
        logError('getUnclaimedToDoCards', err);
        return [];
    }
}

/**
 * Claim a card
 */
async function claimCard(cardId) {
    try {
        const res = await request('POST', `/api/cards/${cardId}/claim`);
        
        if (res.status === 200) {
            log('claim', `Claimed card`, { cardId, owner: res.data.owner_agent });
            return { success: true, data: res.data };
        } else if (res.status === 409) {
            // Already claimed
            log('claim', `Card already claimed`, { cardId });
            return { success: false, reason: 'already_claimed' };
        } else {
            logError('claim', res);
            return { success: false, reason: 'error' };
        }
    } catch (err) {
        logError('claim', err);
        return { success: false, reason: 'error' };
    }
}

/**
 * Transition card to a new status
 */
async function transitionCard(cardId, newStatus) {
    try {
        const res = await request('POST', `/api/cards/${cardId}/transition`, {
            status: newStatus
        });
        
        if (res.status === 200) {
            log('transition', `Transitioned card`, { 
                cardId, 
                from: res.data.from_status, 
                to: res.data.to_status 
            });
            return { success: true, data: res.data };
        } else if (res.status === 403) {
            log('transition', `Transition denied (Review → Done restricted)`, { 
                cardId, 
                reason: res.data?.reason 
            });
            return { success: false, reason: 'forbidden' };
        } else {
            logError('transition', res);
            return { success: false, reason: 'error' };
        }
    } catch (err) {
        logError('transition', err);
        return { success: false, reason: 'error' };
    }
}

/**
 * Add progress comment
 */
async function addComment(cardId, content) {
    try {
        const res = await request('POST', `/api/cards/${cardId}/comment`, { content });
        
        if (res.status === 201) {
            log('comment', `Added progress comment`, { cardId, content: content.substring(0, 50) });
            return { success: true };
        } else {
            logError('comment', res);
            return { success: false };
        }
    } catch (err) {
        logError('comment', err);
        return { success: false };
    }
}

// ============ Main Agent Loop ============

async function runAgentLoop() {
    const loopStart = Date.now();
    log('loop', 'Starting agent loop');
    
    try {
        // Step 1: Maintain Backlog <= 10
        log('loop', 'Checking backlog health');
        const backlogCards = await getCardsByStatus('Backlog');
        const backlogCount = backlogCards.length;
        
        if (backlogCount < 10) {
            const needed = 10 - backlogCount;
            log('loop', `Backlog has ${backlogCount} cards, generating ${needed} new ideas`);
            
            for (let i = 0; i < needed; i++) {
                await generateBacklogCard();
                // Small delay between card creations
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } else {
            log('loop', `Backlog has ${backlogCount} cards (healthy)`);
        }

        // Step 2: Find and process unclaimed To Do cards
        log('loop', 'Checking for unclaimed To Do cards');
        const unclaimedCards = await getUnclaimedToDoCards();
        
        if (unclaimedCards.length === 0) {
            log('loop', 'No unclaimed To Do cards found');
        } else {
            // Process each unclaimed card
            for (const card of unclaimedCards) {
                log('loop', `Processing card`, { id: card.id, title: card.title });
                
                // Step 2a: Claim the card
                const claimResult = await claimCard(card.id);
                if (!claimResult.success) {
                    continue; // Skip if already claimed
                }
                
                // Small delay between operations
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Step 2b: Move to Ongoing
                const transitionToOngoing = await transitionCard(card.id, 'Ongoing');
                if (!transitionToOngoing.success) {
                    continue;
                }
                
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Step 2c: Add progress comment
                await addComment(card.id, `🤖 [${AGENT_ID}] Started working on this task`);
                
                // Simulate work done - move to Review
                // In a real scenario, this would wait for actual completion
                log('loop', `Simulating work completion, moving to Review`, { cardId: card.id });
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Step 2d: Move to Review (agent can do this)
                await transitionCard(card.id, 'Review');
                
                log('loop', `Card processed successfully`, { 
                    id: card.id, 
                    title: card.title,
                    finalStatus: 'Review'
                });
            }
        }

        // Step 3: Note on Review → Done restriction
        const reviewCards = await getCardsByStatus('Review');
        if (reviewCards.length > 0) {
            log('loop', `${reviewCards.length} cards in Review (awaiting Founder review)`);
        }

    } catch (err) {
        logError('loop', err);
    }

    const loopDuration = Date.now() - loopStart;
    log('loop', `Agent loop completed in ${loopDuration}ms`);
}

// ============ Startup ============

console.log('🚀 Agent is running. Press Ctrl+C to stop.\n');

// Initial run
runAgentLoop().then(() => {
    // Schedule periodic runs
    setInterval(runAgentLoop, INTERVAL_MS);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down agent...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down agent...');
    process.exit(0);
});
