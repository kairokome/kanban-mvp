#!/usr/bin/env node

/**
 * Kanban Manager Poller (Phase 1 - Read-only)
 * 
 * Periodically fetches tasks from Agent Inbox and Review columns,
 * then posts a summary to Discord via webhook.
 * 
 * Usage:
 *   node poller.js           # Run once
 *   npm run poller           # Run continuously (every 5 min)
 * 
 * Environment Variables:
 *   DISCORD_WEBHOOK_URL    - Discord webhook URL (required)
 *   POLL_INTERVAL_SECONDS  - Poll interval in seconds (default: 300)
 *   KANBAN_BASE_URL        - Kanban API base URL (default: http://localhost:3000)
 *   AGENT_API_KEY          - API key for Kanban API (required)
 */

require('dotenv').config();

// ============ Configuration ============
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS) || 300;
const KANBAN_BASE_URL = process.env.KANBAN_BASE_URL || 'http://localhost:3000';
const AGENT_API_KEY = process.env.AGENT_API_KEY;

// Validate required config
if (!DISCORD_WEBHOOK_URL) {
    console.error('❌ DISCORD_WEBHOOK_URL is required');
    console.error('   Set it in .env or environment variable');
    process.exit(1);
}

if (!AGENT_API_KEY) {
    console.error('❌ AGENT_API_KEY is required');
    console.error('   Set it in .env or environment variable');
    process.exit(1);
}

// ============ Helper Functions ============

/**
 * Fetch tasks from the Kanban API
 */
async function fetchTasks(status) {
    const url = `${KANBAN_BASE_URL}/api/cards?status=${encodeURIComponent(status)}`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'x-api-key': AGENT_API_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`❌ Failed to fetch ${status} tasks:`, error.message);
        return [];
    }
}

/**
 * Check if a task is overdue
 */
function isOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
}

/**
 * Format a task for Discord embed
 */
function formatTask(task) {
    const priorityEmoji = {
        'High': '🔴',
        'Medium': '🟡',
        'Low': '🟢'
    }[task.priority] || '⚪';

    const dueDate = task.due_date 
        ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'No due date';
    
    const overdue = isOverdue(task.due_date);
    const overduePrefix = overdue ? '⚠️ **OVERDUE** - ' : '';

    return `${priorityEmoji} **${task.title}**
    > Priority: ${task.priority} | Due: ${overduePrefix}${dueDate}
    > Owner: ${task.owner_agent || 'Unassigned'}
    > ID: \`${task.id}\``;
}

/**
 * Build the Discord embed payload
 */
function buildEmbed(tasks, status, title) {
    const total = tasks.length;
    const overdue = tasks.filter(t => isOverdue(t.due_date)).length;
    
    // Sort tasks: overdue first, then by priority, then by due date
    const sorted = [...tasks].sort((a, b) => {
        // Overdue first
        const aOverdue = isOverdue(a.due_date);
        const bOverdue = isOverdue(b.due_date);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        
        // Then by priority
        const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
        const pa = priorityOrder[a.priority] || 3;
        const pb = priorityOrder[b.priority] || 3;
        if (pa !== pb) return pa - pb;
        
        // Then by due date
        if (a.due_date && b.due_date) {
            return new Date(a.due_date) - new Date(b.due_date);
        }
        return a.due_date ? -1 : 1;
    });

    // Take top 5 tasks
    const topTasks = sorted.slice(0, 5);
    const extraCount = total - 5;
    const extraText = extraCount > 0 ? `\n_${extraCount} more tasks..._` : '';

    const tasksList = topTasks.map((t, i) => 
        `**${i + 1}.** ${formatTask(t)}`
    ).join('\n\n');

    return {
        title: `${title} (${total} total${overdue > 0 ? `, ${overdue} overdue` : ''})`,
        description: tasksList + extraText,
        color: overdue > 0 ? 0xFF5555 : (status === 'Review' ? 0x55AAFF : 0x55FF55),
        footer: {
            text: `Kanban Poller | ${new Date().toLocaleString()}`
        }
    };
}

/**
 * Send embed to Discord webhook
 */
async function sendToDiscord(embeds) {
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'Kanban Manager',
                avatar_url: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
                embeds: embeds
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }

        console.log('✅ Sent summary to Discord');
        return true;
    } catch (error) {
        console.error('❌ Failed to send to Discord:', error.message);
        return false;
    }
}

/**
 * Send a test message to Discord (for verification)
 */
async function sendTestMessage() {
    const embed = {
        title: '🧪 Poller Test Message',
        description: 'This is a test message from the Kanban Poller.\n\nThe poller is configured correctly and ready to send regular updates.',
        color: 0x55AAFF,
        footer: {
            text: `Test sent at ${new Date().toLocaleString()}`
        }
    };

    console.log('📤 Sending test message to Discord...');
    return sendToDiscord([embed]);
}

/**
 * Main poll function - fetches and posts summary
 */
async function poll() {
    console.log(`\n🕐 [${new Date().toISOString()}] Polling Kanban...`);

    // Fetch tasks from both statuses
    const [agentInboxTasks, reviewTasks] = await Promise.all([
        fetchTasks('Agent Inbox'),
        fetchTasks('Review')
    ]);

    console.log(`   - Agent Inbox: ${agentInboxTasks.length} tasks`);
    console.log(`   - Review: ${reviewTasks.length} tasks`);

    if (agentInboxTasks.length === 0 && reviewTasks.length === 0) {
        console.log('📭 No tasks found in monitored columns');
        return;
    }

    // Build embeds
    const embeds = [];

    if (agentInboxTasks.length > 0) {
        embeds.push(buildEmbed(agentInboxTasks, 'Agent Inbox', '📥 Agent Inbox'));
    }

    if (reviewTasks.length > 0) {
        embeds.push(buildEmbed(reviewTasks, 'Review', '🔍 Review'));
    }

    // Send to Discord
    await sendToDiscord(embeds);
}

/**
 * Run as test mode
 */
async function runTest() {
    console.log('🧪 Kanban Poller - Test Mode\n');
    
    const success = await sendTestMessage();
    
    if (success) {
        console.log('\n✅ Test completed successfully!');
        console.log('   Check Discord for the test message.');
        console.log('\nTo start regular polling, run: npm run poller');
    } else {
        console.log('\n❌ Test failed. Check your DISCORD_WEBHOOK_URL.');
    }

    process.exit(success ? 0 : 1);
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.includes('--test') || args.includes('-t')) {
        await runTest();
        return;
    }

    console.log('🚀 Kanban Manager Poller Started');
    console.log(`   Base URL: ${KANBAN_BASE_URL}`);
    console.log(`   Poll Interval: ${POLL_INTERVAL_SECONDS}s`);
    console.log(`   Webhook: ${DISCORD_WEBHOOK_URL ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   API Key: ${AGENT_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log('');
    
    // Run immediately on start
    await poll();

    // Then poll on interval
    const intervalMs = POLL_INTERVAL_SECONDS * 1000;
    console.log(`\n⏳ Next poll in ${POLL_INTERVAL_SECONDS} seconds...`);
    
    setInterval(async () => {
        await poll();
    }, intervalMs);
}

// Export for testing
module.exports = { fetchTasks, buildEmbed, sendToDiscord, poll };

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}
