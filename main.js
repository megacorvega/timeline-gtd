// Change these from './core/...' to './core/...' ONLY if main.js is in the /js folder
import { state } from './core/state.js';
import * as Utils from './core/utils.js';
import * as DataManager from './managers/dataManager.js';
import * as TaskManager from './managers/taskManager.js';
import * as DependencyManager from './managers/dependencyManager.js';
import * as GanttView from './components/ganttView.js';
import * as LinearView from './components/linearView.js';
import * as Charts from './components/charts.js';
import * as Modals from './components/modals.js';
import * as Tabs from './components/tabs.js';
import { initEvents } from './core/events.js';

// --- INITIALIZATION ---

function init() {
    console.log("Timeline App Initializing...");
    
    // 1. Cache DOM Elements
    cacheDOMElements();

    // 2. Load Data & State
    DataManager.loadProjects();
    Tabs.loadTabData();
    TaskManager.ensureSingleActionsProject(); // Ensure "Single Actions" container exists

    // 3. Setup D3 Scales/Configs
    state.taskLoadChartColor = d3.scaleOrdinal(d3.schemeTableau10);

    // 4. Render Initial Views
    Tabs.renderTabs(); // This will trigger showMainTab -> renderProjects/LinearView
    
    // 5. Initialize Global Event Listeners
    initEvents();

    // 6. Check for Theme Preference
    const savedTheme = localStorage.getItem('timeline-theme-mode');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        if(state.elements.lightIcon) state.elements.lightIcon.classList.remove('hidden');
        if(state.elements.darkIcon) state.elements.darkIcon.classList.add('hidden');
    }
}

function cacheDOMElements() {
    state.elements = {
        // Containers
        projectsContainer: document.getElementById('projects-container'),
        mainTabs: document.getElementById('main-tabs'),
        
        // Inputs
        newProjectNameInput: document.getElementById('new-project-name'),
        importFileInput: document.getElementById('import-file'),
        
        // Buttons
        addProjectBtn: document.getElementById('add-project-btn'),
        undoBtn: document.getElementById('undo-btn'),
        redoBtn: document.getElementById('redo-btn'),
        exportBtn: document.getElementById('export-btn'),
        importBtn: document.getElementById('import-btn'),
        
        // Modals - Reason
        reasonModal: document.getElementById('reason-modal'),
        reasonModalTitle: document.getElementById('reason-modal-title'),
        reasonModalDetails: document.getElementById('reason-modal-details'),
        reasonCommentTextarea: document.getElementById('reason-comment'),
        logChangeCheckbox: document.getElementById('log-change'),
        saveReasonBtn: document.getElementById('save-reason-btn'),
        cancelReasonBtn: document.getElementById('cancel-reason-btn'),
        
        // Modals - Shortcuts
        shortcutsModal: document.getElementById('shortcuts-modal'),
        shortcutsBtn: document.getElementById('shortcuts-btn'),
        closeShortcutsBtn: document.getElementById('close-shortcuts-btn'),
        shortcutsModalBackdrop: document.getElementById('shortcuts-modal-backdrop'),

        // Modals - Confirm
        confirmModal: document.getElementById('confirm-modal'),
        confirmModalTitle: document.getElementById('confirm-modal-title'),
        confirmModalDetails: document.getElementById('confirm-modal-details'),
        confirmActionBtn: document.getElementById('confirm-action-btn'),
        cancelConfirmBtn: document.getElementById('cancel-confirm-btn'),

        // Deleted Log
        deletedProjectsLogContainer: document.getElementById('deleted-projects-log'),
        toggleDeletedLogBtn: document.getElementById('toggle-deleted-log-btn'),

        // Theme
        themeSelect: document.getElementById('theme-select'), // If using select
        darkModeToggle: document.getElementById('dark-mode-toggle'),
        darkIcon: document.getElementById('dark-icon'),
        lightIcon: document.getElementById('light-icon'),

        // View Controls (Linear vs Gantt)
        projectViewControls: document.getElementById('project-view-controls'),
        projectViewGlider: document.getElementById('project-view-glider'),
        btnViewGantt: document.getElementById('btn-view-gantt'),
        btnViewLinear: document.getElementById('btn-view-linear'),
        
        // Filters
        upcomingProjectFilter: document.getElementById('upcoming-project-filter'),
        
        // Dependency Banner
        dependencyBanner: document.getElementById('dependency-mode-banner')
    };
}

