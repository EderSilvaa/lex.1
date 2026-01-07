// File Manager Logic

const btnAddWorkspace = document.getElementById('btn-add-workspace');
const btnOpenFolder = document.getElementById('btn-open-folder'); // Empty state button
const filesList = document.getElementById('files-list');
const currentPathDisplay = document.getElementById('current-path-display');
const currentFolderTitle = document.getElementById('current-folder-title');
const workspaceList = document.getElementById('workspace-list');

let currentWorkspacePath = null;
let savedWorkspaces = [];

// Init
(async () => {
    if (window.workspacesApi) {
        savedWorkspaces = await window.workspacesApi.get();
        renderWorkspaces();
    }
})();

// Event Listeners
if (btnAddWorkspace) {
    btnAddWorkspace.addEventListener('click', handleAddWorkspace);
}
if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', handleAddWorkspace);
}

async function handleAddWorkspace() {
    if (!window.filesApi) return;
    const folderPath = await window.filesApi.selectFolder();

    if (folderPath && window.workspacesApi) {
        // Save to store
        const result = await window.workspacesApi.add(folderPath);
        if (result.success) {
            savedWorkspaces = result.workspaces;
            renderWorkspaces();
            loadFolder(folderPath); // Open it immediately
        }
    }
}

async function removeWorkspace(e, path) {
    e.stopPropagation(); // Prevent opening the folder
    if (!window.workspacesApi) return;

    // Confirm?
    if (confirm('Remover esta pasta dos fixados?')) {
        const result = await window.workspacesApi.remove(path);
        if (result.success) {
            savedWorkspaces = result.workspaces;
            renderWorkspaces();
            if (currentWorkspacePath === path) {
                // Clear view if current was removed
                filesList.innerHTML = getEmptyStateHTML();
                currentFolderTitle.textContent = "Selecionar Workspace";
                currentPathDisplay.style.display = 'none';
            }
        }
    }
}

function renderWorkspaces() {
    workspaceList.innerHTML = '';

    savedWorkspaces.forEach(path => {
        const folderName = path.split('\\').pop().split('/').pop();
        const item = document.createElement('div');
        item.className = 'ws-item';
        if (path === currentWorkspacePath) item.classList.add('active');

        item.innerHTML = `
            <span>📂</span>
            <span class="ws-name">${folderName}</span>
            <button class="ws-remove-btn" title="Remover">×</button>
        `;

        item.addEventListener('click', () => loadFolder(path));
        item.querySelector('.ws-remove-btn').addEventListener('click', (e) => removeWorkspace(e, path));

        workspaceList.appendChild(item);
    });
}

async function loadFolder(path) {
    currentWorkspacePath = path;
    renderWorkspaces(); // Update active state

    const folderName = path.split('\\').pop().split('/').pop();
    currentFolderTitle.textContent = folderName;

    // Update breadcrumb
    if (currentPathDisplay) {
        currentPathDisplay.style.display = 'flex';
        currentPathDisplay.textContent = path;
    }

    // Fetch files
    try {
        const files = await window.filesApi.listFiles(path);
        renderFiles(files);
    } catch (err) {
        console.error("Error loading folder", err);
        renderFiles([]);
    }
}

function renderFiles(files) {
    filesList.innerHTML = '';

    if (files.length === 0) {
        filesList.innerHTML = getEmptyStateHTML();
        return;
    }

    files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        // SVG Icons
        const iconSvg = file.isDirectory
            ? `<svg viewBox="0 0 24 24" width="40" height="40" stroke="#6366f1" stroke-width="1.5" fill="rgba(99, 102, 241, 0.1)" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
            : getFileIconSvg(file.name);

        card.innerHTML = `
            <div class="file-icon-wrapper">${iconSvg}</div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">${file.isDirectory ? 'Pasta' : 'Documento'}</div>
            </div>
        `;

        // Click behavior
        card.addEventListener('click', () => {
            if (file.isDirectory) {
                loadFolder(file.path);
            } else {
                console.log('Selected file:', file.path);
                // Highlight selection
                document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            }
        });

        filesList.appendChild(card);
    });
}

function getFileIconSvg(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    // PDF - Red/Orange
    if (ext === 'pdf') {
        return `<svg viewBox="0 0 24 24" width="40" height="40" stroke="#ef4444" stroke-width="1.5" fill="rgba(239, 68, 68, 0.1)" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }

    // Word/Docs - Blue
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
        return `<svg viewBox="0 0 24 24" width="40" height="40" stroke="#3b82f6" stroke-width="1.5" fill="rgba(59, 130, 246, 0.1)" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }

    // Default - Gray
    return `<svg viewBox="0 0 24 24" width="40" height="40" stroke="#9ca3af" stroke-width="1.5" fill="rgba(156, 163, 175, 0.1)" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
}
