import { state } from '../core/state.js';
import { parseDate, getBoundaryDate } from '../core/utils.js';

/* =========================================
   ROLLUP CALCULATIONS (Bottom-Up)
   ========================================= */

export function calculateRollups() {
    state.projects.forEach(p => {
        p.phases.forEach(phase => {
            phase.tasks.forEach(task => {
                // 1. Task Rollup (from Subtasks)
                const hasSubtasks = task.subtasks && task.subtasks.length > 0;
                
                if (hasSubtasks) {
                    task.effectiveStartDate = getBoundaryDate(task.subtasks, 'earliest');
                    task.effectiveEndDate = getBoundaryDate(task.subtasks, 'latest');
                    
                    const completedSubtasks = task.subtasks.filter(st => st.completed).length;
                    task.progress = task.subtasks.length > 0 ? (completedSubtasks / task.subtasks.length) * 100 : 0;
                    task.completed = task.progress === 100;
                } else {
                    // No subtasks -> use own dates
                    task.effectiveStartDate = task.startDate;
                    task.effectiveEndDate = task.endDate;
                    task.progress = task.completed ? 100 : 0;
                }
            });

            // 2. Phase Rollup (from Tasks)
            const tasksStartDate = getBoundaryDate(phase.tasks, 'earliest');
            const tasksEndDate = getBoundaryDate(phase.tasks, 'latest');

            // Combine the phase's manually set dates with the calculated task boundaries
            const allStartDates = [tasksStartDate, phase.startDate].filter(Boolean).map(d => parseDate(d));
            const allEndDates = [tasksEndDate, phase.endDate].filter(Boolean).map(d => parseDate(d));

            phase.effectiveStartDate = allStartDates.length > 0
                ? new Date(Math.min.apply(null, allStartDates)).toISOString().split('T')[0]
                : null;

            phase.effectiveEndDate = allEndDates.length > 0
                ? new Date(Math.max.apply(null, allEndDates)).toISOString().split('T')[0]
                : null;

            const totalProgress = phase.tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
            phase.progress = phase.tasks.length > 0 ? totalProgress / phase.tasks.length : 0;
            phase.completed = phase.progress === 100;
        });

        // 3. Project Rollup (from Phases)
        p.totalPhaseProgress = p.phases.reduce((sum, ph) => sum + (ph.progress || 0), 0);
        p.overallProgress = p.phases.length > 0 ? p.totalPhaseProgress / p.phases.length : 0;
    });
}

/* =========================================
   DEPENDENCY RESOLUTION (Top-Down / Waterfall)
   ========================================= */

export function resolveDependencies() {
    const allItems = new Map();
    
    // 1. Index everything
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

    // Reset driven status
    allItems.forEach(item => item.isDriven = false);

    // 2. Resolve (Simple single-pass, technically should be recursive or topological sort for deep chains)
    // For performance in this light app, a simple iterative pass usually suffices if chains aren't deep,
    // but typically you iterate until no changes or max iterations.
    // Here we stick to the original logic which was a single pass after sorting (or just simple pass).
    
    // To support deep chains, we iterate based on the map size as a safe upper bound, 
    // or just once if we assume the user connects them in order. 
    // The original code iterated once. We will stick to that to match behavior, 
    // but ensure calculateRollups is called at the end.

    allItems.forEach(item => {
        if (item.dependencies && item.dependencies.length > 0 && !item.locked) {
            const parentId = item.dependencies[0]; // Currently supports 1 dependency driving dates
            const parent = allItems.get(parentId);

            if (parent) {
                const parentEndDateValue = parent.effectiveEndDate || parent.endDate;
                
                if (parentEndDateValue) {
                    const parentEndDate = parseDate(parentEndDateValue);
                    const newStartDate = new Date(parentEndDate);

                    // Maintain original duration
                    const oldStartDate = item.startDate ? parseDate(item.startDate) : null;
                    const oldEndDate = item.endDate ? parseDate(item.endDate) : null;
                    let duration = null;
                    
                    if (oldStartDate && oldEndDate) {
                        duration = oldEndDate.getTime() - oldStartDate.getTime();
                    }

                    item.startDate = newStartDate.toISOString().split('T')[0];

                    if (duration !== null) {
                        const newEndDate = new Date(newStartDate.getTime() + duration);
                        item.endDate = newEndDate.toISOString().split('T')[0];
                    }

                    item.isDriven = true;
                    item.driverName = parent.name;
                }
            }
        }
    });
    
    // Re-calculate rollups because changing a start date might shift the whole parent phase
    calculateRollups();
}

