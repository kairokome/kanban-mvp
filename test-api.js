// test-api.js - Minimal API test script for kanban-mvp Phase 1 validation
// Run with: node test-api.js

const http = require('http');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.AGENT_API_KEY || 'test-api-key';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'test-password';

let testsPassed = 0;
let testsFailed = 0;

function log(msg) {
    console.log(`[TEST] ${msg}`);
}

function success(msg) {
    testsPassed++;
    console.log(`✅ PASS: ${msg}`);
}

function fail(msg, err) {
    testsFailed++;
    console.error(`❌ FAIL: ${msg}`);
    if (err) console.error(`   Error: ${err.message || err}`);
}

function request(method, path, body, isOwner) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': API_KEY
            }
        };

        if (isOwner) {
            options.headers['X-Owner-Password'] = OWNER_PASSWORD;
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
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

async function runTests() {
    console.log('='.repeat(60));
    console.log('kanban-mvp Phase 1 API Validation Tests');
    console.log(`Target: ${API_BASE_URL}`);
    console.log('='.repeat(60));

    let cardId;

    try {
        // Test 1: Create card
        log('Creating a new card...');
        const createRes = await request('POST', '/api/cards', {
            title: 'Test Card for Phase 1',
            description: 'Testing API completeness',
            priority: 'High'
        });

        if (createRes.status === 201 && createRes.data.id) {
            success('Card created successfully');
            cardId = createRes.data.id;
        } else {
            fail('Create card', { message: `Status ${createRes.status}, response: ${JSON.stringify(createRes.data)}` });
        }

        // Test 2: List cards
        log('Listing cards...');
        const listRes = await request('GET', '/api/cards');
        if (Array.isArray(listRes.data) && listRes.data.length > 0) {
            success('Cards list retrieved');
        } else {
            fail('List cards', { message: 'Expected array' });
        }

        // Test 3: List cards by status
        log('Listing cards by status...');
        const byStatusRes = await request('GET', '/api/cards?status=Agent Inbox');
        if (Array.isArray(byStatusRes.data)) {
            success('Cards by status retrieved');
        } else {
            fail('List by status', { message: 'Expected array' });
        }

        // Test 4: Claim card
        if (cardId) {
            log('Claiming the card (atomic)...');
            const claimRes = await request('POST', `/api/cards/${cardId}/claim`);

            if (claimRes.status === 200 && claimRes.data.owner_agent) {
                success('Card claimed successfully');
            } else if (claimRes.status === 409) {
                log('Card already claimed (race condition test)');
            } else {
                fail('Claim card', { message: `Status ${claimRes.status}, response: ${JSON.stringify(claimRes.data)}` });
            }
        }

        // Test 5: Transition card to "To Do"
        if (cardId) {
            log('Transitioning card to To Do...');
            const transRes = await request('POST', `/api/cards/${cardId}/transition`, {
                status: 'To Do'
            });

            if (transRes.status === 200 && transRes.data.from_status === 'Agent Inbox' && transRes.data.to_status === 'To Do') {
                success('Card transitioned to To Do');
            } else {
                fail('Transition to To Do', { message: `Status ${transRes.status}, response: ${JSON.stringify(transRes.data)}` });
            }
        }

        // Test 6: Add comment
        if (cardId) {
            log('Adding comment...');
            const commentRes = await request('POST', `/api/cards/${cardId}/comment`, {
                content: 'This is a test comment'
            });

            if (commentRes.status === 201) {
                success('Comment added');
            } else {
                fail('Add comment', { message: `Status ${commentRes.status}` });
            }
        }

        // Test 7: Fetch comments
        if (cardId) {
            log('Fetching comments...');
            const commentsRes = await request('GET', `/api/cards/${cardId}/comments`);

            if (Array.isArray(commentsRes.data) && commentsRes.data.length > 0) {
                success('Comments fetched');
            } else {
                fail('Fetch comments', { message: 'Expected array with comments' });
            }
        }

        // Test 8: Invalid transition (Founder only)
        if (cardId) {
            log('Testing invalid transition (Agent Inbox -> Done)...');
            const invalidRes = await request('POST', `/api/cards/${cardId}/transition`, {
                status: 'Done'
            });

            if (invalidRes.status === 403) {
                success('Invalid transition correctly rejected');
            } else {
                fail('Invalid transition', { message: `Expected 403, got ${invalidRes.status}` });
            }
        }

        // Test 9: Update card fields
        if (cardId) {
            log('Updating card fields...');
            const updateRes = await request('PUT', `/api/tasks/${cardId}`, {
                title: 'Updated Test Card',
                priority: 'Low'
            }, true); // Owner auth

            if (updateRes.status === 200 && updateRes.data.priority === 'Low') {
                success('Card fields updated');
            } else {
                fail('Update card', { message: `Status ${updateRes.status}` });
            }
        }

        // Test 10: Health check
        log('Checking health endpoint...');
        const healthRes = await request('GET', '/health');
        if (healthRes.status === 200 && healthRes.data.status === 'ok') {
            success('Health check passed');
        } else {
            fail('Health check', { message: `Status ${healthRes.status}` });
        }

        // Cleanup
        if (cardId) {
            log('Cleaning up test card...');
            await request('DELETE', `/api/tasks/${cardId}`, null, true);
        }

    } catch (err) {
        fail('Test execution', err);
    }

    console.log('='.repeat(60));
    console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
    console.log('='.repeat(60));

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests();
