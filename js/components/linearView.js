import { state } from '../core/state.js';
import { formatDate, parseDate } from '../core/utils.js';

export function renderLinearView() {
    const container = state.elements.projectsContainer;
    
    // 1. DATA COLLECTION
    let allItems = [];
    const allTags = new Set(getAllTags());

    state.projects.forEach(project => {
        // Filter by specific project if filter is active
        if (state.upcomingProjectFilter !== 'all' && project.id.toString() !== state.upcomingProjectFilter) return;

        project.phases.forEach(phase => {
            phase.tasks.forEach(task => {
                const itemBase = {
                    path: `${project.name} > ${phase.name}`,
                    projectName: project.name,
                    projectId: project.id, 
                    phaseId: phase.id, 
                    taskId: task.id,
                    tags: task.tags || [],
                    delegatedTo: task.delegatedTo || null
                };

                // Add Subtasks
                if (task.subtasks && task.subtasks.length > 0) {
                    task.subtasks.forEach(subtask => {
                        allItems.push({
                            ...itemBase,
                            name: `${task.name}: ${subtask.name}`,
                            date: subtask.endDate || null,
                            rawDate: subtask.endDate ? parseDate(subtask.endDate) : null,
                            completed: subtask.completed,
                            subtaskId: subtask.id,
                            isFollowUp: subtask.isFollowUp || false,
                            followUpDate: subtask.followUpDate ? parseDate(subtask.followUpDate) : null,
                            tags: subtask.tags || [],
                            delegatedTo: subtask.delegatedTo || null // Support subtask delegation
                        });
                    });
                } else {
                    // Add Task
                    allItems.push({
                        ...itemBase,
                        name: task.name,
                        date: task.effectiveEndDate || null,
                        rawDate: task.effectiveEndDate ? parseDate(task.effectiveEndDate) : null,
                        completed: task.completed,
                        subtaskId: null,
                        isFollowUp: task.isFollowUp || false,
                        followUpDate: task.followUpDate ? parseDate(task.followUpDate) : null
                    });
                }
            });
        });
    });

    // 2. FILTERING
    if (state.hideCompletedTasks) {
        allItems = allItems.filter(i => !i.completed);
    }
    
    if (state.tagFilter !== 'all') {
        allItems = allItems.filter(i => i.tags && i.tags.includes(state.tagFilter));
    }

    // 3. RENDER CONTROLS (Top Bar)
    const sortedTags = Array.from(allTags).sort();
    const tagOptions = sortedTags.map(tag => 
        `<option value="${tag}" ${state.tagFilter === tag ? 'selected' : ''}>${tag}</option>`
    ).join('');

    const controlsHtml = `
        <div class="flex justify-between items-center mb-6 px-1 bg-white dark:bg-slate-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            
            <div class="flex items-center gap-4">
                <div class="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    <select onchange="timelineApp.setTagFilter(this.value)" class="tag-filter-dropdown bg-transparent font-medium text-sm focus:outline-none dark:text-gray-200">
                        <option value="all">All Tags</option>
                        ${tagOptions}
                    </select>
                </div>
            </div>

            <label class="flex items-center text-xs font-semibold text-secondary cursor-pointer select-none hover:text-primary transition-colors">
                <input type="checkbox" class="custom-checkbox mr-2" 
                    ${state.hideCompletedTasks ? 'checked' : ''} 
                    onchange="timelineApp.toggleHideCompleted()">
                Hide Completed Tasks
            </label>
        </div>
    `;

    if (allItems.length === 0) {
        container.innerHTML = controlsHtml + `<div class="upcoming-card p-6 rounded-xl shadow-md text-center text-secondary bg-gray-50 dark:bg-slate-800 border border-dashed border-gray-300 dark:border-gray-700">No tasks found matching current filters.</div>`;
        return;
    }

    // 4. BUCKET SORTING
    const today = new Date(); today.setHours(0,0,0,0);
    const buckets = { 
        delegated: {}, // Object: { "John": [items...], "Jane": [items...] }
        waitingFor: [], // General follow ups without a person
        doNow: [], 
        upcoming: [], 
        backlog: [] 
    };

    allItems.forEach(item => {
        // A. Delegation Check
        if (item.delegatedTo) {
            if (!buckets.delegated[item.delegatedTo]) buckets.delegated[item.delegatedTo] = [];
            buckets.delegated[item.delegatedTo].push(item);
            return;
        }

        // B. General Waiting Check
        if (item.isFollowUp) { 
            buckets.waitingFor.push(item); 
            return; 
        }

        // C. Standard GTD Dates
        if (!item.rawDate) { 
            buckets.backlog.push(item); 
            return; 
        }

        const diffDays = Math.round((item.rawDate - today) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) { 
            item.diffDays = diffDays; 
            buckets.doNow.push(item); 
        } else { 
            buckets.upcoming.push(item); 
        }
    });

    // Sort buckets
    buckets.waitingFor.sort((a, b) => (a.followUpDate || new Date(9999,0,1)) - (b.followUpDate || new Date(9999,0,1)));
    buckets.doNow.sort((a, b) => a.rawDate - b.rawDate);
    buckets.upcoming.sort((a, b) => a.rawDate - b.rawDate);

    // 5. RENDER CONTENT
    let contentHtml = '';

    // --- DELEGATION SECTION ---
    const people = Object.keys(buckets.delegated);
    if (people.length > 0) {
        contentHtml += `<div class="mb-2 text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Waiting For (Delegated)</div>`;
        contentHtml += `<div class="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
        
        people.forEach(person => {
            const items = buckets.delegated[person];
            const itemsHtml = items.map(t => `
                <div class="flex justify-between items-center text-xs py-2 border-b border-purple-100 dark:border-purple-900/50 last:border-0 group">
                    <div class="flex flex-col min-w-0 pr-2">
                        <span class="truncate font-medium text-purple-900 dark:text-purple-200" title="${t.name}">${t.name}</span>
                        <span class="text-[10px] text-purple-400 truncate">${t.projectName}</span>
                    </div>
                    <button class="text-[10px] bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-purple-500 hover:text-purple-700 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity" 
                        onclick="timelineApp.revokeDelegation(${t.projectId}, ${t.phaseId}, ${t.taskId})">
                        Reclaim
                    </button>
                </div>
            `).join('');
            
            contentHtml += `
                <div class="bg-purple-50 dark:bg-slate-800/50 border border-purple-100 dark:border-purple-900 rounded-xl p-3 shadow-sm">
                    <div class="flex items-center gap-2 mb-2 pb-2 border-b border-purple-200 dark:border-purple-800">
                        <div class="w-6 h-6 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-xs font-bold">${person.charAt(0).toUpperCase()}</div>
                        <h4 class="font-bold text-sm text-purple-900 dark:text-purple-300">Waiting on ${person}</h4>
                        <span class="ml-auto text-xs text-purple-400 bg-white dark:bg-slate-900 px-1.5 rounded-full border border-purple-100 dark:border-purple-800">${items.length}</span>
                    </div>
                    <div>${itemsHtml}</div>
                </div>
            `;
        });
        contentHtml += `</div>`;
    }

    // --- GENERAL WAITING ---
    if (buckets.waitingFor.length > 0) {
        contentHtml += renderGroup("Waiting For (Self)", buckets.waitingFor, "bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 border-purple-200 dark:border-purple-800");
    }

    // --- DO NOW ---
    if (buckets.doNow.length > 0) {
        contentHtml += renderGroup("Do Now (Due Today / Overdue)", buckets.doNow, "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800");
    } else if (allItems.length > 0 && !state.hideCompletedTasks && state.tagFilter === 'all') {
        contentHtml += `<div class="p-6 mb-6 text-center text-sm text-secondary bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900 flex flex-col items-center gap-2">
            <span class="text-2xl">🎉</span>
            <span>All caught up on immediate tasks!</span>
        </div>`;
    }

    // --- UPCOMING ---
    if (buckets.upcoming.length > 0) {
        contentHtml += renderGroup("Upcoming", buckets.upcoming, "bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-200");
    }

    // --- BACKLOG ---
    if (buckets.backlog.length > 0) {
        contentHtml += renderGroup("Action Hub Backlog (No Date)", buckets.backlog, "bg-gray-200 dark:bg-slate-700/50 text-gray-600 dark:text-gray-400");
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = controlsHtml + contentHtml;
    container.innerHTML = '';
    container.appendChild(wrapper);
}

// --- HELPER FUNCTIONS ---

function getAllTags() {
    const tags = new Set();
    state.projects.forEach(p => p.phases.forEach(ph => ph.tasks.forEach(t => {
        if (t.tags) t.tags.forEach(tag => tags.add(tag));
        if (t.subtasks) t.subtasks.forEach(st => {
            if (st.tags) st.tags.forEach(tag => tags.add(tag));
        });
    })));
    return Array.from(tags).sort();
}

function renderGroup(title, items, headerClass) {
    if (items.length === 0) return '';
    
    let html = `<div class="upcoming-card rounded-xl shadow-md mb-6 overflow-hidden border border-gray-100 dark:border-gray-700">
        <div class="p-3 border-b border-gray-100 dark:border-gray-700 ${headerClass}">
            <h3 class="font-bold flex items-center gap-2">
                ${title} 
                <span class="text-xs font-normal opacity-75 bg-white bg-opacity-20 px-2 py-0.5 rounded-full">${items.length}</span>
            </h3>
        </div>
        <div class="p-1 space-y-1 bg-white dark:bg-slate-800/50">`;
        
    items.forEach(item => {
        const completedClass = item.completed ? 'line-through opacity-60' : '';
        let extraDetails = '';
        
        // Context Badges
        if (item.isFollowUp && !item.delegatedTo) {
             const fuDate = item.followUpDate ? formatDate(item.followUpDate) : 'No Date';
             extraDetails = `<div class="text-[10px] font-bold text-purple-600 dark:text-purple-300 uppercase tracking-wider bg-purple-50 dark:bg-purple-900/30 px-1.5 rounded inline-block">Follow Up: ${fuDate}</div>`;
        } else if (item.diffDays < 0) {
             extraDetails = `<div class="text-[10px] font-bold text-red-600 dark:text-red-300 uppercase tracking-wider bg-red-50 dark:bg-red-900/30 px-1.5 rounded inline-block">Overdue by ${Math.abs(item.diffDays)} days</div>`;
        }

        const tagsHtml = (item.tags || []).map(t => `<span class="tag-badge text-[10px] px-1.5 py-0.5">${t}</span>`).join('');

        // Project Breadcrumb (Don't show "Single Actions" as it's cleaner to just show task)
        const pathDisplay = item.projectName === 'Single Actions' ? 'Action Hub' : item.path;

        html += `
        <div class="upcoming-task-item flex items-center p-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors ${completedClass} group relative" 
             onclick="timelineApp.navigateToTask(${item.projectId}, ${item.phaseId}, ${item.taskId}, ${item.subtaskId || 'null'})">
            
            <div class="flex-shrink-0 mr-3 cursor-pointer" 
                 onclick="timelineApp.toggleItemComplete(event, ${item.projectId}, ${item.phaseId}, ${item.taskId}, ${item.subtaskId || 'null'})">
                 ${item.completed 
                    ? `<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>`
                    : `<div class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-green-500 transition-colors"></div>`
                 }
            </div>
            
            <div class="flex-grow min-w-0">
                <div class="flex justify-between items-baseline mb-0.5">
                    <div class="text-[10px] uppercase tracking-wider text-secondary truncate w-2/3 opacity-70">${pathDisplay}</div>
                    <div class="text-xs font-mono text-tertiary">${item.rawDate ? formatDate(item.rawDate) : ''}</div>
                </div>
                <div class="font-medium truncate text-sm flex items-center gap-2">
                    <span class="text-gray-800 dark:text-gray-200">${item.name}</span>
                    ${tagsHtml}
                </div>
                ${extraDetails}
            </div>

            <div class="opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 flex items-center bg-white dark:bg-slate-800 shadow-sm border border-gray-200 dark:border-gray-600 rounded-md px-1 transition-opacity">
                <button class="text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 p-1.5" 
                    title="Delegate this task"
                    onclick="event.stopPropagation(); timelineApp.promptDelegation(${item.projectId}, ${item.phaseId}, ${item.taskId})">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                </button>
            </div>
        </div>`;
    });
    return html + `</div></div>`;
}