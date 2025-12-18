import { state } from './state.js';
import * as Utils from './utils.js';
import * as DataManager from '../managers/dataManager.js';
import * as TaskManager from '../managers/taskManager.js';
import * as Views from '../components/ganttView.js'; 
import * as Charts from '../components/ganttChart.js';
import * as Modals from '../components/modals.js';
import { showMainTab, updateTabIndicator } from '../components/tabs.js';
import { drawOverallLoadChart } from '../components/ganttChart.js';

export function initEvents() {
    // --- GLOBAL WINDOW/DOCUMENT EVENTS ---

    // Resize Handler (Debounced)
    window.addEventListener('resize', () => {
        clearTimeout(state.resizeTimeout);
        state.resizeTimeout = setTimeout(() => {
            updateTabIndicator();
            // Update the glider for the sub-view (Gantt/Linear) if it exists
            const projectViewGlider = document.getElementById('project-view-glider');
            const activeViewBtn = document.querySelector('#project-view-controls .tab-button.active');
            if(projectViewGlider && activeViewBtn) {
                projectViewGlider.style.width = `${activeViewBtn.offsetWidth}px`;
                projectViewGlider.style.left = `${activeViewBtn.offsetLeft}px`;
            }

            if (state.activeTab === 'projects') {
                state.projects.forEach(project => {
                    if (!project.collapsed && project.startDate && project.endDate) {
                        Charts.drawChart(project);
                    }
                });
            } else if (state.activeTab === 'overall-load') {
                drawOverallLoadChart();
            }
        }, 150);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Toggle Shortcuts Modal (?)
        if (e.key === '?') {
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) || document.activeElement.contentEditable === 'true') return;
            e.preventDefault();
            Modals.toggleShortcutsModal();
        }
        
        // Escape Key
        if(e.key === 'Escape') {
            if (state.elements.shortcutsModal && !state.elements.shortcutsModal.classList.contains('hidden')) {
                Modals.toggleShortcutsModal();
                return;
            }
            if (state.dependencyMode) {
                state.dependencyMode = false;
                state.firstSelectedItem = null;
                if(state.elements.dependencyBanner) state.elements.dependencyBanner.classList.add('hidden');
                Views.renderProjects();
            }
        }

        // Tab Navigation (Ctrl+Alt+Arrows)
        if (Utils.isShortcut(e, 'arrowleft', { ctrl: true, alt: true }) || Utils.isShortcut(e, 'arrowright', { ctrl: true, alt: true })) {
            e.preventDefault();
            const direction = e.key.toLowerCase() === 'arrowleft' ? -1 : 1;
            const currentIndex = state.tabOrder.indexOf(state.activeTab);
            if (currentIndex === -1) return;

            let newIndex = currentIndex + direction;
            if (newIndex < 0) newIndex = state.tabOrder.length - 1;
            else if (newIndex >= state.tabOrder.length) newIndex = 0;

            const newTabName = state.tabOrder[newIndex];
            showMainTab(newTabName);
            document.getElementById(`main-tab-btn-${newTabName}`)?.focus();
        }
    });

    // Close Tag Menus on Outside Click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tag-menu-dropdown') && !e.target.closest('.add-tag-btn')) {
             document.querySelectorAll('.tag-menu-dropdown').forEach(el => el.classList.add('hidden'));
        }
    });

    // Container Delegation (Dynamic Elements)
    const container = document.querySelector('.container');
    if (container) {
        container.addEventListener('click', (e) => {
            // Date Input Icon Wrapper Click -> Trigger Date Picker
            const icon = e.target.closest('.date-input-icon-wrapper');
            if (icon) {
                const input = icon.parentElement.querySelector('.date-input');
                if (input && !input.disabled) {
                    // We assume handleDateTrigger is attached to window by main.js, or we implement it here
                    if (window.timelineApp && window.timelineApp.handleDateTrigger) {
                        window.timelineApp.handleDateTrigger(input);
                    }
                }
                return;
            }

            // Dependency Mode Candidate Click
            if (state.dependencyMode) {
                 const candidate = e.target.closest('.dependency-candidate');
                 if (candidate && window.timelineApp.handleDependencyClick) {
                     window.timelineApp.handleDependencyClick(candidate);
                 }
            }

            // Close move-task dropdowns if clicking outside
            if (!e.target.closest('.move-task-btn') && !e.target.closest('.move-task-dropdown')) {
                document.querySelectorAll('.move-task-dropdown').forEach(d => d.classList.remove('show'));
            }
        });
    }

    // --- UI CONTROLS ---

    // Theme
    state.elements.themeSelect?.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-theme', e.target.value);
        localStorage.setItem('timeline-theme-name', e.target.value);
        Views.renderProjects();
    });

    state.elements.darkModeToggle?.addEventListener('click', () => {
        const isDark = !document.documentElement.classList.contains('dark');
        if (isDark) {
            document.documentElement.classList.add('dark');
            state.elements.lightIcon?.classList.remove('hidden');
            state.elements.darkIcon?.classList.add('hidden');
            localStorage.setItem('timeline-theme-mode', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            state.elements.darkIcon?.classList.remove('hidden');
            state.elements.lightIcon?.classList.add('hidden');
            localStorage.setItem('timeline-theme-mode', 'light');
        }
        Views.renderProjects(); // Re-render charts for theme colors
    });

    // View Switching (Gantt vs Action Hub)
    state.elements.btnViewGantt?.addEventListener('click', () => {
        if(window.timelineApp.setProjectView) window.timelineApp.setProjectView('gantt');
    });
    
    state.elements.btnViewLinear?.addEventListener('click', () => {
        if(window.timelineApp.setProjectView) window.timelineApp.setProjectView('linear');
    });

    // Toolbar Buttons
    state.elements.addProjectBtn?.addEventListener('click', TaskManager.addProject);
    state.elements.undoBtn?.addEventListener('click', DataManager.undo);
    state.elements.redoBtn?.addEventListener('click', DataManager.redo);
    
    state.elements.toggleDeletedLogBtn?.addEventListener('click', () => {
        state.deletedLogCollapsed = !state.deletedLogCollapsed;
        Views.renderDeletedProjectsLog();
    });

    // Modals
    state.elements.saveReasonBtn?.addEventListener('click', Modals.handleSaveReason);
    state.elements.cancelReasonBtn?.addEventListener('click', Modals.handleCancelReason);
    
    state.elements.cancelConfirmBtn?.addEventListener('click', () => {
        if(state.elements.confirmModal) state.elements.confirmModal.classList.add('hidden');
        state.pendingClearDependencies = null;
    });

    state.elements.confirmActionBtn?.addEventListener('click', () => {
        if (state.pendingClearDependencies && window.timelineApp.clearDependencies) {
            window.timelineApp.clearDependencies(state.pendingClearDependencies);
        }
        if(state.elements.confirmModal) state.elements.confirmModal.classList.add('hidden');
        state.pendingClearDependencies = null;
    });

    // Shortcuts Modal
    state.elements.shortcutsBtn?.addEventListener('click', Modals.toggleShortcutsModal);
    state.elements.closeShortcutsBtn?.addEventListener('click', Modals.toggleShortcutsModal);
    state.elements.shortcutsModalBackdrop?.addEventListener('click', Modals.toggleShortcutsModal);
    
    // Filters
    state.elements.upcomingProjectFilter?.addEventListener('change', (e) => {
        state.upcomingProjectFilter = e.target.value;
        if(state.activeTab === 'list' || state.projectViewMode === 'linear') {
            if(window.timelineApp.renderLinearView) window.timelineApp.renderLinearView();
        } else {
            Views.renderProjects();
        }
    });

    // --- IMPORT / EXPORT LOGIC ---
    
    state.elements.exportBtn?.addEventListener('click', () => {
        // 1. JSON Export
        const punchListData = JSON.parse(localStorage.getItem('timelinePunchListData') || '[]');
        const dataToExport = {
            projects: state.projects,
            punchList: punchListData
        };
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = "timeline-data.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // 2. CSV Export (Monday.com format)
        DataManager.exportToMondayCsv();
    });

    state.elements.importBtn?.addEventListener('click', () => {
        state.elements.importFileInput?.click();
    });

    state.elements.importFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0]; 
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (importedData.projects && Array.isArray(importedData.projects)) {
                    state.projects = importedData.projects;
                    DataManager.saveState();
                    Views.renderProjects();
                }
                if (importedData.punchList && Array.isArray(importedData.punchList)) {
                    localStorage.setItem('timelinePunchListData', JSON.stringify(importedData.punchList));
                    // Refresh Inbox if active (assuming punchListApp is global)
                    if (state.activeTab === 'list' && window.punchListApp) {
                        window.punchListApp.loadList();
                    }
                }
            } catch (err) { 
                console.error("Import failed:", err); 
                alert("Failed to import data. Invalid JSON file.");
            }
        };
        reader.readAsText(file); 
        e.target.value = null; // Reset input
    });
}