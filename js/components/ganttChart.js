import { state } from '../core/state.js';
import { parseDate, formatDate, getPlannedDateForProgress, getBoundaryDate } from '../core/utils.js'; 
import { saveState } from '../managers/dataManager.js';
import { renderProjects } from './views.js';

// --- CHART HELPERS ---

export function getTickInterval(domain) {
    const [startDate, endDate] = domain;
    const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (durationDays <= 14) {         // Up to 2 weeks
        return d3.timeDay.every(2);
    } else if (durationDays <= 60) {  // Up to ~2 months
        return d3.timeWeek.every(1);
    } else if (durationDays <= 180) { // Up to ~6 months
        return d3.timeMonth.every(1);
    } else if (durationDays <= 366) { // Up to ~1 year
        return d3.timeMonth.every(2);
    } else if (durationDays <= 731) { // Up to ~2 years
        return d3.timeMonth.every(3); // Quarterly
    } else if (durationDays <= 1460) { // Up to ~4 years
        return d3.timeMonth.every(6); // Half-yearly
    } else {                          // More than 4 years
        return d3.timeYear.every(1);
    }
}

export function getTickFormat(domain) {
    const [startDate, endDate] = domain;
    const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (durationDays <= 93) { // Up to a quarter
        return d3.timeFormat("%b %d"); // e.g., Jan 01
    } else if (durationDays <= 366) { // Up to a year
        return d3.timeFormat("%b '%y"); // e.g., Jan '25
    } else { // More than a year
        return d3.timeFormat("%Y"); // e.g., 2025
    }
}

export function resetZoom(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (project) {
        project.zoomDomain = null;
        saveState();
        renderProjects();
    }
}

export function highlightPhaseOnChart(phaseId) {
    d3.selectAll(`.phase-marker-${phaseId} circle`).classed('phase-marker-highlight', true);
}

export function unhighlightPhaseOnChart(phaseId) {
    d3.selectAll(`.phase-marker-${phaseId} circle`).classed('phase-marker-highlight', false);
}


// --- MAIN GANTT CHART ---

