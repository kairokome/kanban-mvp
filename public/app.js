const API_URL = '';
let tasks = [];
let currentView = 'all';
let isSaving = false;
let saveTimeout = null;
let authTimeout = null;

// Agent identity (can be set by external systems)
let agentIdentity = {
    agentId: localStorage.getItem('agentId') || '',
    agentRole: localStorage.getItem('agentRole') || 'member',
    branch: localStorage.getItem('branch') || '',
    repo: localStorage.getItem('repo') || ''
};

// Set current date in header
document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

// Centralized API fetch with auth header and agent identity
function apiFetch(url, options = {}) {
    const password = localStorage.getItem('ownerPassword') || '';
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-owner-password': password,
            'x-agent-id': agentIdentity.agentId,
            'x-agent-role': agentIdentity.agentRole,
            ...(options.headers || {})
        }
    });
}

// Test if password is valid
async function testAuth() {
    try {
        const res = await apiFetch('/api/tasks');
        return res.ok;
    } catch {
        return false;
    }
}

// Show auth error
function showAuthError(msg) {
    const err = document.getElementById('auth-error');
    err.textContent = msg;
    err.classList.remove('hidden');
}

// Hide auth error
function hideAuthError() {
    const err = document.getElementById('auth-error');
    err.classList.add('hidden');
}

// Authenticate - use typed password directly, only save on success
async function authenticate() {
    const password = document.getElementById('owner-password').value.trim();
    const btn = document.querySelector('#auth-screen button');
    const originalText = btn.textContent;
    
    console.log('Authenticate called with password:', password ? '***' : '(empty)');
    hideAuthError();
    
    if (!password) {
        showAuthError('Please enter a password');
        return;
    }
    
    // Show loading state
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    
    // Set timeout
    authTimeout = setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
        showAuthError('Connection timeout. Please try again.');
    }, 10000);
    
    try {
        // Test password with DIRECT fetch (not apiFetch, which uses empty localStorage)
        const res = await fetch('/api/tasks', {
            headers: {
                'Content-Type': 'application/json',
                'x-owner-password': password
            }
        });
        
        if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
        }
        
        console.log('Auth response status:', res.status);
        
        if (res.ok) {
            // Password valid - save and proceed
            localStorage.setItem('ownerPassword', password);
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadTasks();
            loadReminders();
        } else {
            // Password invalid - don't clear stored password, just show error
            btn.textContent = originalText;
            btn.disabled = false;
            showAuthError('Incorrect password');
        }
    } catch (err) {
        if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
        }
        btn.textContent = originalText;
        btn.disabled = false;
        console.error('Auth error:', err);
        showAuthError('Connection error. Is the server running?');
    }
}

// Check stored password on page load
async function checkStoredAuth() {
    const storedPassword = localStorage.getItem('ownerPassword');
    if (!storedPassword) return false;
    
    console.log('Testing stored password...');
    
    // Set timeout
    authTimeout = setTimeout(() => {
        console.log('Auth check timeout');
        localStorage.removeItem('ownerPassword');
        return false;
    }, 10000);
    
    try {
        const res = await apiFetch('/api/tasks');
        
        if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
        }
        
        if (res.ok) {
            console.log('Stored password valid');
            document.getElementById('owner-password').value = storedPassword;
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadTasks();
            loadReminders();
            return true;
        } else {
            console.log('Stored password invalid');
            localStorage.removeItem('ownerPassword');
            return false;
        }
    } catch (err) {
        if (authTimeout) {
            clearTimeout(authTimeout);
            authTimeout = null;
        }
        console.error('Auth check failed:', err);
        localStorage.removeItem('ownerPassword');
        return false;
    }
}

