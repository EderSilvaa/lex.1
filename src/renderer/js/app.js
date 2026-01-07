// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const chatInput = document.querySelector('textarea');
const sendBtn = document.querySelector('.send-btn');

// Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        // Remove active class from all
        navItems.forEach(nav => nav.classList.remove('active'));
        views.forEach(view => view.classList.remove('active'));

        // Add active class to clicked
        // Handle click on icon or span
        const target = e.currentTarget;
        target.classList.add('active');

        // Show corresponding view
        const viewId = target.id.replace('nav-', 'view-');

        // IPC Communication
        if (window.dashboardApi) {
            if (target.id === 'nav-pje') {
                window.dashboardApi.setMode('pje');
            } else {
                window.dashboardApi.setMode('home');
            }
        }

        const view = document.getElementById(viewId);
        if (view) {
            view.classList.add('active');
        } else {
            // Handle special cases without views (like Settings)
            console.log('Clicked:', target.id);
        }
    });
});

// Chat Input Logic
chatInput.addEventListener('input', (e) => {
    if (e.target.value.trim().length > 0) {
        sendBtn.removeAttribute('disabled');
    } else {
        sendBtn.setAttribute('disabled', 'true');
    }
});

// Auto-resize textarea
chatInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Send Message (Mock)
sendBtn.addEventListener('click', () => {
    const text = chatInput.value;
    console.log('Sending message:', text);
    chatInput.value = '';
    sendBtn.setAttribute('disabled', 'true');
    // TODO: Send to Main Process via IPC
});