export function drawChart(project) {
    const container = d3.select(`#chart-${project.id}`);
    if (container.empty() || !project.startDate || !project.endDate) return;
    
    setTimeout(() => {
        const width = container.node().getBoundingClientRect().width;
        if (width <= 0) return;
        container.selectAll("*").remove();

        let tooltip = d3.select("body").select(".chart-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
        }

        const margin = { top: 10, right: 20, bottom: 20, left: 40 },
            chartWidth = width - margin.left - margin.right,
            height = container.node().getBoundingClientRect().height - margin.top - margin.bottom;
        
        const svg = container.append("svg")
            .attr("width", chartWidth + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        const x = d3.scaleTime().range([0, chartWidth]),
            y = d3.scaleLinear().range([height, 0]);

        const startDate = project.zoomDomain ? parseDate(project.zoomDomain[0]) : parseDate(project.startDate);
        const endDate = project.zoomDomain ? parseDate(project.zoomDomain[1]) : parseDate(project.endDate);

        x.domain([startDate, endDate]);
        y.domain([0, 100]);

        const tickInterval = getTickInterval(x.domain());
        const tickFormat = getTickFormat(x.domain());
        
        svg.append("g")
            .attr("class", "chart-grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).ticks(tickInterval).tickFormat(tickFormat));

        svg.append("g")
            .attr("class", "chart-grid")
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}%`));

        // Ghost Finish Lines (Past End Dates)
        const endDateChanges = project.logs
            .filter(log => log.item.includes(`Project '${project.name}' end date`) && log.from)
            .map(log => log.from);
        
        if (project.originalEndDate) {
            endDateChanges.push(project.originalEndDate);
        }
        
        const uniquePriorEndDates = [...new Set(endDateChanges)].filter(d => d !== project.endDate);

        uniquePriorEndDates.forEach(dateStr => {
            const date = parseDate(dateStr);
            if (date) {
                svg.append("line")
                    .attr("class", "ghost-finish-line")
                    .attr("x1", x(date))
                    .attr("y1", 0)
                    .attr("x2", x(date))
                    .attr("y2", height);
            }
        });

        // Today Line
        const today = new Date();
        if (today >= startDate && today <= endDate) {
            svg.append("line")
                .attr("class", "today-line")
                .attr("x1", x(today))
                .attr("y1", 0)
                .attr("x2", x(today))
                .attr("y2", height);
        }

        // Scope / Planned Line
        const scopedPhases = [...project.phases]
            .filter(p => p.startDate && p.endDate)
            .sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));

        const scopePathData = [];
        if (scopedPhases.length > 0) {
            scopePathData.push({ date: parseDate(scopedPhases[0].startDate), progress: 0 });
            scopedPhases.forEach((phase, i) => {
                const progressPerPhase = 100 / scopedPhases.length;
                const cumulativeProgress = (i + 1) * progressPerPhase;
                scopePathData.push({ date: parseDate(phase.endDate), progress: cumulativeProgress });
            });
        }

        if (scopePathData.length > 1) {
            const scopeLine = d3.line().x(d => x(d.date)).y(d => y(d.progress));
            svg.append("path")
                .datum(scopePathData)
                .attr("class", "planned-line")
                .attr("d", scopeLine)
                .style("fill", "none");
        } else {
            svg.append("line")
                .attr("class", "planned-line")
                .attr("x1", x(parseDate(project.startDate)))
                .attr("y1", y(0))
                .attr("x2", x(parseDate(project.endDate)))
                .attr("y2", y(100));
        }

        svg.append("line")
            .attr("class", "finish-line")
            .attr("x1", x(parseDate(project.endDate)))
            .attr("y1", 0)
            .attr("x2", x(parseDate(project.endDate)))
            .attr("y2", height);

        // Actual Progress Line
        const allTasks = project.phases.flatMap(phase => phase.tasks).filter(task => task.effectiveEndDate);
        const firstActivityDate = parseDate(getBoundaryDate(allTasks, 'earliest')) || parseDate(project.startDate);
        const pathData = [{ date: firstActivityDate, progress: 0 }];
        let cumulativeProgress = 0;

        allTasks.sort((a,b) => parseDate(a.effectiveEndDate) - parseDate(b.effectiveEndDate)).forEach(task => {
            const dateForPoint = parseDate(task.effectiveEndDate);
            if (dateForPoint) {
                cumulativeProgress += 100 / (allTasks.length || 1);
                pathData.push({ date: dateForPoint, progress: cumulativeProgress, completed: task.completed, name: task.name });
            }
        });

        const line = d3.line().x(d => x(d.date)).y(d => y(d.progress));

        for (let i = 0; i < pathData.length - 1; i++) {
            const segment = [pathData[i], pathData[i+1]];
            const endPoint = segment[1];

            const plannedDateForProgress = getPlannedDateForProgress(endPoint.progress, scopePathData, project);
            const actualDate = endPoint.date;
            const isLate = actualDate > plannedDateForProgress || actualDate > parseDate(project.endDate);
            const colorClass = isLate ? 'stroke-red-500' : 'stroke-green-500';

            svg.append("path")
                .datum(segment)
                .attr("class", `${endPoint.completed ? 'actual-line' : 'projected-line'} ${colorClass}`)
                .attr("d", line);
        }

        // Actual Points
        svg.selectAll(".actual-point")
            .data(pathData.slice(1).filter(d=>d.completed))
            .enter()
            .append("circle")
            .attr("class", "actual-point")
            .attr("cx", d => x(d.date))
            .attr("cy", d => y(d.progress))
            .attr("fill", d => {
                const plannedDateForProgress = getPlannedDateForProgress(d.progress, scopePathData, project);
                const actualDate = d.date;
                const isLate = actualDate > plannedDateForProgress || actualDate > parseDate(project.endDate);
                return isLate ? '#ef4444' : '#22c55e';
            });

        // Phase Markers
        const phaseMarkers = svg.selectAll(".phase-marker")
            .data(scopedPhases)
            .enter()
            .append("g")
            .attr("class", d => `phase-marker phase-marker-${d.id}`)
            .attr("transform", (d, i) => {
                const phaseEndDate = parseDate(d.endDate);
                const progressPerPhase = 100 / scopedPhases.length;
                const phaseEndProgress = (i + 1) * progressPerPhase;
                return `translate(${x(phaseEndDate)}, ${y(phaseEndProgress)})`;
            })
            .on("mouseover", function(event, d) {
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.name}</strong><br>Ends: ${formatDate(parseDate(d.effectiveEndDate))}<br>Progress: ${Math.round(d.progress || 0)}%`);
                d3.select(this).select('circle').classed('phase-marker-highlight', true);
                const phaseRow = document.querySelector(`.phase-row[data-id='${d.id}']`);
                if (phaseRow) phaseRow.classList.add('phase-row-highlight');
            })
            .on("mousemove", (event) => {
                tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function(event, d) {
                tooltip.style("visibility", "hidden");
                d3.select(this).select('circle').classed('phase-marker-highlight', false);
                const phaseRow = document.querySelector(`.phase-row[data-id='${d.id}']`);
                if (phaseRow) phaseRow.classList.remove('phase-row-highlight');
            });

        phaseMarkers.append("circle").attr("class", "phase-marker-circle");
        phaseMarkers.append("text").attr("class", "phase-marker-text").text((d, i) => `P${i + 1}`);

        // Brushing (Zoom)
        const brush = d3.brushX()
            .extent([[0, 0], [chartWidth, height]])
            .on("end", (event) => {
                if (!event.selection) return;
                const [x0, x1] = event.selection.map(x.invert);
                project.zoomDomain = [x0.toISOString().split('T')[0], x1.toISOString().split('T')[0]];
                saveState();
                renderProjects();
            });
        
        svg.append("g").attr("class", "brush").call(brush);

    }, 0);
}


