#!/usr/bin/env node

/**
 * Kanban Manager Poller - Executive Summary Format
 * 
 * Posts clean executive-level Kanban summaries to Discord.
 * 
 * Usage:
 *   node poller.js           # Run once
 *   npm run poller           # Run continuously (every 5 min)
 *   npm run poller:test      # Send test summary
 * 
 * Environment Variables:
 *   DISCORD_WEBHOOK_URL      - Discord webhook URL (required)
 *   POLL_INTERVAL_SECONDS   - Poll interval in seconds (default: 300)
 *   KANBAN_BASE_URL         - Kanban API base URL (default: http://localhost:3000)
 *   AGENT_API_KEY           - API key for Kanban API (required)
 *   MANAGER_AGENT_ID        - Manager agent ID (default: manager)
 */

require('dotenv').config();

// ============ Configuration ============
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const POLL_INTERVAL_SECONDS = parseInt(process.env.POLL_INTERVAL_SECONDS) || 300;
const KANBAN_BASE_URL = process.env.KANBAN_BASE_URL || 'http://localhost:3000';
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const MANAGER_AGENT_ID = process.env.MANAGER_AGENT_ID || 'manager';
const MANAGER_ROLE = 'manager';

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
 * Fetch all tasks from the Kanban API
 */
async function fetchAllTasks() {
    const url = `${KANBAN_BASE_URL}/api/cards`;
    
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
        console.error('❌ Failed to fetch tasks:', error.message);
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
 * Check if task was completed today
 */
function isDoneToday(dueDate) {
    if (!dueDate) return false;
    const doneDate = new Date(dueDate);
    const today = new Date();
    return doneDate.toDateString() === today.toDateString();
}

/**
 * Format a task for Discord (compact, one line)
 */
function formatTaskCompact(task) {
    const priorityEmoji = {
        'High': '🔴',
        'Medium': '🟡',
        'Low': '🟢'
    }[task.priority] || '⚪';

    const dueDate = task.due_date 
        ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'no due';
    
    const overdue = isOverdue(task.due_date);
    const overdueSuffix = overdue ? ' ⚠️ OVERDUE' : '';

    return `${priorityEmoji} **${task.title}** (${dueDate}${overdueSuffix})`;
}

/**
 * Build executive summary embed
 */
function buildExecutiveSummary(data) {
    const { totals, managerInbox, review, overdue } = data;
    const hasOverdue = overdue.length > 0;

    // Build counts line
    let countsLine = `**Total:** ${totals.total} | **Inbox:** ${totals.inbox} | **Ongoing:** ${totals.ongoing} | **Review:** ${totals.review}`;
    if (totals.doneToday > 0) {
        countsLine += ` | **Done Today:** ${totals.doneToday}`;
    }
    if (totals.overdue > 0) {
        countsLine += ` | ⚠️ **Overdue:** ${totals.overdue}`;
    }

    // Color based on status
    let embedColor = 0x55AAFF; // Blue - normal
    if (hasOverdue) {
        embedColor = 0xFF5555; // Red - overdue issues
    } else if (totals.doneToday > 0 && totals.ongoing === 0 && totals.inbox === 0 && totals.review === 0) {
        embedColor = 0x55FF55; // Green - all clear
    }

    const embed = {
        title: `📊 Kanban Executive Summary`,
        description: countsLine,
        color: embedColor,
        fields: [],
        footer: {
            text: `Updated: ${new Date().toLocaleString()}`
        }
    };

    // Manager-owned tasks in Agent Inbox (max 3)
    if (managerInbox.length > 0) {
        const topManager = managerInbox.slice(0, 3);
        const extra = managerInbox.length - 3;
        const extraText = extra > 0 ? `\n_${extra} more..._` : '';
        
        embed.fields.push({
            name: '🔄 Manager Tasks (Inbox)',
            value: topManager.map(t => formatTaskCompact(t)).join('\n') + extraText,
            inline: false
        });
    }

    // Tasks waiting for Founder (Review) (max 3)
    if (review.length > 0) {
        const topReview = review.slice(0, 3);
        const extra = review.length - 3;
        const extraText = extra > 0 ? `\n_${extra} more..._` : '';
        
        embed.fields.push({
            name: '👀 Waiting for Founder (Review)',
            value: topReview.map(t => formatTaskCompact(t)).join('\n') + extraText,
            inline: false
        });
    }

    // Overdue tasks (max 3)
    if (overdue.length > 0) {
        const topOverdue = overdue.slice(0, 3);
        const extra = overdue.length - 3;
        const extraText = extra > 0 ? `\n_${extra} more overdue..._` : '';
        
        embed.fields.push({
            name: '⚠️ Overdue Tasks',
            value: topOverdue.map(t => formatTaskCompact(t)).join('\n') + extraText,
            inline: false
        });
    }

    // Empty state
    if (managerInbox.length === 0 && review.length === 0 && overdue.length === 0) {
        embed.fields.push({
            name: '✅ All Clear',
            value: 'No tasks require attention. Board is up to date.',
            inline: false
        });
    }

    return embed;
}

/**
 * Send embed to Discord webhook
 */
async function sendToDiscord(embed) {
    try {
        const payload = {
            username: 'Kanban Manager',
            avatar_url: 'https://cdn-icons-png.flaticon.com/512/2693/2693507.png',
            embeds: [embed]
        };

        console.log('📤 Sending executive summary to Discord...');
        console.log('   Summary payload:', JSON.stringify({
            title: embed.title,
            fieldsCount: embed.fields.length,
            color: embed.color.toString(16)
        }, null, 2));

        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }

        console.log('✅ Executive summary sent to Discord');
        return true;
    } catch (error) {
        console.error('❌ Failed to send to Discord:', error.message);
        return false;
    }
}