/* =========================================
   PACING / CURVE LOGIC
   ========================================= */

export function getScopedPlannedProgress(date, scopePathData, project) {
    if (!scopePathData || scopePathData.length < 2) {
        // Fallback to linear project dates if no valid scope phases exist
        if (!project || !project.startDate || !project.endDate) return 0;
        const projectStartDate = parseDate(project.startDate);
        const projectEndDate = parseDate(project.endDate);
        if (!projectStartDate || !projectEndDate) return 0;
        const totalDuration = projectEndDate.getTime() - projectStartDate.getTime();
        if (totalDuration <= 0) return (date >= projectEndDate) ? 100 : 0;
        const elapsed = Math.max(0, date.getTime() - projectStartDate.getTime());
        return Math.min(100, (elapsed / totalDuration) * 100);
    }

    const targetTime = date.getTime();
    const firstPoint = scopePathData[0];
    const lastPoint = scopePathData[scopePathData.length - 1];

    if (targetTime <= firstPoint.date.getTime()) return 0;
    if (targetTime >= lastPoint.date.getTime()) return 100;

    let p1 = firstPoint, p2 = lastPoint;
    for (let i = 0; i < scopePathData.length - 1; i++) {
        if (targetTime >= scopePathData[i].date.getTime() && targetTime <= scopePathData[i + 1].date.getTime()) {
            p1 = scopePathData[i];
            p2 = scopePathData[i + 1];
            break;
        }
    }

    const segmentDuration = p2.date.getTime() - p1.date.getTime();
    if (segmentDuration === 0) return p1.progress;

    const timeIntoSegment = targetTime - p1.date.getTime();
    const progressInSegment = p2.progress - p1.progress;

    const plannedProgress = p1.progress + (progressInSegment * (timeIntoSegment / segmentDuration));
    return plannedProgress;
}

export function getPlannedDateForProgress(progress, scopePathData, project) {
    if (progress <= 0) return parseDate(project.startDate);
    if (progress >= 100) return parseDate(project.endDate);

    // Fallback for simple projects without detailed phases
    if (!scopePathData || scopePathData.length < 2) {
        const projectStartDate = parseDate(project.startDate);
        const projectEndDate = parseDate(project.endDate);
        if (!projectStartDate || !projectEndDate) return new Date(); // Should not happen
        const totalDuration = projectEndDate.getTime() - projectStartDate.getTime();
        const timeOffset = totalDuration * (progress / 100);
        return new Date(projectStartDate.getTime() + timeOffset);
    }

    const firstPoint = scopePathData[0];
    const lastPoint = scopePathData[scopePathData.length - 1];

    if (progress <= firstPoint.progress) return firstPoint.date;
    if (progress >= lastPoint.progress) return lastPoint.date;

    let p1 = firstPoint, p2 = lastPoint;
    for (let i = 0; i < scopePathData.length - 1; i++) {
        if (progress >= scopePathData[i].progress && progress <= scopePathData[i + 1].progress) {
            p1 = scopePathData[i];
            p2 = scopePathData[i + 1];
            break;
        }
    }

    const progressInSegment = p2.progress - p1.progress;
    if (progressInSegment === 0) return p1.date;

    const progressRatio = (progress - p1.progress) / progressInSegment;
    const segmentDuration = p2.date.getTime() - p1.date.getTime();
    const timeOffset = segmentDuration * progressRatio;

    return new Date(p1.date.getTime() + timeOffset);
}