// --- OVERALL LOAD CHART ---

export function drawOverallLoadChart() {
    const containerId = `overall-load-chart`;
    const container = d3.select(`#${containerId}`);
    if (container.empty()) return;
    container.selectAll("*").remove();

    const legendContainer = d3.select('#overall-load-legend');
    legendContainer.html('');

    const allTasks = [];
    state.projects.forEach(project => {
        project.phases.forEach(phase => {
            phase.tasks.forEach(task => {
                if (task.subtasks && task.subtasks.length > 0) {
                    task.subtasks.forEach(subtask => {
                        if (subtask.endDate) allTasks.push({ name: subtask.name, endDate: subtask.endDate, colorKey: project.name });
                    });
                } else if (task.endDate) {
                    allTasks.push({ name: task.name, endDate: task.endDate, colorKey: project.name });
                }
            });
        });
    });

    if (allTasks.length === 0) {
        container.html(`<div class="flex items-center justify-center h-full text-gray-400">No tasks with due dates.</div>`);
        return;
    }

    const tasksByWeek = d3.group(allTasks, d => d3.timeMonday(parseDate(d.endDate)));
    const uniqueProjectNames = [...new Set(allTasks.map(t => t.colorKey))];
    const overallChartColor = d3.scaleOrdinal(d3.schemeTableau10).domain(uniqueProjectNames);

    const stackData = Array.from(tasksByWeek.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([week, tasks]) => {
            const weekData = { week: week };
            uniqueProjectNames.forEach(name => {
                weekData[name] = tasks.filter(t => t.colorKey === name).length;
            });
            return weekData;
        });

    const stack = d3.stack().keys(uniqueProjectNames);
    const series = stack(stackData);

    setTimeout(() => {
        const width = container.node().getBoundingClientRect().width;
        if (width <= 0) return;

        const margin = { top: 20, right: 20, bottom: 50, left: 40 },
            chartWidth = width - margin.left - margin.right,
            height = container.node().getBoundingClientRect().height - margin.top - margin.bottom;

        const svg = container.append("svg")
            .attr("width", chartWidth + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand().domain(stackData.map(d => d.week)).range([0, chartWidth]).padding(0.2);
        const yMax = d3.max(series, d => d3.max(d, d => d[1]));
        const y = d3.scaleLinear().domain([0, yMax > 0 ? yMax : 1]).nice().range([height, 0]);

        svg.append("g").attr("class", "chart-grid")
            .attr("transform", `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %d")))
            .selectAll("text").style("font-size", "10px").attr("transform", "rotate(-45)").style("text-anchor", "end");

        svg.append("g").attr("class", "chart-grid").call(d3.axisLeft(y).ticks(Math.min(yMax, 10)).tickFormat(d3.format("d")));

        let tooltip = d3.select("body").select(".chart-tooltip");
        if (tooltip.empty()) {
            tooltip = d3.select("body").append("div").attr("class", "chart-tooltip");
        }

        svg.append("g").selectAll("g")
            .data(series).enter().append("g")
            .attr("fill", d => overallChartColor(d.key))
            .selectAll("rect")
            .data(d => d).enter().append("rect")
            .attr("x", d => x(d.data.week))
            .attr("y", d => y(d[1]))
            .attr("height", d => y(d[0]) - y(d[1]))
            .attr("width", x.bandwidth())
            .on("mouseover", function(event, d) {
                const seriesData = d3.select(this.parentNode).datum();
                const projectName = seriesData.key;
                const taskCount = d.data[projectName];
                if (taskCount === 0) return;
                const weekStart = d3.timeFormat("%b %d")(d.data.week);
                tooltip.style("visibility", "visible").html(`<strong>${projectName}</strong><br>Week of ${weekStart}<br>Tasks Due: ${taskCount}`);
            })
            .on("mousemove", (event) => { tooltip.style("top", (event.pageY - 10) + "px").style("left", (event.pageX + 10) + "px"); })
            .on("mouseout", () => { tooltip.style("visibility", "hidden"); });

        const legend = legendContainer.selectAll('.legend-item').data(uniqueProjectNames).enter().append('div').attr('class', 'flex items-center');
        legend.append('div').style('width', '12px').style('height', '12px').style('background-color', d => overallChartColor(d)).attr('class', 'mr-2 rounded-sm');
        legend.append('span').text(d => d);
    }, 0);
}


// --- PRINT VIEW CHART ---

export function drawPrintChartForProject(project, items, container) {
    if (items.length === 0) return;

    const containerBounds = container.getBoundingClientRect();
    // const itemHeight = containerBounds.height / items.length; // Unused, keeping logic matches original

    const margin = { top: 0, right: 10, bottom: 20, left: 0 };
    const width = containerBounds.width - margin.left - margin.right;
    const height = containerBounds.height - margin.top - margin.bottom;

    const svg = d3.select(container).append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    
    const startDate = parseDate(project.startDate);
    const endDate = parseDate(project.endDate);

    const x = d3.scaleTime().domain([startDate, endDate]).range([0, width]);
    const y = d3.scaleBand().domain(items.map(d => d.id)).range([0, height]).padding(0.3);

    svg.append("g").attr("class", "gantt-x-axis chart-grid")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).ticks(d3.timeWeek.every(1)).tickFormat(d3.timeFormat("%b %d")));

    const bars = svg.selectAll(".bar")
        .data(items.filter(d => (d.effectiveStartDate || d.startDate) && (d.effectiveEndDate || d.endDate)))
        .enter().append("g");
        
    bars.append("rect")
        .attr("class", "gantt-bar-bg")
        .attr("x", d => x(parseDate(d.effectiveStartDate || d.startDate)))
        .attr("y", d => y(d.id))
        .attr("width", d => {
            const start = parseDate(d.effectiveStartDate || d.startDate);
            let end = parseDate(d.effectiveEndDate || d.endDate);
            return start && end ? Math.max(0, x(end) - x(start)) : 0;
        })
        .attr("height", y.bandwidth())
        .attr("rx", 3)
        .attr("ry", 3);

    bars.append("rect")
        .attr("class", "gantt-bar-progress")
        .attr("x", d => x(parseDate(d.effectiveStartDate || d.startDate)))
        .attr("y", d => y(d.id))
        .attr("width", d => {
            const start = parseDate(d.effectiveStartDate || d.startDate);
            let end = parseDate(d.effectiveEndDate || d.endDate);
            if (!start || !end) return 0;
            const totalWidth = Math.max(0, x(end) - x(start));
            return totalWidth * ((d.progress || 0) / 100);
        })
        .attr("height", y.bandwidth())
        .attr("rx", 3)
        .attr("ry", 3);
    
    const today = new Date();
    if (today >= startDate && today <= endDate) {
        svg.append("line").attr("class", "today-line").attr("x1", x(today)).attr("y1", 0).attr("x2", x(today)).attr("y2", height);
    }

    const phaseDividers = items.filter(item => item.level === 2);
    svg.selectAll(".phase-divider-line")
        .data(phaseDividers)
        .enter()
        .append("line")
        .attr("class", "phase-divider-line")
        .attr("x1", d => x(parseDate(d.effectiveStartDate || d.startDate)))
        .attr("y1", 0)
        .attr("x2", d => x(parseDate(d.effectiveStartDate || d.startDate)))
        .attr("y2", height);
}