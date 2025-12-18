import { state } from '../core/state.js';
import { updateDate } from '../managers/taskManager.js';
import { saveState } from '../managers/dataManager.js';
import { renderProjects } from './ganttView.js';
import { formatDate, parseDate } from '../core/utils.js';

/* =========================================
   DATE INPUT HANDLERS (Triggers Reason Modal)
   ========================================= */

export function formatDateInput(event) {
    let value = event.target.value.replace(/\D/g, '');
    if (value.length > 2) value = value.substring(0, 2) + '/' + value.substring(2);
    if (value.length > 5) value = value.substring(0, 5) + '/' + value.substring(5, 7);
    event.target.value = value;
}

export function handleDateInputKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.target.blur();
    }
}

export function handleManualDateInput(event) {
    const input = event.target;
    const dateStr = input.value;
    
    // Helper to revert input if invalid
    const revert = () => { 
        input.value = input.dataset.date ? formatDate(parseDate(input.dataset.date)) : ''; 
    };

    // Validation
    if (dateStr && !/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) { 
        revert(); 
        return; 
    }

    // Context from data attributes
    const context = { 
        type: input.dataset.type, 
        projectId: parseInt(input.dataset.projectId), 
        phaseId: parseInt(input.dataset.phaseId), 
        taskId: parseInt(input.dataset.taskId), 
        subtaskId: parseInt(input.dataset.subtaskId), 
        element: input 
    };

    // Case 1: Clearing a date
    if (!dateStr) {
        updateDate(context, null);
        return;
    }

    // Parse and Validate Date
    const [month, day, year] = dateStr.split('/').map(p => parseInt(p, 10));
    const dateObj = new Date(year + 2000, month - 1, day);
    
    if (dateObj.getFullYear() !== year + 2000 || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) { 
        revert(); 
        return; 
    }

    const newDate = dateObj.toISOString().split('T')[0];
    const oldDate = input.dataset.date || null;

    // Case 2: New Project Input (No modal needed)
    if (input.dataset.type.startsWith('new-project')) { 
        input.dataset.date = newDate; 
        return; 
    }

    // Case 3: Change Detected -> Trigger Modal
    if (oldDate && oldDate !== newDate) {
        state.pendingDateChange = { context, newDate };
        
        state.elements.reasonModalTitle.textContent = 'Reason for Date Change';
        state.elements.reasonModalDetails.textContent = `Changing date from ${formatDate(parseDate(oldDate))} to ${formatDate(parseDate(newDate))}.`;
        
        state.elements.reasonModal.classList.remove('hidden');
        state.elements.reasonCommentTextarea.focus();
    }
    // Case 4: Setting a new date (from empty) -> No modal forced, just update
    else if (!oldDate && newDate) { 
        updateDate(context, newDate); 
    }
}

/* =========================================
   LOCK TOGGLES (Triggers Reason Modal)
   ========================================= */

export function toggleProjectLock(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    
    const isLocking = !project.locked;
    state.pendingLockChange = {
        type: 'project',
        projectId: projectId,
        newState: isLocking
    };

    state.elements.reasonModalTitle.textContent = isLocking ? 'Reason for Locking Dates' : 'Reason for Unlocking Dates';
    state.elements.reasonModalDetails.textContent = `You are about to ${isLocking ? 'lock' : 'unlock'} the dates for project: "${project.name}".`;
    state.elements.reasonModal.classList.remove('hidden');
    state.elements.reasonCommentTextarea.focus();
}

export function togglePhaseLock(projectId, phaseId) {
    const project = state.projects.find(p => p.id === projectId);
    const phase = project?.phases.find(ph => ph.id === phaseId);
    if (!phase) return;

    const isLocking = !phase.locked;
    state.pendingLockChange = {
        type: 'phase',
        projectId: projectId,
        phaseId: phaseId,
        newState: isLocking
    };

    state.elements.reasonModalTitle.textContent = isLocking ? 'Reason for Locking Dates' : 'Reason for Unlocking Dates';
    state.elements.reasonModalDetails.textContent = `You are about to ${isLocking ? 'lock' : 'unlock'} the dates for phase: "${phase.name}".`;
    state.elements.reasonModal.classList.remove('hidden');
    state.elements.reasonCommentTextarea.focus();
}

/* =========================================
   MODAL ACTIONS (Save/Cancel)
   ========================================= */

export function handleSaveReason() {
    const comment = state.elements.reasonCommentTextarea.value.trim();
    const shouldLog = state.elements.logChangeCheckbox.checked;

    // Validation: Require comment if logging is checked
    if (!comment && shouldLog) { 
        state.elements.reasonCommentTextarea.classList.add('border-red-500', 'ring-red-500');
        setTimeout(() => state.elements.reasonCommentTextarea.classList.remove('border-red-500', 'ring-red-500'), 2000);
        return;
    }

    // 1. Handle Date Change
    if (state.pendingDateChange) {
        updateDate(state.pendingDateChange.context, state.pendingDateChange.newDate, comment, shouldLog);
    } 
    // 2. Handle Deletion (Pending state set by TaskManager)
    else if (state.pendingDeletion) {
        const { type, logContext, deleteFn, itemName } = state.pendingDeletion;

        if (shouldLog) {
            if (type === 'project') {
                state.deletedProjectLogs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
            } else {
                const project = state.projects.find(p => p.id === logContext.projectId);
                if (project) {
                    if (!project.logs) project.logs = [];
                    project.logs.push({ timestamp: new Date().toISOString(), item: itemName, type: 'deletion', comment: comment });
                }
            }
        }
        deleteFn(); // Execute the closure passed from TaskManager
        saveState();
        renderProjects();
    } 
    // 3. Handle Lock Change
    else if (state.pendingLockChange) {
        const { type, projectId, phaseId, newState } = state.pendingLockChange;
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;

        let item, itemName;
        if (type === 'project') {
            item = project;
            itemName = `Project '${project.name}'`;
        } else {
            item = project.phases.find(ph => ph.id === phaseId);
            itemName = `Phase '${item.name}'`;
        }

        if (item) {
            item.locked = newState;
            if (shouldLog) {
                const logType = newState ? 'lock' : 'unlock';
                if (!project.logs) project.logs = [];
                project.logs.push({
                    timestamp: new Date().toISOString(),
                    item: itemName,
                    type: logType,
                    comment: comment
                });
            }
            saveState();
            renderProjects();
        }
    }

    // Cleanup
    state.elements.reasonModal.classList.add('hidden');
    state.elements.reasonCommentTextarea.value = '';
    state.elements.logChangeCheckbox.checked = true;
    state.pendingDateChange = null;
    state.pendingDeletion = null;
    state.pendingLockChange = null;
}

export function handleCancelReason() {
    state.elements.reasonModal.classList.add('hidden');
    state.elements.reasonCommentTextarea.value = '';
    state.elements.logChangeCheckbox.checked = true;
    
    // Refresh to revert any UI changes (like invalid dates in inputs)
    renderProjects();
    
    state.pendingDateChange = null;
    state.pendingDeletion = null;
    state.pendingLockChange = null;
}

/* =========================================
   SHORTCUTS MODAL
   ========================================= */

export function toggleShortcutsModal() {
    if (state.elements.shortcutsModal) {
        state.elements.shortcutsModal.classList.toggle('hidden');
    }
}
