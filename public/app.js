const API_URL = '';
let tasks = [];
let currentView = 'all';
let isSaving = false;
let saveTimeout = null;
let authTimeout = null;

// Set current date in header
document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

// Centralized API fetch with auth header
function apiFetch(url, options = {}) {
    const password = localStorage.getItem('ownerPassword') || '';
    return fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-owner-password': password,
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

// Render board
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const columns = ['Backlog', 'To Do', 'Ongoing', 'Review', 'Done'];

    columns.forEach(status => {
        const allColTasks = tasks.filter(t => t.status === status);
        const viewTasks = currentView === 'all' ? allColTasks : allColTasks.filter(t => t.assignee === 'Me' || t.assignee === 'me' || !t.assignee);
        const colTasks = viewTasks;

        const colDiv = document.createElement('div');
        colDiv.className = 'flex-shrink-0 w-72';
        colDiv.innerHTML = `
            <div class="bg-gray-100 rounded-xl p-3">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-semibold text-gray-700 text-sm uppercase tracking-wide">${status}</h2>
                    <span class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">${viewTasks.length}</span>
                </div>
                <div class="space-y-2 column" data-status="${status}"></div>
            </div>
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
            moveTask(taskId, status);
        });

        colTasks.forEach(task => {
            taskList.appendChild(createTaskCard(task));
        });

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

    card.innerHTML = `
        <div class="flex items-start justify-between gap-2 mb-2">
            <h3 class="font-medium text-gray-900 text-sm leading-tight">${escapeHtml(task.title)}</h3>
            <span class="${priorityColors[task.priority] || 'bg-gray-100 text-gray-600'} text-xs px-2 py-0.5 rounded font-medium flex-shrink-0">${task.priority}</span>
        </div>
        ${task.description ? `<p class="text-xs text-gray-500 mb-2 line-clamp-2">${escapeHtml(task.description)}</p>` : ''}
        <div class="flex items-center justify-between text-xs mt-2 pt-2 border-t border-gray-100">
            <span class="flex items-center gap-1 text-gray-500">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                ${escapeHtml(assignee)}
            </span>
            <span class="${dueClass} flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                ${dueText || 'No date'}
            </span>
        </div>
        <div class="flex gap-1 mt-2">
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
            throw new Error('Failed to move task');
        }
        loadTasks();
    })
    .catch(err => {
        console.error('Move task error:', err);
        showNotification('Error moving task');
    });
}

// Add/Edit Task
function showAddTask() {
    resetFormState();
    document.getElementById('modal-title').textContent = 'Add Task';
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('task-modal').classList.remove('hidden');
}

function editTask(id) {
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
    document.getElementById('task-due').value = task.due_date || '';
    document.getElementById('task-modal').classList.remove('hidden');
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
    const taskData = {
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-desc').value.trim(),
        assignee: document.getElementById('task-assignee').value.trim() || 'Me',
        priority: document.getElementById('task-priority').value,
        status: document.getElementById('task-status').value,
        due_date: document.getElementById('task-due').value || null
    };
    
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
