import { state } from '../core/state.js';
import { saveState } from './dataManager.js';
import { renderProjects } from '../components/ganttView.js'; 
import { drawChart } from '../components/ganttChart.js';

const SINGLE_ACTIONS_PROJECT_ID = 999999; 

/* =========================================
   GTD & ACTION HUB LOGIC
   ========================================= */

// Ensures the hidden "Single Actions" project exists to hold loose tasks
export function ensureSingleActionsProject() {
    let project = state.projects.find(p => p.id === SINGLE_ACTIONS_PROJECT_ID);
    if (!project) {
        project = {
            id: SINGLE_ACTIONS_PROJECT_ID,
            name: "Single Actions",
            isSystem: true, // Marker to hide from Gantt view
            collapsed: true,
            phases: [{
                id: SINGLE_ACTIONS_PROJECT_ID + 1,
                name: "General",
                tasks: []
            }],
            logs: []
        };
        state.projects.push(project);
    }
    return project;
}

// Moves a task from the Inbox directly to the Action Hub
export function moveInboxTaskToSingleActions(taskName) {
    if (!taskName || !taskName.trim()) return;
    const project = ensureSingleActionsProject();
    const phase = project.phases[0];
    
    phase.tasks.push({
        id: Date.now(),
        name: taskName,
        startDate: new Date().toISOString().split('T')[0], // Defaults to Today
        endDate: null,
        completed: false,
        subtasks: [],
        dependencies: [],
        tags: ['Action Hub'] 
    });
    
    saveState();
    renderProjects();
}

/* =========================================
   DELEGATION LOGIC
   ========================================= */

export function delegateTask(projectId, phaseId, taskId, personName) {
    const project = state.projects.find(p => p.id === projectId);
    const task = project?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    
    if (task) {
        task.delegatedTo = personName; 
        task.isFollowUp = true; 
        
        // Auto-set follow up date to 3 days out if not set
        if (!task.followUpDate) {
            const d = new Date();
            d.setDate(d.getDate() + 3);
            task.followUpDate = d.toISOString().split('T')[0];
        }
        
        if (!project.logs) project.logs = [];
        project.logs.push({
            timestamp: new Date().toISOString(),
            item: `Task '${task.name}'`,
            type: 'delegation',
            comment: `Delegated to ${personName}`
        });

        saveState();
        renderProjects();
    }
}

export function revokeDelegation(projectId, phaseId, taskId) {
    const project = state.projects.find(p => p.id === projectId);
    const task = project?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    
    if (task) {
        delete task.delegatedTo;
        // We do NOT automatically remove isFollowUp, user might still be waiting on date
        saveState();
        renderProjects();
    }
}

/* =========================================
   INBOX TO PROJECT MOVE LOGIC
   ========================================= */

