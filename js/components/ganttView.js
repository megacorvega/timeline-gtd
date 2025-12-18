import { state } from '../core/state.js';
import { calculateRollups, resolveDependencies } from '../managers/dependencyManager.js';
import { drawChart } from './ganttChart.js';
import { formatDate, parseDate, getDurationProgress, getDaysLeft, formatLogTimestamp } from '../core/utils.js';
import { renderLinearView } from './linearView.js'; 

// --- MAIN RENDER CONTROLLER ---

export function renderProjects(recalculate = true) {
    // Only run the heavy math if data has actually changed
    if (recalculate) {
        calculateRollups();
        resolveDependencies();
    }
    
    state.elements.projectsContainer.innerHTML = '';

    if (state.projectViewMode === 'gantt') {
        renderGanttView();
    } else {
        renderLinearView();
    }
    
    renderDeletedProjectsLog();
}

// --- GANTT VIEW LOGIC ---

export function renderGanttView() {
    // FILTER: Hide System Projects (Single Actions)
    const visibleProjects = state.projects.filter(p => !p.isSystem);

    const sortedProjects = [...visibleProjects].sort((a, b) => {
        if (a.overallProgress >= 100 && b.overallProgress < 100) return 1;
        if (a.overallProgress < 100 && b.overallProgress >= 100) return -1;
        return sortByEndDate(a, b, 'endDate');
    });

    sortedProjects.forEach((project) => {
        const projectCard = document.createElement('div');
        projectCard.className = `project-card p-3 rounded-xl mb-4`; 
        
        let completionIcon = project.overallProgress >= 100 ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>` : '';

        const durationProgress = getDurationProgress(project.startDate, project.endDate);
        const daysLeftInfo = getDaysLeft(project.endDate);
        const overallProgress = Math.round(project.overallProgress);

        let progressColor = 'var(--green)';
        let statusText = '';
        let statusColorClass = '';

        if (project.overallProgress >= 100) {
            progressColor = 'var(--green)';
            statusText = 'Complete';
            statusColorClass = 'status-complete';
        } else if (daysLeftInfo.isOverdue) {
            progressColor = 'var(--red)';
            statusText = 'Late';
            statusColorClass = 'status-late';
        } else if (overallProgress < durationProgress) {
            progressColor = 'var(--amber)';
            statusText = 'At Risk';
            statusColorClass = 'status-at-risk';
        } else {
            progressColor = 'var(--blue)';
            statusText = 'On Track';
            statusColorClass = 'status-on-track';
        }
        
        const tooltipText = `
            <div class="tooltip-grid">
                <span>Status:</span><span class="status-pill ${statusColorClass}">${statusText}</span>
                <span>Completion:</span><span>${overallProgress}%</span>
                <span>Time Elapsed:</span><span>${Math.round(durationProgress)}%</span>
                <span>Days Left:</span><span>${daysLeftInfo.days !== null ? daysLeftInfo.days : 'N/A'}</span>
            </div>
        `;

        const pacingBarHTML = `
            <div class="duration-scale-container tooltip">
                <span class="tooltip-text">${tooltipText}</span>
                <div class="relative h-2 w-full rounded-full" style="background-color: var(--bg-tertiary);">
                    <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: var(--bg-tertiary); width: ${durationProgress}%; z-index: 1;"></div>
                    <div class="absolute h-2 top-0 left-0 rounded-full" style="background-color: ${progressColor}; width: ${overallProgress}%; z-index: 2;"></div>
                </div>
            </div>
        `;

        const daysLeftPillHTML = `
            <div class="days-left-pill ${daysLeftInfo.className}" title="${daysLeftInfo.tooltip}">
                ${daysLeftInfo.text}
            </div>
        `;

        const lockIcon = project.locked
            ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;
        
        const commentDot = project.comments && project.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';

        projectCard.innerHTML = `
            <div class="flex justify-between items-center mb-3 project-header">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    ${completionIcon}
                    <button onclick="timelineApp.toggleProjectCollapse(${project.id})" class="p-1 rounded-full hover-bg-secondary flex-shrink-0">
                        <svg id="chevron-${project.id}" class="w-5 h-5 text-tertiary chevron ${project.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                    </button>
                    ${commentDot}
                    <h3 class="text-xl font-bold truncate editable-text" onclick="timelineApp.makeEditable(this, 'updateProjectName', ${project.id})">${project.name}</h3>
                    ${pacingBarHTML}
                    ${daysLeftPillHTML}
                </div>
                <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                    <button onclick="timelineApp.generatePrintView(${project.id})" class="print-btn" title="Print Project">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd" /></svg>
                    </button>
                    <button onclick="timelineApp.toggleCommentSection('project', ${project.id})" class="comment-btn" title="Comments">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button onclick="timelineApp.toggleProjectLock(${project.id})" class="lock-toggle-btn" title="${project.locked ? 'Unlock Project Dates' : 'Lock Project Dates'}">
                        ${lockIcon}
                    </button>
                    <div class="date-input-container">
                        <input type="text" value="${project.startDate ? formatDate(parseDate(project.startDate)) : ''}" placeholder="Start Date" class="date-input" data-project-id="${project.id}" data-type="project-start" data-date="${project.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${project.locked ? 'disabled' : ''}>
                        <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                    </div>
                    <div class="date-input-container">
                        <input type="text" value="${project.endDate ? formatDate(parseDate(project.endDate)) : ''}" placeholder="End Date" class="date-input" data-project-id="${project.id}" data-type="project-end" data-date="${project.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${project.locked ? 'disabled' : ''}>
                        <div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
                    </div>
                </div>
                <button onclick="timelineApp.deleteProject(${project.id})" class="text-gray-400 hover:text-red-500 transition-colors text-xl font-bold ml-4 flex-shrink-0">&times;</button>
            </div>
            <div id="project-body-${project.id}" class="${project.collapsed ? 'hidden' : ''}">
                <div id="comment-section-project-${project.id}" class="comment-section hidden"></div>
                <div class="relative">
                    <button onclick="timelineApp.resetZoom(${project.id})" class="reset-zoom-btn btn-secondary px-2 py-1 text-xs font-semibold rounded-md ${!project.zoomDomain ? 'hidden' : ''}">Reset Zoom</button>
                    <div id="chart-${project.id}" class="w-full h-48 mb-3 relative"></div>
                </div>
                <div id="phases-${project.id}" class="space-y-1"></div>
                <div class="mt-3">
                    <button onclick="timelineApp.toggleLog(${project.id})" class="text-xs font-semibold text-tertiary hover-text-primary flex items-center gap-1">
                        <svg id="log-chevron-${project.id}" class="w-4 h-4 chevron -rotate-90" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                        Change Log
                    </button>
                    <div id="log-container-${project.id}" class="hidden mt-2 p-2 log-container-bg rounded-md">${renderLog(project)}</div>
                </div>
            </div>
        `;
        
        state.elements.projectsContainer.appendChild(projectCard);
        renderPhaseList(project);
        
        if (!project.collapsed && project.startDate && project.endDate) {
             drawChart(project);
        } else if (!project.startDate || !project.endDate) {
             const chartContainer = document.getElementById(`chart-${project.id}`);
             if (chartContainer) {
                 chartContainer.innerHTML = `<div class="flex items-center justify-center h-full text-gray-400">Set project start and end dates to see progress chart.</div>`;
             }
        }
    });
}

function renderPhaseList(project) {
    const phaseContainer = document.getElementById(`phases-${project.id}`);
    if(!phaseContainer) return;

    let html = '';
    const sortedPhases = [...project.phases].sort((a, b) => sortByEndDate(a, b, 'endDate'));

    sortedPhases.forEach((phase, index) => {
        const hasTasks = phase.tasks && phase.tasks.length > 0;
        const toggleButton = hasTasks ?
            `<button onclick="timelineApp.togglePhaseCollapse(${project.id}, ${phase.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                <svg id="phase-chevron-${phase.id}" class="w-4 h-4 text-tertiary chevron ${phase.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`;

        const depClass = state.dependencyMode && state.firstSelectedItem?.id !== phase.id ? 'dependency-candidate' : '';
        const selectedClass = state.firstSelectedItem?.id === phase.id ? 'dependency-selected' : '';
        const commentDot = phase.comments && phase.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
        const durationProgress = getDurationProgress(phase.effectiveStartDate, phase.effectiveEndDate);
        
        let durationBarColorClass = 'bg-blue-500';
        if (phase.completed) {
            durationBarColorClass = 'bg-green-500';
        } else if (durationProgress === 100) {
            durationBarColorClass = 'bg-red-500';
        } else if (durationProgress > 90) {
            durationBarColorClass = 'bg-orange-500';
        } else if (durationProgress > 75) {
            durationBarColorClass = 'bg-yellow-500';
        }
        
        const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
        const lockIcon = phase.locked
            ? `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1a2 2 0 0 0-2 2v4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5V3a3 3 0 0 1 6 0v4a.5.5 0 0 1-1 0V3a2 2 0 0 0-2-2z"/></svg>`;

        const isStartDateDrivenByDependency = phase.isDriven;
        const startDateInputClasses = isStartDateDrivenByDependency ? 'date-input-disabled' : '';

        // Note: Dependency icons logic (getDependencyIcon) can be imported or inline. 
        // For simplicity, we implement a helper below to keep this file self-contained for rendering.
        
        html += `
            <div class="phase-row rounded-lg p-2 ${depClass} ${selectedClass}" data-id="${phase.id}" data-type="phase" data-project-id="${project.id}" onmouseover="timelineApp.highlightPhaseOnChart(${phase.id})" onmouseout="timelineApp.unhighlightPhaseOnChart(${phase.id})">
                <div class="flex items-center gap-3 item-main-row">
                    ${toggleButton}
                    ${commentDot}
                    <div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(phase.progress || 0)}%</div>
                    <div class="duration-scale-container" title="Duration Progress">
                        <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                    </div>
                    <span class="font-semibold flex-grow editable-text" onclick="timelineApp.makeEditable(this, 'updatePhaseName', ${project.id}, ${phase.id})">${phase.name}</span>
                    
                    ${getDependencyIcon(phase)}

                    <div class="flex items-center gap-2 text-sm text-secondary flex-shrink-0">
                        <button onclick="timelineApp.togglePhaseLock(${project.id}, ${phase.id})" class="lock-toggle-btn" title="${phase.locked ? 'Unlock Phase Dates' : 'Lock Phase Dates'}">
                            ${lockIcon}
                        </button>
                        <button onclick="timelineApp.toggleCommentSection('phase', ${project.id}, ${phase.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <div class="date-input-container">
                            <input type="text" value="${phase.startDate ? formatDate(parseDate(phase.startDate)) : ''}" placeholder="Start Date" class="date-input ${startDateInputClasses}" data-project-id="${project.id}" data-phase-id="${phase.id}" data-type="phase-start" data-date="${phase.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${phase.locked || isStartDateDrivenByDependency ? 'disabled' : ''}>
                            ${!isStartDateDrivenByDependency ? iconHtml : ''}
                        </div>
                        <div class="date-input-container">
                            <input type="text" value="${phase.endDate ? formatDate(parseDate(phase.endDate)) : ''}" placeholder="End Date" class="date-input" data-project-id="${project.id}" data-phase-id="${phase.id}" data-type="phase-end" data-date="${phase.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)" ${phase.locked ? 'disabled' : ''}>
                            ${iconHtml}
                        </div>
                    </div>
                    <button onclick="timelineApp.deletePhase(${project.id}, ${phase.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                </div>
                <div id="comment-section-phase-${phase.id}" class="comment-section hidden"></div>
                <div id="tasks-container-${phase.id}" class="pl-12 mt-2 space-y-1 pt-2 border-t border-primary ${phase.collapsed ? 'hidden' : ''}">${renderTaskList(project.id, phase.id, phase.tasks)}</div>
            </div>`;
    });
    html += `
        <div class="mt-2 pl-4">
            <div class="flex items-center gap-2">
                <input type="text" id="new-phase-name-${project.id}" placeholder="Add a new phase..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-sm h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addPhase(${project.id})">
                <button onclick="timelineApp.addPhase(${project.id})" class="btn-secondary font-semibold rounded-md text-sm btn-sm">Add</button>
            </div>
        </div>`;
    
    phaseContainer.innerHTML = html;
}

function renderTaskList(projectId, phaseId, tasks) {
    let html = '';
    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.isFollowUp && !b.isFollowUp) return -1;
        if (!a.isFollowUp && b.isFollowUp) return 1;
        if (a.isFollowUp && b.isFollowUp) {
            const dateA = a.followUpDate ? new Date(a.followUpDate) : new Date(9999, 11, 31);
            const dateB = b.followUpDate ? new Date(b.followUpDate) : new Date(9999, 11, 31);
            return dateA - dateB;
        }
        return sortByEndDate(a, b, 'effectiveEndDate');
    });

    const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
    
    sortedTasks.forEach(task => {
        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
        let taskControlHtml = hasSubtasks ? `<div class="text-xs font-bold text-secondary w-10 text-center flex-shrink-0">${Math.round(task.progress || 0)}%</div>` : `<input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleTaskComplete(${projectId}, ${phaseId}, ${task.id})" ${task.completed ? 'checked' : ''}>`;
        
        const toggleButton = hasSubtasks ?
            `<button onclick="timelineApp.toggleTaskCollapse(${projectId}, ${phaseId}, ${task.id})" class="p-1 rounded-full hover-bg-tertiary flex-shrink-0">
                <svg id="task-chevron-${task.id}" class="w-4 h-4 text-tertiary chevron ${task.collapsed ? '-rotate-90' : ''}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>` : `<div class="w-6 h-6 flex-shrink-0"></div>`;
        
        const depClass = state.dependencyMode && state.firstSelectedItem?.id !== task.id ? 'dependency-candidate' : '';
        const selectedClass = state.firstSelectedItem?.id === task.id ? 'dependency-selected' : '';
        const commentDot = task.comments && task.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
        const durationProgress = getDurationProgress(task.effectiveStartDate, task.effectiveEndDate);
        
        let durationBarColorClass = 'bg-blue-500';
        if (task.completed) durationBarColorClass = 'bg-green-500';
        else if (durationProgress === 100) durationBarColorClass = 'bg-red-500';
        else if (durationProgress > 90) durationBarColorClass = 'bg-orange-500';
        else if (durationProgress > 75) durationBarColorClass = 'bg-yellow-500';

        const isStartDateDrivenByDependency = task.isDriven;
        const isStartDateDisabled = hasSubtasks || isStartDateDrivenByDependency;
        const startDateInputClasses = isStartDateDisabled ? 'date-input-disabled' : '';
        const isEndDateDisabled = hasSubtasks;
        const endDateInputClasses = isEndDateDisabled ? 'date-input-disabled' : '';

        const followUpClass = task.isFollowUp ? 'follow-up-active' : '';
        const followUpIconColor = task.isFollowUp ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-purple-500';
        
        const followUpDateHtml = task.isFollowUp ? `
            <div class="date-input-container mr-2">
                <input type="text" 
                    value="${task.followUpDate ? formatDate(parseDate(task.followUpDate)) : ''}" 
                    class="date-input border-purple-300 dark:border-purple-700 font-bold text-purple-700 dark:text-purple-300" 
                    placeholder="Follow Up"
                    data-project-id="${projectId}" 
                    data-phase-id="${phaseId}" 
                    data-task-id="${task.id}" 
                    data-type="task-followup" 
                    data-date="${task.followUpDate || ''}" 
                    oninput="timelineApp.formatDateInput(event)" 
                    onblur="timelineApp.handleManualDateInput(event)" 
                    onkeydown="timelineApp.handleDateInputKeydown(event)">
                ${iconHtml}
            </div>
        ` : '';

        // --- TAGS UI ---
        const tags = task.tags || [];
        const tagHtml = tags.map(tag => `
            <span class="tag-badge">
                ${tag}
                <span onclick="event.stopPropagation(); timelineApp.removeTag(${projectId}, ${phaseId}, ${task.id}, null, '${tag}')" class="tag-remove">&times;</span>
            </span>
        `).join('');

        const tagMenuHtml = `
            <div class="relative inline-block ml-2">
                <button onclick="timelineApp.toggleTagMenu(event, ${projectId}, ${phaseId}, ${task.id}, null)" class="add-tag-btn" title="Add Tag">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                    <span class="ml-0.5 text-[10px]">+</span>
                </button>
                <div id="tag-menu-${task.id}" class="tag-menu-dropdown hidden" onclick="event.stopPropagation()">
                    <input type="text" id="tag-input-${task.id}" class="tag-menu-input" placeholder="Search or create..." 
                           onkeyup="timelineApp.handleTagInput(event, ${projectId}, ${phaseId}, ${task.id}, null)">
                    <div id="tag-options-${task.id}" class="tag-menu-options"></div>
                </div>
            </div>
        `;

        html += `
            <div class="task-row rounded-lg px-2 py-1 ${depClass} ${selectedClass} ${followUpClass}" data-id="${task.id}" data-type="task" data-project-id="${projectId}" data-phase-id="${phaseId}">
                <div class="flex items-center gap-3 item-main-row">
                     ${toggleButton}
                    ${commentDot}
                    ${taskControlHtml}
                    <div class="duration-scale-container" title="Duration Progress">
                        <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                    </div>
                    <div class="flex-grow flex items-center gap-2 flex-wrap">
                        <span class="font-medium editable-text" onclick="timelineApp.makeEditable(this, 'updateTaskName', ${projectId}, ${phaseId}, ${task.id})">${task.name}</span>
                        <div class="flex items-center">${tagHtml}${tagMenuHtml}</div>
                        <button onclick="timelineApp.showAddSubtaskInput(${task.id})" class="add-subtask-btn items-center gap-1 text-xs btn-secondary font-semibold rounded-md px-2 py-1 flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            <span>Subtask</span>
                        </button>
                        <button class="ml-2 text-xs text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 p-1" 
                            title="Delegate"
                            onclick="event.stopPropagation(); timelineApp.promptDelegation(${projectId}, ${phaseId}, ${task.id})">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                        </button>
                    </div>
                    ${getDependencyIcon(task)}
                    
                    <div class="flex items-center">
                        ${followUpDateHtml}
                        <button onclick="timelineApp.toggleTaskFollowUp(${projectId}, ${phaseId}, ${task.id})" 
                                class="p-1 rounded-md ${followUpIconColor} transition-colors" 
                                title="Toggle Follow Up">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="${task.isFollowUp ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </button>
                    </div>

                    <div class="flex items-center gap-2 text-sm text-secondary">
                        <button onclick="timelineApp.toggleCommentSection('task', ${projectId}, ${phaseId}, ${task.id})" class="comment-btn" title="Comments">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <div class="date-input-container">
                            <input type="text" value="${task.effectiveStartDate ? formatDate(parseDate(task.effectiveStartDate)) : ''}" placeholder="Start" class="date-input ${startDateInputClasses}" ${isStartDateDisabled ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-start" data-date="${task.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${!isStartDateDisabled ? iconHtml : ''}
                        </div>
                        <div class="date-input-container">
                            <input type="text" value="${task.effectiveEndDate ? formatDate(parseDate(task.effectiveEndDate)) : ''}" placeholder="End" class="date-input ${endDateInputClasses}" ${isEndDateDisabled ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${task.id}" data-type="task-end" data-date="${task.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${!isEndDateDisabled ? iconHtml : ''}
                        </div>
                    </div>
                    <button onclick="timelineApp.deleteTask(${projectId}, ${phaseId}, ${task.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold">&times;</button>
                </div>
                <div id="comment-section-task-${task.id}" class="comment-section hidden"></div>
                <div id="subtasks-container-${task.id}" class="pl-12 mt-2 space-y-2 pt-2 border-t border-primary ${task.collapsed || !hasSubtasks ? 'hidden' : ''}">
                    ${renderSubtaskList(projectId, phaseId, task.id, task.subtasks || [])}
                </div>
                <div id="add-subtask-form-${task.id}" class="hidden ml-12 mt-2">
                     <div class="flex items-center gap-2">
                        <input type="text" id="new-subtask-name-${task.id}" placeholder="Add subtask..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-xs h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addSubtask(${projectId}, ${phaseId}, ${task.id})">
                        <button onclick="timelineApp.addSubtask(${projectId}, ${phaseId}, ${task.id})" class="btn-secondary font-semibold rounded-md text-xs btn-sm">Add</button>
                     </div>
                </div>
            </div>`;
    });
    html += `
        <div>
            <div class="flex items-center gap-2">
                <input type="text" id="new-task-name-${phaseId}" placeholder="Add a new task..." class="flex-grow w-full px-2 py-1 input-primary rounded-md text-xs h-[28px]" onkeydown="if(event.key==='Enter') timelineApp.addTask(${projectId}, ${phaseId})">
                <button onclick="timelineApp.addTask(${projectId}, ${phaseId})" class="btn-secondary font-semibold rounded-md text-xs btn-sm">Add</button>
            </div>
        </div>`;
    return html;
}