// --- GLOBAL API EXPOSURE ---
// This bridges the ES Modules to the HTML `onclick` attributes.

window.timelineApp = {
    // Managers
    ...TaskManager,
    ...DataManager,
    ...DependencyManager,
    
    // Components
    ...GanttView,
    ...LinearView,
    ...Charts,
    ...Modals,
    ...Tabs,
    ...Utils,

    // Specific UI Logic often called from HTML
    setProjectView: (mode) => {
        state.projectViewMode = mode;
        const ganttBtn = document.getElementById('btn-view-gantt');
        const linearBtn = document.getElementById('btn-view-linear');
        const glider = document.getElementById('project-view-glider');

        if (mode === 'gantt') {
            ganttBtn?.classList.add('active');
            linearBtn?.classList.remove('active');
            if(glider && ganttBtn) {
                glider.style.width = `${ganttBtn.offsetWidth}px`;
                glider.style.left = `${ganttBtn.offsetLeft}px`;
            }
        } else {
            linearBtn?.classList.add('active');
            ganttBtn?.classList.remove('active');
            if(glider && linearBtn) {
                glider.style.width = `${linearBtn.offsetWidth}px`;
                glider.style.left = `${linearBtn.offsetLeft}px`;
            }
        }
        GanttView.renderProjects(); // Controller for rendering either view
    },

    setTagFilter: (tag) => {
        state.tagFilter = tag;
        LinearView.renderLinearView();
    },

    toggleHideCompleted: () => {
        state.hideCompletedTasks = !state.hideCompletedTasks;
        LinearView.renderLinearView();
    },

    // View Navigation Helper
    navigateToTask: (projectId, phaseId, taskId, subtaskId) => {
        // 1. Switch to Gantt View
        window.timelineApp.setProjectView('gantt');
        
        // 2. Ensure project is expanded
        const project = state.projects.find(p => p.id === projectId);
        if (project) {
            project.collapsed = false;
            
            // 3. Ensure phase is expanded
            const phase = project.phases.find(ph => ph.id === phaseId);
            if (phase) {
                phase.collapsed = false;
                
                // 4. Ensure task is expanded if subtask
                if (subtaskId && subtaskId !== 'null') {
                    const task = phase.tasks.find(t => t.id === taskId);
                    if (task) task.collapsed = false;
                }
            }
            DataManager.saveState();
        }

        // 3. Render and Scroll
        GanttView.renderProjects();
        setTimeout(() => {
            let selector = `[data-id="${taskId}"]`;
            if (subtaskId && subtaskId !== 'null') selector = `[data-id="${subtaskId}"]`;
            
            const element = document.querySelector(selector);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('highlight-pulse');
                setTimeout(() => element.classList.remove('highlight-pulse'), 2000);
            }
        }, 100);
    },

    // Generic Editable Handler (Called by makeEditable in HTML)
    makeEditable: (element, updateFunctionName, ...args) => {
        const originalText = element.innerText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'inline-input font-inherit w-full bg-white dark:bg-slate-700 border border-blue-400 rounded px-1';
        
        element.replaceWith(input);
        input.focus();
        
        const save = () => {
            const newText = input.value.trim();
            if (newText && newText !== originalText) {
                // Dynamically call the function name passed as string
                if (TaskManager[updateFunctionName]) {
                    TaskManager[updateFunctionName](...args, newText);
                }
            } else {
                input.replaceWith(element);
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = originalText; // Revert
                input.blur();
            }
        });
    },

    // Dependency Interaction Handlers (Circle Clicks)
    startDependencyMode: (itemId) => {
        state.dependencyMode = true;
        state.firstSelectedItem = { id: itemId };
        
        const banner = state.elements.dependencyBanner;
        if(banner) {
            banner.classList.remove('hidden');
            banner.innerHTML = `
                <div class="flex items-center justify-between w-full">
                    <span><strong>Dependency Mode:</strong> Select the item that drives this item.</span>
                    <button onclick="timelineApp.cancelDependencyMode()" class="bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs ml-4">Cancel (Esc)</button>
                </div>
            `;
        }
        GanttView.renderProjects(); // Re-render to show candidate circles
    },

    handleDependencyClick: (targetElement) => {
        const targetId = parseInt(targetElement.closest('[data-id]').dataset.id);
        const sourceId = state.firstSelectedItem.id;

        if (targetId === sourceId) return; // Can't depend on self

        // Find items
        let sourceItem, targetItem;
        state.projects.forEach(p => p.phases.forEach(ph => {
            if (ph.id === sourceId) sourceItem = ph;
            if (ph.id === targetId) targetItem = ph;
            ph.tasks.forEach(t => {
                if (t.id === sourceId) sourceItem = t;
                if (t.id === targetId) targetItem = t;
                if (t.subtasks) t.subtasks.forEach(st => {
                     if (st.id === sourceId) sourceItem = st;
                     if (st.id === targetId) targetItem = st;
                });
            });
        }));

        if (sourceItem && targetItem) {
            // Apply Dependency: Source Depends on Target
            if (!sourceItem.dependencies) sourceItem.dependencies = [];
            if (!sourceItem.dependencies.includes(targetId)) {
                sourceItem.dependencies.push(targetId);
                
                if (!targetItem.dependents) targetItem.dependents = [];
                if (!targetItem.dependents.includes(sourceId)) {
                    targetItem.dependents.push(sourceId);
                }
                
                DataManager.saveState();
            }
        }
        
        window.timelineApp.cancelDependencyMode();
    },

    cancelDependencyMode: () => {
        state.dependencyMode = false;
        state.firstSelectedItem = null;
        if(state.elements.dependencyBanner) state.elements.dependencyBanner.classList.add('hidden');
        GanttView.renderProjects();
    },

    handleCircleClick: (itemId) => {
        // Check if item has dependencies to clear
        let item;
        state.projects.forEach(p => p.phases.forEach(ph => {
            if (ph.id === itemId) item = ph;
            ph.tasks.forEach(t => {
                if (t.id === itemId) item = t;
                if (t.subtasks) t.subtasks.forEach(st => { if (st.id === itemId) item = st; });
            });
        }));

        if (item && item.dependencies && item.dependencies.length > 0) {
            state.pendingClearDependencies = itemId;
            state.elements.confirmModalTitle.textContent = "Clear Dependencies?";
            state.elements.confirmModalDetails.textContent = "This will remove the link to the driving task. Dates will no longer update automatically.";
            state.elements.confirmModal.classList.remove('hidden');
        } else {
            // If no dependencies, maybe start dependency mode?
            // (Optional behavior, sticking to original design where right circle starts mode, left circle shows info)
        }
    },

    clearDependencies: (itemId) => {
        TaskManager.removeAllDependencies(itemId);
        DataManager.saveState();
        GanttView.renderProjects();
    },

    // Tooltip Helpers
    showDependencyTooltip: (event, itemId) => {
        let item;
        state.projects.forEach(p => p.phases.forEach(ph => {
            if (ph.id === itemId) item = ph;
            ph.tasks.forEach(t => {
                if (t.id === itemId) item = t;
                if (t.subtasks) t.subtasks.forEach(st => { if (st.id === itemId) item = st; });
            });
        }));

        if (!item) return;

        const depNames = (item.dependencies || []).map(id => getItemName(id)).join(', ');
        const drivenNames = (item.dependents || []).map(id => getItemName(id)).join(', ');

        let text = '';
        if (depNames) text += `<strong>Depends on:</strong> ${depNames}<br>`;
        if (drivenNames) text += `<strong>Drives:</strong> ${drivenNames}`;

        if (text) {
            let tooltip = document.getElementById('dependency-tooltip');
            if (!tooltip) {
                tooltip = document.createElement('div');
                tooltip.id = 'dependency-tooltip';
                tooltip.className = 'chart-tooltip'; // Reuse chart tooltip style
                document.body.appendChild(tooltip);
            }
            tooltip.innerHTML = text;
            tooltip.style.visibility = 'visible';
            tooltip.style.top = (event.pageY + 15) + 'px';
            tooltip.style.left = (event.pageX + 15) + 'px';
        }
    },

    hideDependencyTooltip: () => {
        const tooltip = document.getElementById('dependency-tooltip');
        if (tooltip) tooltip.style.visibility = 'hidden';
    },
    
    // Print View Generator
    generatePrintView: (projectId) => {
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;

        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        
        // Collect flatten items for the print chart
        const items = [];
        project.phases.forEach(phase => {
            items.push({ ...phase, level: 1, type: 'phase' });
            phase.tasks.forEach(task => {
                items.push({ ...task, level: 2, type: 'task' });
                if (task.subtasks) {
                    task.subtasks.forEach(st => items.push({ ...st, level: 3, type: 'subtask' }));
                }
            });
        });

        const styles = `
            body { font-family: sans-serif; padding: 20px; }
            h1 { text-align: center; }
            .gantt-container { width: 100%; height: 800px; margin-top: 20px; }
            .gantt-bar-bg { fill: #e5e7eb; }
            .gantt-bar-progress { fill: #3b82f6; }
            .axis text { font-size: 10px; }
            .today-line { stroke: red; stroke-dasharray: 4; stroke-width: 1px; }
            .phase-divider-line { stroke: #ddd; stroke-dasharray: 2; }
        `;

        printWindow.document.write(`
            <html>
            <head>
                <title>Project Plan - ${project.name}</title>
                <style>${styles}</style>
                <script src="https://d3js.org/d3.v7.min.js"></script>
            </head>
            <body>
                <h1>${project.name}</h1>
                <div id="print-chart" class="gantt-container"></div>
                <script>
                    // We inject the necessary drawing functions directly or assume simple logic
                    // Since we can't easily import modules into a blank window without a server setup,
                    // we will pass the data object and a simplified script.
                    
                    const project = ${JSON.stringify(project)};
                    const items = ${JSON.stringify(items)};
                    
                    // Simple D3 Logic (Injected for Print Window)
                    const container = document.getElementById('print-chart');
                    const width = container.clientWidth;
                    const height = container.clientHeight;
                    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
                    
                    const svg = d3.select(container).append("svg")
                        .attr("width", width)
                        .attr("height", height);
                        
                    const parseDate = d3.timeParse("%Y-%m-%d");
                    const startDate = parseDate(project.startDate);
                    const endDate = parseDate(project.endDate);
                    
                    const x = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
                    const y = d3.scaleBand().domain(items.map(d => d.id)).range([0, height]).padding(0.4);
                    
                    svg.append("g")
                       .attr("transform", "translate(0," + (height - 20) + ")")
                       .call(d3.axisBottom(x));
                       
                    svg.selectAll(".bar")
                       .data(items.filter(d => d.startDate && d.endDate))
                       .enter().append("rect")
                       .attr("fill", d => d.completed ? "#22c55e" : "#3b82f6")
                       .attr("x", d => x(parseDate(d.startDate)))
                       .attr("y", d => y(d.id))
                       .attr("width", d => x(parseDate(d.endDate)) - x(parseDate(d.startDate)))
                       .attr("height", y.bandwidth());
                       
                    svg.selectAll(".label")
                       .data(items)
                       .enter().append("text")
                       .attr("x", 5)
                       .attr("y", d => y(d.id) + y.bandwidth()/1.5)
                       .text(d => d.name)
                       .attr("font-size", "10px")
                       .attr("fill", "#000");

                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
};

// Helper for tooltips
function getItemName(id) {
    let name = '';
    state.projects.forEach(p => p.phases.forEach(ph => {
        if (ph.id === id) name = ph.name;
        ph.tasks.forEach(t => {
            if (t.id === id) name = t.name;
            if (t.subtasks) t.subtasks.forEach(st => { if (st.id === id) name = st.name; });
        });
    }));
    return name || 'Unknown Item';
}

// Start
document.addEventListener('DOMContentLoaded', init);