export function promptMoveToProject(taskText, isFollowUp, successCallback) {
    // 1. Filter valid targets (exclude System projects like Single Actions)
    const validProjects = state.projects.filter(p => !p.isSystem);

    if (validProjects.length === 0) {
        alert("No projects available. Please create a project first.");
        return;
    }

    // 2. Build a simple selection dialog dynamically
    const dialogId = 'move-task-dialog';
    let dialog = document.getElementById(dialogId);
    if (dialog) dialog.remove();

    const projectOptions = validProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const html = `
        <div id="${dialogId}" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-2xl w-96 border border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-4 dark:text-white">Move to Project</h3>
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Select Project</label>
                    <select id="${dialogId}-project" class="w-full p-2 border rounded dark:bg-slate-700 dark:border-gray-600 dark:text-white">
                        ${projectOptions}
                    </select>
                </div>
                <div class="mb-6">
                    <label class="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Select Phase</label>
                    <select id="${dialogId}-phase" class="w-full p-2 border rounded dark:bg-slate-700 dark:border-gray-600 dark:text-white">
                        </select>
                </div>
                <div class="flex justify-end gap-2">
                    <button id="${dialogId}-cancel" class="px-4 py-2 text-gray-500 hover:text-gray-700">Cancel</button>
                    <button id="${dialogId}-confirm" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Move Task</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    // 3. Logic to handle the dialog
    const projectSelect = document.getElementById(`${dialogId}-project`);
    const phaseSelect = document.getElementById(`${dialogId}-phase`);
    const cancelBtn = document.getElementById(`${dialogId}-cancel`);
    const confirmBtn = document.getElementById(`${dialogId}-confirm`);
    const dialogEl = document.getElementById(dialogId);

    const populatePhases = () => {
        const pid = parseInt(projectSelect.value);
        const project = state.projects.find(p => p.id === pid);
        if (project) {
            phaseSelect.innerHTML = project.phases.map(ph => `<option value="${ph.id}">${ph.name}</option>`).join('');
        }
    };

    projectSelect.addEventListener('change', populatePhases);
    populatePhases(); // Init

    cancelBtn.onclick = () => dialogEl.remove();

    confirmBtn.onclick = () => {
        const projectId = parseInt(projectSelect.value);
        const phaseId = parseInt(phaseSelect.value);
        
        const project = state.projects.find(p => p.id === projectId);
        const phase = project?.phases.find(ph => ph.id === phaseId);

        if (phase) {
            // Create the task
            phase.tasks.push({
                id: Date.now(),
                name: taskText,
                startDate: new Date().toISOString().split('T')[0],
                endDate: null,
                completed: false,
                isFollowUp: isFollowUp, // Preserve follow-up status from Punchlist
                subtasks: [],
                dependencies: [],
                dependents: []
            });
            saveState();
            renderProjects();
            dialogEl.remove();
            if (successCallback) successCallback();
        }
    };
}


/* =========================================
   STANDARD CRUD OPERATIONS
   ========================================= */

export function addProject() {
    const name = state.elements.newProjectNameInput.value.trim(); 
    if (!name) return;
    
    const startDateInput = document.getElementById('new-project-start-date');
    const endDateInput = document.getElementById('new-project-end-date');
    const startDate = startDateInput.dataset.date || null; 
    const endDate = endDateInput.dataset.date || null;
    
    const defaultPhaseNames = ["Initiation", "Evaluation", "Disposition", "Implementation", "Release"];
    const baseId = Date.now();
    const phases = defaultPhaseNames.map((phaseName, index) => ({
        id: baseId + index + 1,
        name: phaseName,
        startDate: null,
        endDate: null,
        collapsed: false,
        tasks: [], dependencies: [], dependents: []
    }));

    state.projects.push({ 
        id: baseId, name, startDate, endDate, 
        originalStartDate: startDate, originalEndDate: endDate, 
        collapsed: false, phases: phases, logs: [], zoomDomain: null 
    });

    saveState();
    state.elements.newProjectNameInput.value = '';
    startDateInput.value = ''; endDateInput.value = '';
    delete startDateInput.dataset.date; delete endDateInput.dataset.date;
    renderProjects();
}

export function addPhase(projectId) {
    const nameInput = document.getElementById(`new-phase-name-${projectId}`);
    const name = nameInput.value.trim(); 
    if (!name) return;
    
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
        project.phases.push({ 
            id: Date.now(), 
            name, 
            startDate: null, 
            endDate: null, 
            collapsed: false, 
            tasks: [], dependencies: [], dependents: [] 
        });
        saveState();
        renderProjects();
    }
}

export function addTask(projectId, phaseId) {
    const nameInput = document.getElementById(`new-task-name-${phaseId}`);
    const name = nameInput.value.trim(); 
    if (!name) return;
    
    const phase = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId);
    if (phase) { 
        phase.tasks.push({ 
            id: Date.now(), 
            name, 
            startDate: null, 
            endDate: null, 
            completed: false, 
            subtasks: [], dependencies: [], dependents: [] 
        }); 
        saveState(); 
        renderProjects(); 
    }
}

export function addSubtask(projectId, phaseId, taskId) {
    const nameInput = document.getElementById(`new-subtask-name-${taskId}`);
    const name = nameInput.value.trim(); 
    if (!name) return;
    
    const task = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    if (task) { 
        if (!task.subtasks) task.subtasks = []; 
        task.subtasks.push({ 
            id: Date.now(), 
            name, 
            startDate: null, 
            endDate: null, 
            completed: false, 
            dependencies: [], dependents: [] 
        }); 
        nameInput.value = ''; 
        saveState(); 
        renderProjects(); 
    }
}

/* =========================================
   UPDATE & TOGGLE OPERATIONS
   ========================================= */

export function toggleTaskComplete(projectId, phaseId, taskId) { 
    const t = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId); 
    if (t) { 
        t.completed = !t.completed; 
        saveState(); 
        renderProjects(); 
    } 
}

export function toggleSubtaskComplete(projectId, phaseId, taskId, subtaskId) { 
    const s = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(st => st.id === subtaskId); 
    if (s) { 
        s.completed = !s.completed; 
        saveState(); 
        renderProjects(); 
    } 
}

export function toggleTaskFollowUp(projectId, phaseId, taskId) {
    const task = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    if (task) {
        task.isFollowUp = !task.isFollowUp;
        if (task.isFollowUp && !task.followUpDate) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            task.followUpDate = tomorrow.toISOString().split('T')[0];
        }
        saveState();
        renderProjects();
    }
}

export function toggleSubtaskFollowUp(projectId, phaseId, taskId, subtaskId) {
    const task = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    const subtask = task?.subtasks.find(st => st.id === subtaskId);
    if (subtask) {
        subtask.isFollowUp = !subtask.isFollowUp;
        if (subtask.isFollowUp && !subtask.followUpDate) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            subtask.followUpDate = tomorrow.toISOString().split('T')[0];
        }
        saveState();
        renderProjects();
    }
}

export function updateDate(context, value, comment = null, shouldLog = true) {
    const { projectId, phaseId, taskId, subtaskId, type } = context; 
    const project = state.projects.find(p => p.id === projectId); 
    if (!project) return; 
    
    let targetItem, dateField, itemName;
    
    // Determine Target Item
    if (type.startsWith('project')) { 
        targetItem = project; 
        dateField = type.endsWith('start') ? 'startDate' : 'endDate'; 
        itemName = `Project '${project.name}' ${dateField.replace('Date','')} date`; 
    } else {
        const phase = project.phases.find(ph => ph.id === phaseId); 
        if (!phase) return;
        
        if (type.startsWith('phase')) {
            targetItem = phase;
            dateField = type.endsWith('start') ? 'startDate' : 'endDate';
            itemName = `Phase '${phase.name}' ${dateField.replace('Date','')} date`;
        } else {
            const task = phase.tasks.find(t => t.id === taskId); 
            if (!task) return; 
            itemName = `Task '${task.name}'`;
            
            if (type.startsWith('task')) { 
                targetItem = task; 
                if (type === 'task-followup') {
                    dateField = 'followUpDate';
                    itemName += ` Follow Up date`;
                } else {
                    dateField = type.endsWith('start') ? 'startDate' : 'endDate'; 
                    itemName += ` ${dateField.replace('Date','')} date`; 
                }
            } else if (type.startsWith('subtask')) { 
                const subtask = task.subtasks.find(st => st.id === subtaskId); 
                if (!subtask) return; 
                targetItem = subtask; 
                if (type === 'subtask-followup') {
                    dateField = 'followUpDate';
                    itemName = `Subtask '${subtask.name}' Follow Up date`;
                } else {
                    dateField = type.endsWith('start') ? 'startDate' : 'endDate'; 
                    itemName = `Subtask '${subtask.name}' ${dateField.replace('Date','')} date`; 
                }
            }
        }
    }
    
    // Apply Update
    if (targetItem && dateField) {
        const oldDate = targetItem[dateField];
        if (comment && shouldLog) {
            if (!project.logs) project.logs = [];
            project.logs.push({ 
                timestamp: new Date().toISOString(), 
                item: itemName, 
                from: oldDate, 
                to: value, 
                comment 
            });
        }
        targetItem[dateField] = value;
    }
    saveState(); 
    renderProjects();
}

// Renaming Helpers
export function updateProjectName(projectId, newName) { 
    const p = state.projects.find(p => p.id === projectId); 
    if (p) { p.name = newName; saveState(); } 
}
export function updatePhaseName(projectId, phaseId, newName) { 
    const p = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId); 
    if (p) { p.name = newName; saveState(); } 
}
export function updateTaskName(projectId, phaseId, taskId, newName) { 
    const t = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId); 
    if (t) { t.name = newName; saveState(); } 
}
export function updateSubtaskName(projectId, phaseId, taskId, subtaskId, newName) { 
    const s = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId)?.subtasks.find(st => st.id === subtaskId); 
    if (s) { s.name = newName; saveState(); } 
}

// Collapse Helpers
export function toggleProjectCollapse(projectId) {
    const p = state.projects.find(p => p.id === projectId);
    if (p) {
        p.collapsed = !p.collapsed;
        saveState();
        
        // Immediate DOM update if element exists to avoid full re-render flickering
        const body = document.getElementById(`project-body-${projectId}`);
        const chevron = document.getElementById(`chevron-${projectId}`);
        if(body) body.classList.toggle('hidden');
        if(chevron) chevron.classList.toggle('-rotate-90');
        
        if (!p.collapsed && p.startDate && p.endDate) drawChart(p);
    }
}

export function togglePhaseCollapse(projectId, phaseId) {
    const phase = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId); 
    if (phase) { 
        phase.collapsed = !phase.collapsed; 
        saveState(); 
        
        const container = document.getElementById(`tasks-container-${phaseId}`);
        const chevron = document.getElementById(`phase-chevron-${phaseId}`);
        if(container) container.classList.toggle('hidden');
        if(chevron) chevron.classList.toggle('-rotate-90');
    }
}

export function toggleTaskCollapse(projectId, phaseId, taskId) {
    const task = state.projects.find(p => p.id === projectId)?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    if (task) {
        task.collapsed = task.collapsed === undefined ? false : !task.collapsed;
        saveState();
        
        const container = document.getElementById(`subtasks-container-${taskId}`);
        const chevron = document.getElementById(`task-chevron-${taskId}`);
        if(container) container.classList.toggle('hidden');
        if(chevron) chevron.classList.toggle('-rotate-90');
    }
}

// Move Task Logic (Within Projects)
export function toggleMoveTaskDropdown(event, projectId, phaseId, taskId) {
    event.stopPropagation();
    const dropdown = document.getElementById(`move-task-dropdown-${taskId}`);
    const isVisible = dropdown.classList.contains('show');
    document.querySelectorAll('.move-task-dropdown').forEach(d => d.classList.remove('show'));

    if (!isVisible) {
        const project = state.projects.find(p => p.id === projectId);
        if (!project) return;
        let optionsHtml = '';
        project.phases.forEach(phase => {
            if (phase.id === phaseId) {
                optionsHtml += `<div class="move-task-dropdown-item disabled">${phase.name} (current)</div>`;
            } else {
                optionsHtml += `<div class="move-task-dropdown-item" onclick="timelineApp.moveTask(${projectId}, ${phaseId}, ${phase.id}, ${taskId})">${phase.name}</div>`;
            }
        });
        dropdown.innerHTML = optionsHtml;
        dropdown.classList.add('show');
    }
}

export function moveTask(projectId, fromPhaseId, toPhaseId, taskId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    const fromPhase = project.phases.find(p => p.id === fromPhaseId);
    const toPhase = project.phases.find(p => p.id === toPhaseId);
    if (!fromPhase || !toPhase) return;
    
    const taskIndex = fromPhase.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    
    const [taskToMove] = fromPhase.tasks.splice(taskIndex, 1);
    toPhase.tasks.push(taskToMove);
    
    saveState();
    renderProjects();
}

/* =========================================
   TAG MANAGEMENT
   ========================================= */

// Helper to get item by IDs
function getItem(projectId, phaseId, taskId, subtaskId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return null;
    const phase = project.phases.find(ph => ph.id === phaseId);
    if (!phase) return null;
    const task = phase.tasks.find(t => t.id === taskId);
    if (!task) return null;
    if (subtaskId) {
        return task.subtasks.find(st => st.id === subtaskId);
    }
    return task;
}

export function addTag(projectId, phaseId, taskId, subtaskId, tagName) {
    const item = getItem(projectId, phaseId, taskId, subtaskId);
    if (item) {
        if (!item.tags) item.tags = [];
        const cleanTag = tagName.trim();
        if (cleanTag && !item.tags.includes(cleanTag)) {
            item.tags.push(cleanTag);
            saveState();
            renderProjects();
        }
    }
}

export function removeTag(projectId, phaseId, taskId, subtaskId, tagName) {
    const item = getItem(projectId, phaseId, taskId, subtaskId);
    if (item && item.tags) {
        item.tags = item.tags.filter(t => t !== tagName);
        saveState();
        renderProjects();
    }
}

// Function to render the tag menu options dynamically
export function renderTagOptions(projectId, phaseId, taskId, subtaskId, filter = '') {
    const id = subtaskId || taskId;
    const container = document.getElementById(`tag-options-${id}`);
    if (!container) return;

    // Collect all unique tags from all items
    const allTags = new Set();
    state.projects.forEach(p => p.phases.forEach(ph => ph.tasks.forEach(t => {
        if (t.tags) t.tags.forEach(tag => allTags.add(tag));
        if (t.subtasks) t.subtasks.forEach(st => {
            if (st.tags) st.tags.forEach(tag => allTags.add(tag));
        });
    })));
    const allTagsArray = Array.from(allTags).sort();

    const item = getItem(projectId, phaseId, taskId, subtaskId);
    const currentTags = item ? (item.tags || []) : [];
    
    const filteredTags = allTagsArray.filter(tag => tag.toLowerCase().includes(filter.toLowerCase()));
    
    let html = '';
    
    if (filter && !allTagsArray.includes(filter) && !currentTags.includes(filter)) {
         html += `
            <div class="tag-option create-new" onclick="timelineApp.addTag(${projectId}, ${phaseId}, ${taskId}, ${subtaskId || 'null'}, '${filter}')">
                Create "${filter}"
            </div>
         `;
    }

    filteredTags.forEach(tag => {
        const isSelected = currentTags.includes(tag);
        if (!isSelected) {
            html += `
                <div class="tag-option" onclick="timelineApp.addTag(${projectId}, ${phaseId}, ${taskId}, ${subtaskId || 'null'}, '${tag}')">
                    ${tag}
                </div>
            `;
        }
    });
    
    if (html === '' && !filter) {
        html = '<div class="text-xs text-gray-500 p-2 text-center">No existing tags. Type to create.</div>';
    }

    container.innerHTML = html;
}

export function toggleTagMenu(event, projectId, phaseId, taskId, subtaskId) {
    event.stopPropagation();
    const id = subtaskId || taskId;
    const menuId = `tag-menu-${id}`;
    
    // Close all other open menus
    document.querySelectorAll('.tag-menu-dropdown').forEach(el => {
        if (el.id !== menuId) el.classList.add('hidden');
    });

    const menu = document.getElementById(menuId);
    if (menu) {
        menu.classList.toggle('hidden');
        if (!menu.classList.contains('hidden')) {
            const input = document.getElementById(`tag-input-${id}`);
            if(input) {
                input.value = '';
                input.focus();
            }
            renderTagOptions(projectId, phaseId, taskId, subtaskId);
        }
    }
}

export function handleTagInput(event, projectId, phaseId, taskId, subtaskId) {
    const filter = event.target.value;
    if (event.key === 'Enter' && filter) {
        addTag(projectId, phaseId, taskId, subtaskId, filter);
        return;
    }
    renderTagOptions(projectId, phaseId, taskId, subtaskId, filter);
}

/* =========================================
   DELETE & DEPENDENCY LOGIC
   ========================================= */

// Removes all dependencies pointing TO or FROM the given itemId
export function removeAllDependencies(itemId) {
    const allItems = new Map();
    // Build a map of everything to easily find parents/children
    state.projects.forEach(p => {
        p.phases.forEach(ph => {
            allItems.set(ph.id, ph);
            ph.tasks.forEach(t => {
                allItems.set(t.id, t);
                if (t.subtasks) {
                    t.subtasks.forEach(st => allItems.set(st.id, st));
                }
            });
        });
    });

    const itemToRemove = allItems.get(itemId);
    if (!itemToRemove) return;

    // 1. Remove my dependencies (I depend on X -> remove that link)
    if (itemToRemove.dependencies) {
        itemToRemove.dependencies.forEach(parentId => {
            const parent = allItems.get(parentId);
            if (parent && parent.dependents) {
                parent.dependents = parent.dependents.filter(id => id !== itemId);
            }
        });
        itemToRemove.dependencies = [];
    }

    // 2. Remove my dependents (Y depends on Me -> remove that link)
    if (itemToRemove.dependents) {
        itemToRemove.dependents.forEach(dependentId => {
            const dependent = allItems.get(dependentId);
            if (dependent && dependent.dependencies) {
                dependent.dependencies = dependent.dependencies.filter(id => id !== itemId);
            }
        });
        itemToRemove.dependents = [];
    }
}

export function deleteProject(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
        // Clean up dependencies for all items inside
        project.phases.forEach(ph => {
            removeAllDependencies(ph.id);
            ph.tasks.forEach(t => {
                removeAllDependencies(t.id);
                if(t.subtasks) t.subtasks.forEach(st => removeAllDependencies(st.id));
            });
        });

        // Setup modal state
        state.pendingDeletion = { 
            type: 'project', 
            logContext: { projectId }, 
            deleteFn: () => { state.projects = state.projects.filter(p => p.id !== projectId); }, 
            itemName: `Project '${project.name}'` 
        };
        
        showDeleteModal(`You are about to delete the project: "${project.name}".`);
    }
}

export function deletePhase(projectId, phaseId) {
    const project = state.projects.find(p => p.id === projectId);
    const phase = project?.phases.find(ph => ph.id === phaseId);
    if (phase) {
        removeAllDependencies(phaseId);
        phase.tasks.forEach(t => {
            removeAllDependencies(t.id);
            if(t.subtasks) t.subtasks.forEach(st => removeAllDependencies(st.id));
        });

        state.pendingDeletion = { 
            type: 'phase', 
            logContext: { projectId }, 
            deleteFn: () => { project.phases = project.phases.filter(ph => ph.id !== phaseId); }, 
            itemName: `Phase '${phase.name}' from project '${project.name}'` 
        };
        
        showDeleteModal(`You are about to delete the phase: "${phase.name}".`);
    }
}

export function deleteTask(projectId, phaseId, taskId) {
    const project = state.projects.find(p => p.id === projectId);
    const phase = project?.phases.find(ph => ph.id === phaseId);
    const task = phase?.tasks.find(t => t.id === taskId);
    if (task) {
        removeAllDependencies(taskId);
        if (task.subtasks) task.subtasks.forEach(st => removeAllDependencies(st.id));

        state.pendingDeletion = { 
            type: 'task', 
            logContext: { projectId }, 
            deleteFn: () => { phase.tasks = phase.tasks.filter(t => t.id !== taskId); }, 
            itemName: `Task '${task.name}' from phase '${phase.name}'` 
        };
        
        showDeleteModal(`You are about to delete the task: "${task.name}".`);
    }
}

export function deleteSubtask(projectId, phaseId, taskId, subtaskId) {
    const project = state.projects.find(p => p.id === projectId);
    const task = project?.phases.find(ph => ph.id === phaseId)?.tasks.find(t => t.id === taskId);
    const subtask = task?.subtasks.find(st => st.id === subtaskId);
    if (subtask) {
        removeAllDependencies(subtaskId);

        state.pendingDeletion = { 
            type: 'subtask', 
            logContext: { projectId }, 
            deleteFn: () => { task.subtasks = task.subtasks.filter(st => st.id !== subtaskId); }, 
            itemName: `Subtask '${subtask.name}' from task '${task.name}'` 
        };
        
        showDeleteModal(`You are about to delete the subtask: "${subtask.name}".`);
    }
}

// Helper to show the existing generic modal
function showDeleteModal(detailsText) {
    if (state.elements.reasonModal) {
        state.elements.reasonModalTitle.textContent = 'Reason for Deletion';
        state.elements.reasonModalDetails.textContent = detailsText;
        state.elements.reasonModal.classList.remove('hidden');
        if(state.elements.reasonCommentTextarea) state.elements.reasonCommentTextarea.focus();
    } else {
        // Fallback if modal elements aren't cached or found
        if(confirm(detailsText + " (Confirm deletion?)")) {
            if(state.pendingDeletion && state.pendingDeletion.deleteFn) {
                state.pendingDeletion.deleteFn();
                saveState();
                renderProjects();
                state.pendingDeletion = null;
            }
        }
    }
}