function renderSubtaskList(projectId, phaseId, taskId, subtasks) {
    if (!subtasks || subtasks.length === 0) return '';
    let html = '<div class="ml-12 mt-1 space-y-1 pt-1">';
    const sortedSubtasks = [...subtasks].sort((a,b) => {
         if (a.isFollowUp && !b.isFollowUp) return -1;
         if (!a.isFollowUp && b.isFollowUp) return 1;
         if (a.isFollowUp && b.isFollowUp) {
            const dateA = a.followUpDate ? new Date(a.followUpDate) : new Date(9999, 11, 31);
            const dateB = b.followUpDate ? new Date(b.followUpDate) : new Date(9999, 11, 31);
            return dateA - dateB;
        }
        return sortByEndDate(a, b, 'endDate');
    });

    const iconHtml = `<div class="date-input-icon-wrapper"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>`;
    
    sortedSubtasks.forEach(subtask => {
        const depClass = state.dependencyMode && state.firstSelectedItem?.id !== subtask.id ? 'dependency-candidate' : '';
        const selectedClass = state.firstSelectedItem?.id === subtask.id ? 'dependency-selected' : '';
        const commentDot = subtask.comments && subtask.comments.length > 0 ? `<div class="comment-dot" title="This item has comments"></div>` : '<div class="w-2"></div>';
        const durationProgress = getDurationProgress(subtask.startDate, subtask.endDate);
        let durationBarColorClass = 'bg-blue-500';
        if (subtask.completed) durationBarColorClass = 'bg-green-500';
        else if (durationProgress === 100) durationBarColorClass = 'bg-red-500';
        else if (durationProgress > 90) durationBarColorClass = 'bg-orange-500';
        else if (durationProgress > 75) durationBarColorClass = 'bg-yellow-500';
        
        const dateInputClasses = subtask.isDriven ? 'date-input-disabled' : '';

        const followUpClass = subtask.isFollowUp ? 'follow-up-active' : '';
        const followUpIconColor = subtask.isFollowUp ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 hover:text-purple-500';
        
        const followUpDateHtml = subtask.isFollowUp ? `
            <div class="date-input-container mr-2">
                <input type="text" 
                    value="${subtask.followUpDate ? formatDate(parseDate(subtask.followUpDate)) : ''}" 
                    class="date-input border-purple-300 dark:border-purple-700 font-bold text-purple-700 dark:text-purple-300" 
                    placeholder="Follow Up"
                    data-project-id="${projectId}" 
                    data-phase-id="${phaseId}" 
                    data-task-id="${taskId}" 
                    data-subtask-id="${subtask.id}"
                    data-type="subtask-followup" 
                    data-date="${subtask.followUpDate || ''}" 
                    oninput="timelineApp.formatDateInput(event)" 
                    onblur="timelineApp.handleManualDateInput(event)" 
                    onkeydown="timelineApp.handleDateInputKeydown(event)">
                ${iconHtml}
            </div>
        ` : '';

        // --- TAGS UI ---
        const tags = subtask.tags || [];
        const tagHtml = tags.map(tag => `
            <span class="tag-badge">
                ${tag}
                <span onclick="event.stopPropagation(); timelineApp.removeTag(${projectId}, ${phaseId}, ${taskId}, ${subtask.id}, '${tag}')" class="tag-remove">&times;</span>
            </span>
        `).join('');

        const tagMenuHtml = `
            <div class="relative inline-block ml-2">
                <button onclick="timelineApp.toggleTagMenu(event, ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="add-tag-btn" title="Add Tag">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                     <span class="ml-0.5 text-[10px]">+</span>
                </button>
                <div id="tag-menu-${subtask.id}" class="tag-menu-dropdown hidden" onclick="event.stopPropagation()">
                    <input type="text" id="tag-input-${subtask.id}" class="tag-menu-input" placeholder="Search or create..." 
                           onkeyup="timelineApp.handleTagInput(event, ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">
                    <div id="tag-options-${subtask.id}" class="tag-menu-options"></div>
                </div>
            </div>
        `;

        html += `
            <div class="subtask-row-wrapper">
                <div class="flex items-center gap-3 subtask-row ${depClass} ${selectedClass} ${followUpClass}" data-id="${subtask.id}" data-type="subtask" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}">
                    ${commentDot}
                    <input type="checkbox" class="custom-checkbox" onchange="timelineApp.toggleSubtaskComplete(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" ${subtask.completed ? 'checked' : ''}>
                    <div class="duration-scale-container" title="Duration Progress">
                        <div class="duration-scale-bar ${durationBarColorClass}" style="width: ${durationProgress}%;"></div>
                    </div>
                    <div class="flex-grow flex items-center flex-wrap gap-2">
                        <span class="text-sm ${subtask.completed ? 'line-through opacity-60' : ''} editable-text" onclick="timelineApp.makeEditable(this, 'updateSubtaskName', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})">${subtask.name}</span>
                        <div class="flex items-center">${tagHtml}${tagMenuHtml}</div>
                    </div>
                    ${getDependencyIcon(subtask)}
                    
                    <div class="flex items-center">
                        ${followUpDateHtml}
                        <button onclick="timelineApp.toggleSubtaskFollowUp(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" 
                                class="p-1 rounded-md ${followUpIconColor} transition-colors" 
                                title="Toggle Follow Up">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="${subtask.isFollowUp ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </button>
                    </div>
                    
                    <button onclick="timelineApp.toggleCommentSection('subtask', ${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="comment-btn" title="Comments">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <div class="date-input-container">
                            <input type="text" value="${subtask.startDate ? formatDate(parseDate(subtask.startDate)) : ''}" placeholder="Start" class="date-input ${dateInputClasses}" ${subtask.isDriven ? 'readonly disabled' : ''} data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-start" data-date="${subtask.startDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${!subtask.isDriven ? iconHtml : ''}
                        </div>
                        <div class="date-input-container">
                            <input type="text" value="${subtask.endDate ? formatDate(parseDate(subtask.endDate)) : ''}" placeholder="End" class="date-input" data-project-id="${projectId}" data-phase-id="${phaseId}" data-task-id="${taskId}" data-subtask-id="${subtask.id}" data-type="subtask-end" data-date="${subtask.endDate || ''}" oninput="timelineApp.formatDateInput(event)" onblur="timelineApp.handleManualDateInput(event)" onkeydown="timelineApp.handleDateInputKeydown(event)">
                            ${iconHtml}
                        </div>
                    <button onclick="timelineApp.deleteSubtask(${projectId}, ${phaseId}, ${taskId}, ${subtask.id})" class="text-gray-400 hover:text-red-500 text-xl font-bold w-5 text-center flex-shrink-0">&times;</button>
                </div>
                <div id="comment-section-subtask-${subtask.id}" class="comment-section hidden"></div>
            </div>
            `;
    });
    return html + '</div>';
}

