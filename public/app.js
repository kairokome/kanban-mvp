const API_URL = '';
let tasks = [];
let currentView = 'all';
let isOwner = false;

// Auth
function authenticate() {
    const password = document.getElementById('owner-password').value;
    fetch(API_URL + '/api/tasks', {
        headers: { 'x-owner-password': password }
    })
    .then(res => {
        if (res.ok) {
            isOwner = true;
            localStorage.setItem('owner_password', password);
            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            loadTasks();
            loadReminders();
        } else {
            document.getElementById('auth-error').textContent = 'Invalid password';
        }
    })
    .catch(() => {
        document.getElementById('auth-error').textContent = 'Connection error';
    });
}

// Load password from storage
document.addEventListener('DOMContentLoaded', () => {
    const savedPassword = localStorage.getItem('owner_password');
    if (savedPassword) {
        document.getElementById('owner-password').value = savedPassword;
        authenticate();
    }
});

// API helper
function api(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 
            'Content-Type': 'application/json',
            'x-owner-password': localStorage.getItem('owner_password') || ''
        }
    };
    if (body) options.body = JSON.stringify(body);
    return fetch(API_URL + endpoint, options);
}

// Load tasks
function loadTasks() {
    api('/api/tasks')
    .then(res => res.json())
    .then(data => {
        tasks = data;
        updateStats();
        renderBoard();
    })
    .catch(err => console.error('Error loading tasks:', err));
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
    document.getElementById('stat-overdue').style.display = overdue > 0 ? 'inline' : 'none';
}

// Render board
function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    const columns = ['Backlog', 'To Do', 'Ongoing', 'Review', 'Done'];

    columns.forEach(status => {
        const colTasks = tasks.filter(t => t.status === status);
        
        // Filter by view
        const displayTasks = currentView === 'all' ? colTasks : colTasks;

        const colDiv = document.createElement('div');
        colDiv.className = 'column';
        colDiv.innerHTML = `
            <h2>${status} <span class="column-count">${colTasks.length}</span></h2>
            <div class="task-list" data-status="${status}"></div>
        `;

        const taskList = colDiv.querySelector('.task-list');
        
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

        displayTasks.forEach(task => {
            taskList.appendChild(createTaskCard(task));
        });

        board.appendChild(colDiv);
    });
}

// Create task card
function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'Done';
    const dueClass = isOverdue ? 'overdue' : '';
    const dueText = task.due_date ? new Date(task.due_date).toLocaleDateString() : '';

    card.innerHTML = `
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-meta">
            <span class="priority priority-${task.priority}">${task.priority}</span>
            <span class="due-date ${dueClass}">${dueText}</span>
        </div>
        <div class="task-actions">
            <button class="btn-secondary btn-small" onclick="editTask('${task.id}')">Edit</button>
            <button class="delete-btn btn-small" onclick="deleteTask('${task.id}')">Delete</button>
        </div>
    `;

    card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', task.id);
    });

    return card;
}

// Move task
function moveTask(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    api(`/api/tasks/${taskId}`, 'PUT', { status: newStatus })
    .then(() => {
        loadTasks();
    });
}

// Add/Edit Task
function showAddTask() {
    document.getElementById('modal-title').textContent = 'Add Task';
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('task-modal').classList.remove('hidden');
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description || '';
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-due').value = task.due_date || '';
    document.getElementById('task-modal').classList.remove('hidden');
}

function saveTask(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const taskData = {
        title: document.getElementById('task-title').value.trim(),
        description: document.getElementById('task-desc').value.trim(),
        priority: document.getElementById('task-priority').value,
        status: document.getElementById('task-status').value,
        due_date: document.getElementById('task-due').value || null
    };

    const method = id ? 'PUT' : 'POST';
    const endpoint = id ? `/api/tasks/${id}` : '/api/tasks';

    api(endpoint, method, taskData)
    .then(() => {
        closeModal();
        loadTasks();
        loadReminders();
    })
    .catch(err => console.error('Error saving task:', err));
}

function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    api(`/api/tasks/${id}`, 'DELETE')
    .then(() => {
        loadTasks();
        loadReminders();
    });
}

function closeModal() {
    document.getElementById('task-modal').classList.add('hidden');
}

// View tabs
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.tab[onclick="switchView('${view}')"]`).classList.add('active');
    renderBoard();
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
    api('/api/activity?limit=100')
    .then(res => res.json())
    .then(logs => {
        const list = document.getElementById('activity-list');
        if (logs.length === 0) {
            list.innerHTML = '<p>No activity yet.</p>';
            return;
        }
        list.innerHTML = logs.map(log => `
            <div class="activity-item">
                <span class="activity-time">${new Date(log.created_at).toLocaleString()}</span>
                <span class="activity-action">${log.action}</span>: ${escapeHtml(log.details || '')}
            </div>
        `).join('');
    });
}

// Reminders
function loadReminders() {
    api('/api/reminders')
    .then(res => res.json())
    .then(reminders => {
        const section = document.getElementById('reminders-section');
        const list = document.getElementById('reminders-list');
        
        const upcoming = reminders.filter(t => {
            if (!t.due_date || t.status === 'Done') return false;
            const due = new Date(t.due_date);
            const now = new Date();
            const daysUntil = (due - now) / (1000 * 60 * 60 * 24);
            return daysUntil <= 7; // Within 7 days
        });

        if (upcoming.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = upcoming.map(t => {
            const isOverdue = new Date(t.due_date) < new Date();
            return `
                <div class="reminder-item ${isOverdue ? 'overdue' : ''}">
                    <span>${escapeHtml(t.title)}</span>
                    <span class="due-date ${isOverdue ? 'overdue' : ''}">${new Date(t.due_date).toLocaleDateString()}</span>
                </div>
            `;
        }).join('');
    });
}

// Utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial load (will redirect to auth if needed)
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('owner_password')) {
        authenticate();
    }
});