// Load tasks
function loadTasks() {
    apiFetch('/api/tasks')
    .then(res => {
        if (!res.ok) {
            if (res.status === 401) {
                // Unauthorized - force logout
                logout();
                return [];
            }
            throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        tasks = data;
        updateStats();
        renderBoard();
    })
    .catch(err => {
        console.error('Error loading tasks:', err);
        showNotification('Error loading tasks: ' + err.message);
    });
}

// Force logout
function logout() {
    localStorage.removeItem('ownerPassword');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('owner-password').value = '';
    hideAuthError();
    tasks = [];
    updateStats();
    renderBoard();
}

// Update stats
function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'Done').length;
    const overdue = tasks.filter(t => {
        if (!t.due_date || t.status === 'Done') return false;
        return new Date(t.due_date) < new Date();
    }).length;

    document.getElementById('stat-total').textContent = `${total} task${total !== 1 ? 's' : ''}`;
    document.getElementById('stat-done').textContent = `${done} done`;
    document.getElementById('stat-overdue').textContent = `${overdue} overdue`;
    document.getElementById('stat-overdue').classList.toggle('hidden', overdue === 0);
}

// View filter
function switchView(view) {
    currentView = view;
    document.getElementById('view-all').className = view === 'all' 
        ? 'px-3 py-1 text-sm rounded-md font-medium transition bg-white text-gray-900 shadow-sm'
        : 'px-3 py-1 text-sm rounded-md font-medium transition text-gray-500 hover:text-gray-700';
    document.getElementById('view-my').className = view === 'my'
        ? 'px-3 py-1 text-sm rounded-md font-medium transition bg-white text-gray-900 shadow-sm'
        : 'px-3 py-1 text-sm rounded-md font-medium transition text-gray-500 hover:text-gray-700';
    renderBoard();
}

// Helper: Check if task belongs to current user (for "My Tasks" view)
function isMyTask(task) {
    // Task is "mine" if: no assignee, or assignee is 'Me'/'me', or matches localStorage user
    const userId = localStorage.getItem('agentId') || '';
    const assignee = task.assignee || '';
    return !assignee || 
           assignee.toLowerCase() === 'me' || 
           assignee === userId;
}

// Render board
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const columns = [
        { id: 'Backlog', emoji: '🗂' },
        { id: 'To Do', emoji: '📝' },
        { id: 'Ongoing', emoji: '🚧' },
        { id: 'Review', emoji: '👀' },
        { id: 'Done', emoji: '✅' }
    ];

    // Single source of truth: filter from current tasks state
    const isMyTasksView = currentView === 'my';

    columns.forEach(col => {
        // Derive count strictly from tasks array - no cached/memoized counts
        const allColTasks = tasks.filter(t => t.status === col.id);
        const colTasks = isMyTasksView 
            ? allColTasks.filter(t => isMyTask(t))
            : allColTasks;

        const colDiv = document.createElement('div');
        colDiv.className = 'kanban-column rounded-xl p-3 flex flex-col h-full';
        colDiv.innerHTML = `
            <div class="flex items-center justify-between mb-3 flex-shrink-0">
                <h2 class="font-semibold text-gray-700 text-sm uppercase tracking-wide flex items-center gap-1.5">${col.emoji} ${col.id}</h2>
                <span class="px-2 py-0.5 bg-white/50 text-gray-600 text-xs rounded-full font-medium">${colTasks.length}</span>
            </div>
            <div class="space-y-2 column flex-1 overflow-y-auto" data-status="${col.id}"></div>
        `;

        const taskList = colDiv.querySelector('.column');
        
        // Drop zone
        taskList.addEventListener('dragover', e => {
            e.preventDefault();
            taskList.classList.add('drag-over');
        });
        taskList.addEventListener('dragleave', () => taskList.classList.remove('drag-over'));
        taskList.addEventListener('drop', e => {
            e.preventDefault();
            taskList.classList.remove('drag-over');
            const taskId = e.dataTransfer.getData('text/plain');
            moveTask(taskId, col.id);
        });

        // Render tasks from the same filtered array used for counter
        colTasks.forEach(task => {
            taskList.appendChild(createTaskCard(task));
        });

        // Dev mode assertion: verify counter matches rendered count
        // Use window.__DEV__ or assume dev if not explicitly in production
        const isDevMode = typeof window !== 'undefined' && (window.__DEV__ !== false);
        if (isDevMode) {
            const renderedCount = taskList.children.length;
            if (colTasks.length !== renderedCount) {
                console.warn(
                    `[Dev] Counter mismatch in "${col.id}": ` +
                    `counter=${colTasks.length}, rendered=${renderedCount}, ` +
                    `view="${isMyTasksView ? 'My Tasks' : 'All'}"`,
                    { allColTasks: allColTasks.length, colTasks }
                );
            }
        }

        board.appendChild(colDiv);
    });
}