function renderLog(project) {
    if (!project.logs || project.logs.length === 0) return '<p class="text-xs text-secondary">No changes logged.</p>';
    let tableHtml = `<table class="w-full text-xs font-mono"><thead><tr class="border-b border-primary"><th class="text-left p-1 w-1/4">Timestamp</th><th class="text-left p-1 w-1/4">Item</th><th class="text-left p-1">Change</th><th class="text-left p-1">Reason</th></tr></thead><tbody>`;
    [...project.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => {
        const rowClass = log.type === 'unlock' ? 'unlock-log-entry' : '';
        let changeText = '';
        if (log.type === 'deletion') {
            changeText = 'Deleted';
        } else if (log.type === 'lock' || log.type === 'unlock') {
            changeText = log.type.charAt(0).toUpperCase() + log.type.slice(1) + 'ed';
        } else {
            changeText = `${log.from ? formatDate(parseDate(log.from)) : 'None'} -> ${formatDate(parseDate(log.to))}`;
        }
        tableHtml += `<tr class="border-b border-secondary ${rowClass}"><td class="p-1 align-top">${formatLogTimestamp(new Date(log.timestamp))}</td><td class="p-1 align-top">${log.item}</td><td class="p-1 align-top">${changeText}</td><td class="p-1 align-top">${log.comment}</td></tr>`;
    });
    return tableHtml + '</tbody></table>';
}

