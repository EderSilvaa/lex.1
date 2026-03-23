// File Manager Logic

const btnAddWorkspace = document.getElementById('btn-add-workspace');
const btnOpenFolder = document.getElementById('btn-open-folder'); // Empty state button
const filesList = document.getElementById('files-list');
const currentPathDisplay = document.getElementById('current-path-display');
const currentFolderTitle = document.getElementById('current-folder-title');
const workspaceList = document.getElementById('workspace-list');

let currentWorkspacePath = null;
let savedWorkspaces = [];
let previewedFile = null; // { path, name, content }

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = typeof text === 'string' ? text : String(text || '');
    return div.innerHTML;
}

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
        const result = await window.workspacesApi.add(folderPath);
        if (result.success) {
            savedWorkspaces = result.workspaces;
            renderWorkspaces();
            loadFolder(folderPath);
            // Re-indexa RAG em background após adicionar workspace
            if (window.lexApi?.ragIndexWorkspace) {
                window.lexApi.ragIndexWorkspace().catch(() => {});
            }
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
            // Re-indexa RAG em background após remover workspace
            if (window.lexApi?.ragIndexWorkspace) {
                window.lexApi.ragIndexWorkspace().catch(() => {});
            }
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
        const safeFolderName = escapeHtml(folderName);
        const item = document.createElement('div');
        item.className = 'ws-item';
        if (path === currentWorkspacePath) item.classList.add('active');

        item.innerHTML = `
            <svg class="ws-folder-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="1.8" fill="none">
                <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11z"></path>
            </svg>
            <span class="ws-name">${safeFolderName}</span>
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
        const safeFileName = escapeHtml(file.name);
        const card = document.createElement('div');
        card.className = 'file-card';
        // SVG Icons
        const iconSvg = file.isDirectory
            ? `<svg viewBox="0 0 24 24" width="40" height="40" stroke="#6366f1" stroke-width="1.5" fill="rgba(99, 102, 241, 0.1)" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
            : getFileIconSvg(file.name);

        card.innerHTML = `
            <div class="file-icon-wrapper">${iconSvg}</div>
            <div class="file-info">
                <div class="file-name" title="${safeFileName}">${safeFileName}</div>
                <div class="file-meta">${file.isDirectory ? 'Pasta' : 'Documento'}</div>
            </div>
        `;

        // Click behavior
        card.addEventListener('click', () => {
            if (file.isDirectory) {
                loadFolder(file.path);
            } else {
                // Highlight selection
                document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                openPreview(file);
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

// ============================================================================
// FILE PREVIEW PANEL
// ============================================================================

const fmPreview = document.getElementById('fm-preview');
const fmPreviewName = document.getElementById('fm-preview-name');
const fmPreviewContent = document.getElementById('fm-preview-content');
const fmPreviewClose = document.getElementById('fm-preview-close');
const fmPreviewSend = document.getElementById('fm-preview-send');

async function openPreview(file) {
    if (!window.filesApi || !fmPreview) return;

    const fileName = file.name || file.path.replace(/\\/g, '/').split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();
    if (fmPreviewName) fmPreviewName.textContent = fileName;
    if (fmPreviewContent) fmPreviewContent.innerHTML = '<p class="fm-preview-placeholder">Carregando...</p>';
    fmPreview.classList.remove('hidden');

    try {
        // PDF — renderiza visualmente via embed
        if (ext === 'pdf') {
            const fileUrl = await window.filesApi.getFileUrl(file.path);
            if (fileUrl && fmPreviewContent) {
                fmPreviewContent.innerHTML = `<embed src="${fileUrl}" type="application/pdf" style="width:100%;height:100%;border:none;border-radius:6px">`;
                // Também extrai texto para envio ao chat
                const result = await window.filesApi.readFile(file.path);
                previewedFile = { path: file.path, name: fileName, content: result?.text || '' };
            } else {
                if (fmPreviewContent) fmPreviewContent.innerHTML = '<p class="fm-preview-placeholder">Nao foi possivel carregar o PDF.</p>';
                previewedFile = null;
            }
            return;
        }

        // Imagens — renderiza visualmente
        if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
            const fileUrl = await window.filesApi.getFileUrl(file.path);
            if (fileUrl && fmPreviewContent) {
                fmPreviewContent.innerHTML = `<img src="${fileUrl}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:6px" alt="${escapeHtml(fileName)}">`;
                previewedFile = { path: file.path, name: fileName, content: '[imagem]' };
            }
            return;
        }

        // Texto e outros — extrai texto
        const result = await window.filesApi.readFile(file.path);
        if (result?.success && result.text) {
            const truncated = result.text.length > 10000 ? '\n\n[... truncado ...]' : '';
            if (fmPreviewContent) fmPreviewContent.textContent = result.text.slice(0, 10000) + truncated;
            previewedFile = { path: file.path, name: fileName, content: result.text };
        } else {
            if (fmPreviewContent) fmPreviewContent.innerHTML = '<p class="fm-preview-placeholder">Nao foi possivel ler este arquivo.</p>';
            previewedFile = null;
        }
    } catch (err) {
        console.error('[FileManager] Preview error:', err);
        if (fmPreviewContent) fmPreviewContent.innerHTML = '<p class="fm-preview-placeholder">Erro ao carregar arquivo.</p>';
        previewedFile = null;
    }
}

function closePreview() {
    if (fmPreview) fmPreview.classList.add('hidden');
    previewedFile = null;
    document.querySelectorAll('.file-card').forEach(c => c.classList.remove('selected'));
}

// Close preview
if (fmPreviewClose) {
    fmPreviewClose.addEventListener('click', closePreview);
}

// "Enviar ao Chat" — attaches file and switches to chat view
if (fmPreviewSend) {
    fmPreviewSend.addEventListener('click', () => {
        if (!previewedFile) return;

        // Set attachment via global function exposed by app.js
        if (typeof window.attachFileToChat === 'function') {
            window.attachFileToChat(previewedFile);
        }

        // Switch to chat view
        const navChat = document.getElementById('nav-chat');
        if (navChat) navChat.click();
        closePreview();
    });
}


function getEmptyStateHTML() {
    return '<div class="empty-state"><p>Selecione um workspace ou abra uma pasta</p></div>';
}