// Create task card
function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card bg-white rounded-lg p-3 cursor-grab shadow-sm border border-gray-200';
    card.draggable = true;

    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'Done';
    const priorityColors = {
        'High': 'bg-red-100 text-red-700',
        'Medium': 'bg-amber-100 text-amber-700',
        'Low': 'bg-green-100 text-green-700'
    };

    const dueText = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const dueClass = isOverdue ? 'text-red-600' : 'text-gray-400';
    const assignee = task.assignee || 'Me';

    // Check if task is unassigned
    const isUnassigned = !task.owner_agent || task.owner_agent === '';

    // Show owner_agent badge
    const ownerBadge = task.owner_agent && task.owner_agent !== assignee
        ? `<span class="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded ml-1" title="Owner Agent">🤖 ${escapeHtml(task.owner_agent)}</span>`
        : '';

    // Unassigned indicator
    const unassignedBadge = isUnassigned
        ? `<span class="bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded ml-1" title="Unassigned">⚪ Unassigned</span>`
        : '';

    // Show branch/repo metadata
    const metadataHtml = [];
    if (task.branch) {
        metadataHtml.push(`<span class="text-xs text-gray-500">🌿 ${escapeHtml(task.branch)}</span>`);
    }
    if (task.repo) {
        metadataHtml.push(`<span class="text-xs text-gray-500">📦 ${escapeHtml(task.repo)}</span>`);
    }

    // Claim button (only for agents on unassigned tasks)
    const isAgent = agentIdentity.agentRole === 'agent' || agentIdentity.agentRole === 'founder';
    const claimButtonHtml = (isUnassigned && isAgent)
        ? `<button onclick="claimTask('${task.id}')" class="claim-btn flex-1 py-1 text-xs text-indigo-600 hover:text-white hover:bg-indigo-600 rounded transition" title="Claim this task">Claim</button>`
        : '';

    card.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
            <h3 class="font-medium text-gray-900 text-sm leading-tight">${escapeHtml(task.title)}</h3>
            <span class="${priorityColors[task.priority] || 'bg-gray-100 text-gray-600'} text-xs px-2 py-0.5 rounded font-medium flex-shrink-0">${task.priority}</span>
        </div>
        ${task.description ? `<p class="text-xs text-gray-500 mb-2">${escapeHtml(task.description)}</p>` : ''}
        ${metadataHtml.length ? `<div class="flex gap-2 mb-2">${metadataHtml.join('')}</div>` : ''}
        <div class="flex items-center justify-between text-xs mt-auto pt-2 border-t border-gray-100 flex-shrink-0">
            <span class="flex items-center gap-1 text-gray-500">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                ${escapeHtml(assignee)}${ownerBadge}${unassignedBadge}
            </span>
            <span class="${dueClass} flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                ${dueText || 'No date'}
            </span>
        </div>
        <div class="flex gap-1 mt-2">
            ${claimButtonHtml}
            <button onclick="editTask('${task.id}')" class="flex-1 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition" title="Edit">
                <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
            </button>
            <button onclick="deleteTask('${task.id}')" class="flex-1 py-1 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition" title="Delete">
                <svg class="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        </div>
    `;

    card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', task.id);
        card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', () => {
        card.style.opacity = '1';
    });

    return card;
}

// Move task
function moveTask(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    apiFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
    })
    .then(res => {
        if (!res.ok) {
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.status === 403) {
                // Transition denied - show the reason
                return res.json().then(errData => {
                    throw new Error(errData.reason || 'Transition denied by safety gates');
                });
            }
            throw new Error('Failed to move task');
        }
        loadTasks();
    })
    .catch(err => {
        console.error('Move task error:', err);
        showNotification('Error: ' + err.message);
    });
}

// Claim task
function claimTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (!agentIdentity.agentId) {
        alert('Agent identity not set. Please configure your agent ID.');
        return;
    }

    if (!confirm(`Claim task "${task.title}"? You will become the owner.`)) return;

    apiFetch(`/api/tasks/${taskId}/claim`, {
        method: 'POST'
    })
    .then(res => {
        if (!res.ok) {
            if (res.status === 401) {
                logout();
                return;
            }
            if (res.status === 403) {
                return res.json().then(data => {
                    throw new Error(data.reason || 'Claim denied');
                });
            }
            throw new Error('Failed to claim task');
        }
        return res.json();
    })
    .then(data => {
        if (data) {
            console.log('Claim success:', data);
            loadTasks();
            loadReminders();
            showNotification('Task claimed!');
        }
    })
    .catch(err => {
        console.error('Claim error:', err);
        alert('Error claiming task: ' + err.message);
    });
}

// Add/Edit Task
async function showAddTask() {
    resetFormState();
    document.getElementById('modal-title').textContent = 'Add Task';
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    await populateOwnerAgentDropdown('');
    document.getElementById('task-modal').classList.remove('hidden');
}

async function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    resetFormState();
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-assignee').value = task.assignee || '';
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-status').value = task.status;

    const dueEl = document.getElementById('task-due');
    if (dueEl) dueEl.value = task.due_date || '';

    // New fields
    const ownerAgentEl = document.getElementById('task-owner-agent');
    if (ownerAgentEl) {
        await populateOwnerAgentDropdown(task.owner_agent || '');
    }

    const branchEl = document.getElementById('task-branch');
    if (branchEl) branchEl.value = task.branch || '';

    const repoEl = document.getElementById('task-repo');
    if (repoEl) repoEl.value = task.repo || '';

    document.getElementById('task-modal').classList.remove('hidden');
}

// Populate owner agent dropdown with available agents
async function populateOwnerAgentDropdown(selectedValue) {
    const container = document.getElementById('task-owner-agent-container');
    const selectEl = document.getElementById('task-owner-agent');
    
    if (!selectEl) return;

    // Always add "Unassigned" as first option
    const agents = ['Unassigned'];

    // Fetch agents from API
    try {
        const res = await apiFetch('/api/agents');
        if (res.ok) {
            const data = await res.json();
            if (data.agents && Array.isArray(data.agents)) {
                // Add agents from API, excluding "Unassigned" if already in list
                data.agents.forEach(agent => {
                    if (agent && agent !== 'Unassigned' && !agents.includes(agent)) {
                        agents.push(agent);
                    }
                });
            }
        }
    } catch (err) {
        console.error('Failed to fetch agents:', err);
        // Fallback: add current user as agent if API fails
        const agentId = agentIdentity.agentId || localStorage.getItem('agentId') || '';
        const agentRole = agentIdentity.agentRole || localStorage.getItem('agentRole') || 'member';
        if ((agentRole === 'agent' || agentRole === 'founder') && agentId) {
            if (!agents.includes(agentId)) {
                agents.push(agentId);
            }
        }
    }

    // If only "Unassigned" exists, render as static field (not dropdown)
    if (agents.length === 1 && agents[0] === 'Unassigned') {
        // Replace select with static text
        selectEl.style.display = 'none';
        
        // Check if static element exists, create if not
        let staticEl = container.querySelector('.owner-agent-static');
        if (!staticEl) {
            staticEl = document.createElement('div');
            staticEl.className = 'owner-agent-static text-gray-700 font-medium';
            staticEl.style.cssText = 'padding: 0.5rem 0.75rem; background: #f3f4f6; border-radius: 0.375rem; border: 1px solid #d1d5db;';
            selectEl.parentNode.insertBefore(staticEl, selectEl);
        }
        staticEl.textContent = 'Unassigned';
        staticEl.style.display = 'block';
        
        // Set hidden input value
        selectEl.value = '';
    } else {
        // Multiple options - render as dropdown
        let staticEl = container.querySelector('.owner-agent-static');
        if (staticEl) {
            staticEl.style.display = 'none';
        }
        
        selectEl.style.display = 'block';
        
        // Clear and populate options
        selectEl.innerHTML = '';
        
        agents.forEach(agent => {
            const option = document.createElement('option');
            if (agent === 'Unassigned') {
                option.value = '';
                option.textContent = 'Unassigned';
            } else {
                option.value = agent;
                option.textContent = agent === (agentIdentity.agentId || localStorage.getItem('agentId')) 
                    ? `${agent} (You)` 
                    : agent;
            }
            selectEl.appendChild(option);
        });

        // Set selection
        if (selectedValue) {
            selectEl.value = selectedValue;
        } else {
            selectEl.value = '';
        }
    }
}

function saveTask(e) {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double-submit
    if (isSaving) {
        console.log('Already saving, ignored');
        return false;
    }
    
    isSaving = true;
    
    const btn = document.getElementById('save-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;
    
    // Disable all form inputs
    const inputs = document.querySelectorAll('#task-form input, #task-form select, #task-form textarea');
    inputs.forEach(input => input.disabled = true);

    console.log('SaveTask called, isSaving=true');

    const id = document.getElementById('task-id').value;
    const dueEl = document.getElementById('task-due');
    const ownerAgentEl = document.getElementById('task-owner-agent');
    const branchEl = document.getElementById('task-branch');
    const repoEl = document.getElementById('task-repo');

    const taskData = {
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-desc').value.trim(),
        assignee: document.getElementById('task-assignee').value.trim() || 'Me',
        owner_agent: ownerAgentEl ? ownerAgentEl.value : '', // Use value as-is (dropdown, not trimmed)
        priority: document.getElementById('task-priority').value,
        status: document.getElementById('task-status').value,
        due_date: (dueEl && dueEl.value) ? dueEl.value : null,
        branch: branchEl ? branchEl.value.trim() : '',
        repo: repoEl ? repoEl.value.trim() : ''
    };

    // Auto-populate agent identity for new tasks if owner is Unassigned and user is an agent
    const role = agentIdentity.agentRole || localStorage.getItem('agentRole') || 'member';
    if (!taskData.owner_agent && role === 'agent' && agentIdentity.agentId) {
        taskData.owner_agent = agentIdentity.agentId;
    }
    if (!taskData.branch && agentIdentity.branch) {
        taskData.branch = agentIdentity.branch;
    }
    if (!taskData.repo && agentIdentity.repo) {
        taskData.repo = agentIdentity.repo;
    }

    if (!taskData.title) {
        alert('Title is required');
        resetFormState();
        return false;
    }

    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/api/tasks/${id}` : '/api/tasks';

    // 10-second timeout as escape hatch
    saveTimeout = setTimeout(() => {
        console.error('Save timeout after 10s');
        alert('Save timed out. Please try again.');
        resetFormState();
    }, 10000);

    apiFetch(endpoint, {
        method,
        body: JSON.stringify(taskData)
    })
    .then(res => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }

        if (res.status === 401) {
            logout();
            return;
        }

        if (res.status === 403) {
            // Transition denied - show the reason
            return res.json().then(errData => {
                throw new Error(`Transition denied: ${errData.reason || 'Unknown reason'}`);
            });
        }

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
    })
    .then(data => {
        if (data) {
            console.log('Success:', data);
            closeModal();
            loadTasks();
            loadReminders();
            showNotification('Task saved!');
        }
    })
    .catch(err => {
        console.error('Error:', err);
        alert('Error saving task: ' + err.message);
    })
    .finally(() => {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        isSaving = false;
        resetFormState();
    });

    return false;
}

