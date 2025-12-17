// Assumes d3 is loaded globally via index.html script tag

export const parseDate = d3.timeParse("%Y-%m-%d");
export const formatDate = d3.timeFormat("%m/%d/%y");
export const formatLogTimestamp = d3.timeFormat("%Y-%m-%d %H:%M");

export function isShortcut(event, key, { ctrl = false, alt = false, shift = false } = {}) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
    return (
        ctrlKey === ctrl &&
        event.altKey === alt &&
        event.shiftKey === shift &&
        event.key.toLowerCase() === key.toLowerCase()
    );
}

export function getDurationProgress(startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return 0;
    const start = parseDate(startDateStr).getTime();
    const end = parseDate(endDateStr).getTime();
    const now = new Date().getTime();
    if (now < start) return 0;
    if (now > end) return 100;
    const totalDuration = end - start;
    if (totalDuration <= 0) return 100;
    const elapsed = now - start;
    return (elapsed / totalDuration) * 100;
}

export function countWeekdays(startDate, endDate) {
    let count = 0;
    const curDate = new Date(startDate.getTime());
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    return count;
}

export function getDaysLeft(endDateStr) {
    if (!endDateStr) return { text: '-', tooltip: 'No end date', isOverdue: false, days: null, className: '' };
    const end = parseDate(endDateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (end < now) {
        const daysOverdue = countWeekdays(end, now);
        return { text: `${daysOverdue}`, tooltip: `${daysOverdue} weekdays overdue`, isOverdue: true, days: -daysOverdue, className: 'days-left-pill-overdue' };
    } else if (end.getTime() === now.getTime()) {
        return { text: '0', tooltip: 'Due today', isOverdue: false, days: 0, className: 'days-left-pill-due-today' };
    } else {
        const daysLeft = countWeekdays(now, end);
        return { text: `${daysLeft}`, tooltip: `${daysLeft} weekdays left`, isOverdue: false, days: daysLeft, className: '' };
    }
}

export function getBoundaryDate(items, type) {
    const dates = items.map(item => parseDate(type === 'latest' ? item.effectiveEndDate || item.endDate : item.effectiveStartDate || item.startDate)).filter(Boolean);
    if (dates.length === 0) return null;
    const boundary = type === 'latest' ? new Date(Math.max.apply(null, dates)) : new Date(Math.min.apply(null, dates));
    return boundary.toISOString().split('T')[0];
}

export function getPlannedDateForProgress(progress, scopePathData, project) {
    if (progress <= 0) return parseDate(project.startDate);
    if (progress >= 100) return parseDate(project.endDate);

    // Fallback for linear projects without scope data
    if (!scopePathData || scopePathData.length < 2) {
        const projectStartDate = parseDate(project.startDate);
        const projectEndDate = parseDate(project.endDate);
        if (!projectStartDate || !projectEndDate) return new Date();
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