/**
 * Generate test executive summary
 */
function generateTestSummary() {
    const testData = {
        totals: {
            total: 12,
            inbox: 3,
            ongoing: 5,
            review: 2,
            doneToday: 2,
            overdue: 2
        },
        managerInbox: [
            { id: 'test-1', title: 'Review Q4 Budget', priority: 'High', due_date: new Date(Date.now() - 86400000).toISOString() },
            { id: 'test-2', title: 'Approve Vendor Contract', priority: 'High', due_date: new Date(Date.now() - 172800000).toISOString() },
            { id: 'test-3', title: 'Team Performance Review', priority: 'Medium', due_date: new Date(Date.now() + 86400000).toISOString() },
            { id: 'test-4', title: 'Update Policy Docs', priority: 'Low', due_date: null }
        ],
        review: [
            { id: 'test-5', title: 'Marketing Campaign Proposal', priority: 'High', due_date: new Date(Date.now() + 172800000).toISOString() },
            { id: 'test-6', title: 'Product Roadmap v2.0', priority: 'Medium', due_date: new Date(Date.now() + 259200000).toISOString() }
        ],
        overdue: [
            { id: 'test-7', title: 'Q1 Planning Document', priority: 'High', due_date: new Date(Date.now() - 259200000).toISOString() },
            { id: 'test-8', title: 'Compliance Audit Response', priority: 'High', due_date: new Date(Date.now() - 432000000).toISOString() }
        ]
    };

    return buildExecutiveSummary(testData);
}

/**
 * Main poll function - fetches data and posts executive summary
 */
async function poll() {
    console.log(`\n🕐 [${new Date().toISOString()}] Generating Executive Summary...`);

    // Fetch all tasks
    const allTasks = await fetchAllTasks();
    console.log(`   - Total tasks fetched: ${allTasks.length}`);

    if (allTasks.length === 0) {
        console.log('📭 No tasks found');
        const emptyEmbed = buildExecutiveSummary({
            totals: { total: 0, inbox: 0, ongoing: 0, review: 0, doneToday: 0, overdue: 0 },
            managerInbox: [],
            review: [],
            overdue: []
        });
        await sendToDiscord(emptyEmbed);
        return;
    }

    // Categorize tasks
    const totals = {
        total: allTasks.length,
        inbox: allTasks.filter(t => t.status === 'Agent Inbox').length,
        ongoing: allTasks.filter(t => t.status === 'Ongoing').length,
        review: allTasks.filter(t => t.status === 'Review').length,
        doneToday: allTasks.filter(t => t.status === 'Done' && isDoneToday(t.updated_at || t.due_date)).length,
        overdue: allTasks.filter(t => isOverdue(t.due_date)).length
    };

    const managerInbox = allTasks.filter(t => 
        t.status === 'Agent Inbox' && 
        t.owner_agent === MANAGER_AGENT_ID
    ).sort((a, b) => {
        // Sort: overdue first, then by priority
        const aOverdue = isOverdue(a.due_date);
        const bOverdue = isOverdue(b.due_date);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
        return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    const review = allTasks.filter(t => 
        t.status === 'Review'
    ).sort((a, b) => {
        const aOverdue = isOverdue(a.due_date);
        const bOverdue = isOverdue(b.due_date);
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        const priorityOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
        return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
    });

    const overdue = allTasks.filter(t => 
        isOverdue(t.due_date)
    ).sort((a, b) => {
        // Most overdue first
        return new Date(a.due_date) - new Date(b.due_date);
    });

    console.log(`   - Inbox: ${totals.inbox} | Ongoing: ${totals.ongoing} | Review: ${totals.review} | Done Today: ${totals.doneToday} | Overdue: ${totals.overdue}`);
    console.log(`   - Manager Inbox: ${managerInbox.length} | Review (Founder): ${review.length} | Overdue: ${overdue.length}`);

    // Build and send executive summary
    const summary = buildExecutiveSummary({ totals, managerInbox, review, overdue });
    await sendToDiscord(summary);
}

/**
 * Run as test mode
 */
async function runTest() {
    console.log('🧪 Kanban Poller - Executive Summary Test Mode\n');
    
    const testEmbed = generateTestSummary();
    
    console.log('📤 Sending test executive summary to Discord...');
    console.log('   Test payload:', JSON.stringify({
        title: testEmbed.title,
        fieldsCount: testEmbed.fields.length,
        color: testEmbed.color.toString(16)
    }, null, 2));
    
    const success = await sendToDiscord(testEmbed);
    
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

    console.log('🚀 Kanban Executive Summary Poller Started');
    console.log(`   Base URL: ${KANBAN_BASE_URL}`);
    console.log(`   Poll Interval: ${POLL_INTERVAL_SECONDS}s`);
    console.log(`   Webhook: ${DISCORD_WEBHOOK_URL ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   API Key: ${AGENT_API_KEY ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Manager Agent: ${MANAGER_AGENT_ID}`);
    console.log('');
    
    // Run immediately on start
    await poll();

    // Then poll on interval
    const intervalMs = POLL_INTERVAL_SECONDS * 1000;
    console.log(`\n⏳ Next summary in ${POLL_INTERVAL_SECONDS} seconds...`);
    
    setInterval(async () => {
        await poll();
    }, intervalMs);
}

// Export for testing
module.exports = { fetchAllTasks, buildExecutiveSummary, sendToDiscord, poll };

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}
