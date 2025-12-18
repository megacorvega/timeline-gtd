import { state } from '../core/state.js';
import { drawChart, drawOverallLoadChart } from './ganttChart.js';

// --- INITIALIZATION ---

export function loadTabData() {
    const savedTab = localStorage.getItem('timelineActiveTab');
    if (savedTab) state.activeTab = savedTab;

    const savedOrder = localStorage.getItem('timelineTabOrder');
    if (savedOrder) {
        try {
            const parsedOrder = JSON.parse(savedOrder);
            // Validate that the saved order contains valid keys
            if(Array.isArray(parsedOrder) && parsedOrder.length === state.tabOrder.length && parsedOrder.every(t => state.tabOrder.includes(t))) {
                state.tabOrder = parsedOrder;
            }
        } catch(e) { console.error("Could not parse tab order", e); }
    }
}

// --- RENDERING ---

export function renderTabs() {
    state.elements.mainTabs.innerHTML = '';
    
    // Create the "Glider" (the sliding underline)
    const glider = document.createElement('div');
    glider.className = 'glider';
    state.elements.mainTabs.appendChild(glider);

    const tabNames = {
        list: 'Inbox',           // 1. Capture
        projects: 'Projects',    // 2. Organize & Engage
        'overall-load': 'Review' // 3. Reflect
    };

    // Render buttons in the user's preferred order
    state.tabOrder.forEach(tabKey => {
        if (!tabNames[tabKey]) return;

        const button = document.createElement('button');
        button.id = `main-tab-btn-${tabKey}`;
        button.className = 'tab-button';
        button.textContent = tabNames[tabKey];
        button.dataset.tabName = tabKey;
        button.setAttribute('draggable', true);
        button.onclick = () => showMainTab(tabKey);
        state.elements.mainTabs.appendChild(button);
    });
    
    // Fallback if active tab is invalid
    if (!tabNames[state.activeTab]) {
        state.activeTab = 'list';
    }
    
    // Add the Drag & Drop event listeners to the container
    addDragAndDropListeners();
    
    // Show the initial tab
    showMainTab(state.activeTab, false);
}

export function showMainTab(tabName, save = true) {
    if (save) {
        state.activeTab = tabName;
        localStorage.setItem('timelineActiveTab', tabName);
    }
    
    updateTabIndicator();

    // Toggle visibility of the Project View Switcher (Gantt vs Action Hub)
    // Only show these controls when on the "Projects" tab
    if (tabName === 'projects') {
        state.elements.projectViewControls.classList.remove('hidden');
        // Update the indicator after un-hiding so dimensions are correct
        updateProjectViewIndicator(); 
    } else {
        state.elements.projectViewControls.classList.add('hidden');
    }

    // Hide all panels / Deactivate all buttons
    ['projects', 'list', 'overall-load'].forEach(name => {
        const panel = document.getElementById(`main-tab-panel-${name}`);
        const btn = document.getElementById(`main-tab-btn-${name}`);
        if (panel) panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
    });

    // Show active panel / Activate button
    const activePanel = document.getElementById(`main-tab-panel-${tabName}`);
    const activeBtn = document.getElementById(`main-tab-btn-${tabName}`);
    if (activePanel) activePanel.classList.remove('hidden');
    if (activeBtn) activeBtn.classList.add('active');

    // Trigger tab-specific renders
    if (tabName === 'projects') {
        state.projects.forEach(project => {
            if (!project.collapsed && project.startDate && project.endDate) {
                drawChart(project);
            }
        });
    } else if (tabName === 'overall-load') {
        drawOverallLoadChart();
    } else if (tabName === 'list') {
        // Initialize the Punchlist (Inbox) app if it exists globally
        if (window.punchListApp && window.punchListApp.init) {
            window.punchListApp.init();
        }
    }
}

export function updateTabIndicator() {
    setTimeout(() => {
        const container = state.elements.mainTabs;
        if (!container) return;
        
        const activeTab = container.querySelector('.tab-button.active');
        const glider = container.querySelector('.glider');
        
        if (!glider || !activeTab) return;

        glider.style.width = `${activeTab.offsetWidth}px`;
        glider.style.left = `${activeTab.offsetLeft}px`;
    }, 50); // Small delay to ensure layout is calculated
}

// Helper for the sub-view switcher (Gantt vs Linear)
function updateProjectViewIndicator() {
    setTimeout(() => {
        const container = state.elements.projectViewControls;
        if (!container || container.classList.contains('hidden')) return;
        
        const activeBtn = container.querySelector('.tab-button.active');
        const glider = state.elements.projectViewGlider;
        
        if (activeBtn && glider) {
            glider.style.width = `${activeBtn.offsetWidth}px`;
            glider.style.left = `${activeBtn.offsetLeft}px`;
        }
    }, 50);
}

// --- DRAG & DROP LOGIC ---

function addDragAndDropListeners() {
    const tabsContainer = state.elements.mainTabs;
    let draggedItem = null;

    // Remove old listeners to prevent duplicates if re-rendered? 
    // Since we recreate the buttons, listeners on buttons are new, 
    // but listeners on the container might stack if we aren't careful.
    // However, in this architecture, renderTabs is usually called once or on full reset.
    // To be safe, we can clone the node to strip listeners, but usually not strictly necessary here.

    tabsContainer.addEventListener('dragstart', (e) => {
        if (!e.target.classList.contains('tab-button')) return;
        draggedItem = e.target;
        setTimeout(() => {
            e.target.classList.add('dragging');
        }, 0);
    });

    tabsContainer.addEventListener('dragend', (e) => {
        draggedItem?.classList.remove('dragging');
        draggedItem = null;
        document.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
            el.classList.remove('drag-over-left', 'drag-over-right');
        });
    });

    tabsContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(tabsContainer, e.clientX);
        document.querySelectorAll('.drag-over-left, .drag-over-right').forEach(el => {
            el.classList.remove('drag-over-left', 'drag-over-right');
        });

        if (afterElement == null) {
            // Find the last tab-button, not the glider
            const lastChild = tabsContainer.querySelector('.tab-button:last-of-type');
            if(lastChild) lastChild.classList.add('drag-over-right');
        } else {
            afterElement.classList.add('drag-over-left');
        }
    });

    tabsContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if(!draggedItem) return;

        const afterElement = getDragAfterElement(tabsContainer, e.clientX);
        const draggedTab = draggedItem.dataset.tabName;
        const newOrder = [...state.tabOrder];
        
        // Remove dragged item from old position
        newOrder.splice(newOrder.indexOf(draggedTab), 1);

        if (afterElement == null) {
            // Add to end
            newOrder.push(draggedTab);
        } else {
            // Add before the reference element
            const referenceTab = afterElement.dataset.tabName;
            const index = newOrder.indexOf(referenceTab);
            newOrder.splice(index, 0, draggedTab);
        }

        state.tabOrder = newOrder;
        localStorage.setItem('timelineTabOrder', JSON.stringify(state.tabOrder));
        
        // Re-render to reflect new DOM order
        renderTabs();
        
        // Ensure the active tab remains visually active
        showMainTab(state.activeTab, false);
    });
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll('.tab-button:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}