export function renderDeletedProjectsLog() {
    const container = document.getElementById('deleted-projects-log-content');
    const toggleBtn = state.elements.toggleDeletedLogBtn;
    const chevron = document.getElementById('deleted-log-chevron');

    if (!state.deletedProjectLogs || state.deletedProjectLogs.length === 0) {
        if(container) container.innerHTML = '';
        if(toggleBtn) toggleBtn.classList.add('hidden');
        return;
    }

    if(toggleBtn) toggleBtn.classList.remove('hidden');
    if(state.deletedLogCollapsed){
        if(container) container.classList.add('hidden');
        if(chevron) chevron.classList.add('-rotate-90');
    } else {
        if(container) container.classList.remove('hidden');
        if(chevron) chevron.classList.remove('-rotate-90');
    }

    let tableHtml = `<div class="project-card p-3">
        <table class="w-full text-xs font-mono">
            <thead>
                <tr class="border-b border-primary">
                    <th class="text-left p-1 w-1/4">Timestamp</th>
                    <th class="text-left p-1 w-1/4">Item</th>
                    <th class="text-left p-1">Change</th>
                    <th class="text-left p-1">Reason</th>
                </tr>
            </thead>
            <tbody>`;

    [...state.deletedProjectLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(log => {
        tableHtml += `<tr class="border-b border-secondary">
                            <td class="p-1 align-top">${formatLogTimestamp(new Date(log.timestamp))}</td>
                            <td class="p-1 align-top">${log.item}</td>
                            <td class="p-1 align-top">Deleted</td>
                            <td class="p-1 align-top">${log.comment}</td>
                        </tr>`;
    });

    tableHtml += '</tbody></table></div>';
    if(container) container.innerHTML = tableHtml;
}

// --- HELPERS ---

function sortByEndDate(a, b, dateKey = 'endDate') {
    const dateA_end = a[dateKey] ? parseDate(a[dateKey]) : null;
    const dateB_end = b[dateKey] ? parseDate(b[dateKey]) : null;

    if (dateA_end && dateB_end) {
        const diff = dateA_end - dateB_end;
        if (diff !== 0) return diff;
    } else if (dateA_end) return -1;
    else if (dateB_end) return 1;

    const startDateKey = dateKey.startsWith('effective') ? 'effectiveStartDate' : 'startDate';
    const dateA_start = a[startDateKey] ? parseDate(a[startDateKey]) : null;
    const dateB_start = b[startDateKey] ? parseDate(b[startDateKey]) : null;

    if (dateA_start && dateB_start) return dateA_start - dateB_start;
    if (dateA_start) return -1;
    if (dateB_start) return 1;
    return 0;
}

function getDependencyIcon(item) {
    const dependentCount = item.dependents?.length || 0;
    const isDependentSource = dependentCount > 0;
    const isParentSource = (item.dependencies?.length || 0) > 0;
    let dependentSourceClass = isDependentSource ? 'is-dependent-source' : '';
    let parentSourceClass = isParentSource ? 'is-parent-source' : '';

    return `
        <div class="dependency-container">
            <div class="dependency-circle ${dependentSourceClass}"
                onmouseover="timelineApp.showDependencyTooltip(event, ${item.id})"
                onmouseout="timelineApp.hideDependencyTooltip()"
                onclick="timelineApp.startDependencyMode(${item.id})">${isDependentSource ? `<span>${dependentCount}</span>` : ''}</div>
            <div class="dependency-circle ${parentSourceClass}"
                onmouseover="timelineApp.showDependencyTooltip(event, ${item.id})"
                onmouseout="timelineApp.hideDependencyTooltip()"
                onclick="timelineApp.handleCircleClick(${item.id})"></div>
        </div>
    `;
}