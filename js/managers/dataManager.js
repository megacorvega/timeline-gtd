import { state } from '../core/state.js';
import { renderProjects } from '../components/views.js';
import { formatDate } from '../core/utils.js';

/* =========================================
   STATE MANAGEMENT (History & Persistence)
   ========================================= */

export function saveState() {
    // Deep copy current state for history
    state.history.push(JSON.parse(JSON.stringify(state.projects)));
    
    if (state.history.length > state.MAX_HISTORY) {
        state.history.shift();
    }
    
    // Clear redo stack on new action
    state.redoStack = [];
    
    saveProjects();
    updateUndoRedoButtons();
}

export function saveProjects() {
    localStorage.setItem('projectTimelineData', JSON.stringify(state.projects));
    localStorage.setItem('projectTimelineDeletedLogs', JSON.stringify(state.deletedProjectLogs));
}

export function loadProjects() {
    const savedData = localStorage.getItem('projectTimelineData');
    let loadedProjects = [];
    
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            if (Array.isArray(parsedData)) {
                loadedProjects = parsedData;
            }
        } catch (error) { 
            console.error("Error parsing projects from localStorage:", error); 
        }
    }
    
    state.projects = loadedProjects;
    
    // --- MIGRATION & NORMALIZATION LOGIC ---
    let hasMigrated = false; // Flag to track changes during migration

    state.projects.forEach(project => {
        // Default properties if missing
        if (!project.originalStartDate) project.originalStartDate = project.startDate;
        if (!project.originalEndDate) project.originalEndDate = project.endDate;
        if (project.locked === undefined) project.locked = false;
        if (!project.phases) project.phases = [];
        if (project.zoomDomain === undefined) project.zoomDomain = null;
        if (!project.logs) project.logs = [];
        if (project.collapsed === undefined) project.collapsed = false;
        
        // Ensure valid date strings
        if (typeof project.startDate !== 'string' || project.startDate.trim() === '') project.startDate = null;
        if (typeof project.endDate !== 'string' || project.endDate.trim() === '') project.endDate = null;

        // Traverse tree for migration
        project.phases.forEach(phase => {
            if (phase.collapsed === undefined) phase.collapsed = false;
            if (phase.locked === undefined) phase.locked = false;
            if (!phase.dependencies) phase.dependencies = [];
            if (!phase.dependents) phase.dependents = [];
            
            phase.tasks.forEach(task => {
                // Migrate Tags (@Tag in name -> tag array)
                if (migrateTagsForItem(task)) hasMigrated = true; 
                
                if (task.collapsed === undefined) task.collapsed = false;
                if (!task.dependencies) task.dependencies = [];
                if (!task.dependents) task.dependents = [];
                
                if (task.subtasks) {
                    task.subtasks.forEach(subtask => {
                        if (migrateTagsForItem(subtask)) hasMigrated = true;
                        if (!subtask.dependencies) subtask.dependencies = [];
                        if (!subtask.dependents) subtask.dependents = [];
                    });
                }
            });
        });
    });
    
    // Save immediately if migration changed data
    if (hasMigrated) {
        saveState();
    }

    // Load Deleted Logs
    const savedDeletedLogs = localStorage.getItem('projectTimelineDeletedLogs');
    if (savedDeletedLogs) {
        try {
            state.deletedProjectLogs = JSON.parse(savedDeletedLogs);
        } catch (error) {
            console.error("Error parsing deleted project logs:", error);
            state.deletedProjectLogs = [];
        }
    }
}

// Helper: Moves inline @tags from names to the .tags array
function migrateTagsForItem(item) {
    if (!item.tags) item.tags = [];
    const regex = /(^|\s)(@[a-zA-Z0-9_\-]+)/g;
    const matches = item.name.match(regex);
    if (matches) {
        matches.forEach(m => {
            const tag = m.trim().substring(1); 
            if (!item.tags.includes(tag)) item.tags.push(tag);
        });
        item.name = item.name.replace(regex, ' ').trim();
        return true; // Indicate change occurred
    }
    return false;
}

/* =========================================
   UNDO / REDO
   ========================================= */

export function undo() {
    if (state.history.length > 0) {
        // Push current to redo
        state.redoStack.push(JSON.parse(JSON.stringify(state.projects)));
        // Pop from history
        state.projects = state.history.pop();
        
        saveProjects();
        renderProjects();
        updateUndoRedoButtons();
    }
}

export function redo() {
    if (state.redoStack.length > 0) {
        // Push current to history
        state.history.push(JSON.parse(JSON.stringify(state.projects)));
        // Pop from redo
        state.projects = state.redoStack.pop();
        
        saveProjects();
        renderProjects();
        updateUndoRedoButtons();
    }
}

export function updateUndoRedoButtons() {
    if (state.elements.undoBtn) state.elements.undoBtn.disabled = state.history.length === 0;
    if (state.elements.redoBtn) state.elements.redoBtn.disabled = state.redoStack.length === 0;
}

/* =========================================
   EXPORTS
   ========================================= */

export function exportToMondayCsv() {
    const headers = [
        "Item Name",
        "Start Date",
        "End Date",
        "Status"
    ];

    const rows = [];

    state.projects.forEach(project => {
        project.phases.forEach(phase => {
            phase.tasks.forEach(task => {
                const hasSubtasks = task.subtasks && task.subtasks.length > 0;

                if (hasSubtasks) {
                    // Export subtasks
                    task.subtasks.forEach(subtask => {
                        const subtaskStatus = subtask.completed ? "Done" : "Working on it";
                        rows.push([
                            `${project.name} > ${phase.name} > ${task.name} > ${subtask.name}`,
                            subtask.startDate || "",
                            subtask.endDate || "",
                            subtaskStatus
                        ]);
                    });
                } else {
                    // Export task
                    const taskStatus = task.completed ? "Done" : "Working on it";
                    rows.push([
                        `${project.name} > ${phase.name} > ${task.name}`,
                        task.effectiveStartDate || "",
                        task.effectiveEndDate || "",
                        taskStatus
                    ]);
                }
            });
        });
    });

    // Helper to escape CSV data
    const escapeCsv = (str) => {
        if (str === null || str === undefined) return '';
        const text = String(str);
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };
    
    let csvContent = headers.map(escapeCsv).join(",") + "\n";
    rows.forEach(row => {
        csvContent += row.map(escapeCsv).join(",") + "\n";
    });

    // Download Logic
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "timeline-export-for-monday.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}