function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    
    apiFetch(`/api/tasks/${id}`, { method: 'DELETE' })
    .then(res => {
        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) {
            throw new Error('Failed to delete');
        }
        loadTasks();
        loadReminders();
    })
    .catch(err => {
        console.error('Delete error:', err);
        showNotification('Error deleting task');
    });
}

function closeModal() {
    resetFormState();
    document.getElementById('task-modal').classList.add('hidden');
    document.getElementById('activity-modal').classList.add('hidden');
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    
    // Clear any pending save timeout
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
}

// Reset all form input states
function resetFormState() {
    isSaving = false;
    const btn = document.getElementById('save-btn');
    if (btn) {
        btn.textContent = 'Save Task';
        btn.disabled = false;
    }
    // Disable/enable all form inputs
    const inputs = document.querySelectorAll('#task-form input, #task-form select, #task-form textarea');
    inputs.forEach(input => input.disabled = false);
}

// Activity Log
function toggleActivityLog() {
    const modal = document.getElementById('activity-modal');
    if (modal.classList.contains('hidden')) {
        loadActivityLog();
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}

function loadActivityLog() {
    apiFetch('/api/activity?limit=100')
    .then(res => {
        if (res.status === 401) {
            logout();
            return [];
        }
        if (!res.ok) throw new Error('Failed to load activity');
        return res.json();
    })
    .then(logs => {
        const list = document.getElementById('activity-list');
        if (logs.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-center py-8">No activity yet.</p>';
            return;
        }
        list.innerHTML = logs.map(log => `
            <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-900">${escapeHtml(log.details || log.action)}</p>
                    <p class="text-xs text-gray-500 mt-0.5">${new Date(log.created_at).toLocaleString()}</p>
                </div>
            </div>
        `).join('');
    })
    .catch(err => {
        console.error('Activity log error:', err);
    });
}

// Reminders
function loadReminders() {
    apiFetch('/api/reminders')
    .then(res => {
        if (res.status === 401) {
            logout();
            return [];
        }
        if (!res.ok) throw new Error('Failed to load reminders');
        return res.json();
    })
    .then(reminders => {
        const section = document.getElementById('reminders-bar');
        const list = document.getElementById('reminders-list');
        
        const upcoming = reminders.filter(t => {
            if (!t.due_date || t.status === 'Done') return false;
            const due = new Date(t.due_date);
            const now = new Date();
            const daysUntil = (due - now) / (1000 * 60 * 60 * 24);
            return daysUntil <= 7;
        });

        if (upcoming.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = upcoming.map(t => {
            const isOverdue = new Date(t.due_date) < new Date();
            return `
                <div class="flex-shrink-0 px-3 py-2 bg-white rounded-lg border ${isOverdue ? 'border-red-200' : 'border-amber-200'}">
                    <span class="text-sm font-medium text-gray-900">${escapeHtml(t.title)}</span>
                    <span class="text-xs ${isOverdue ? 'text-red-600' : 'text-amber-600'} ml-2">${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
            `;
        }).join('');
    })
    .catch(err => {
        console.error('Reminders error:', err);
    });
}

// Utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Notification
function showNotification(message) {
    const notif = document.createElement('div');
    notif.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

// Version info
function displayVersion() {
    const footer = document.getElementById('app-version');
    const version = '0.1.0';
    const commit = document.body.getAttribute('data-commit') || 'local';
    const deployTime = document.body.getAttribute('data-deploy-time') || new Date().toISOString();
    
    const formattedDate = new Date(deployTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    footer.textContent = `v${version} · ${commit} · ${formattedDate}`;
}

// Health check
function checkHealth() {
    fetch(API_URL + '/health')
    .then(res => res.json())
    .then(data => {
        console.log('Health check OK:', data);
    })
    .catch(err => {
        console.error('Health check FAILED:', err);
    });
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    checkStoredAuth();
    displayVersion();
    checkHealth();
});
