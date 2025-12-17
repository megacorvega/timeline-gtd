export const state = {
    // --- DATA ---
    projects: [],
    deletedProjectLogs: [],
    history: [],
    redoStack: [],
    MAX_HISTORY: 10,
    
    // --- UI STATE ---
    activeTab: 'projects', // 'list' (Inbox), 'projects', 'overall-load'
    projectViewMode: 'gantt', // 'gantt' or 'linear' (Action Hub)
    tabOrder: ['list', 'projects', 'overall-load'], // Default order
    
    // --- FILTERS & TOGGLES ---
    hideCompletedTasks: false,
    tagFilter: 'all',
    upcomingProjectFilter: 'all',
    deletedLogCollapsed: true,

    // --- INTERACTION STATE ---
    dependencyMode: false,
    firstSelectedItem: null,        // For creating dependencies
    
    // --- PENDING ACTIONS (For Modals) ---
    pendingDateChange: null,        // Context when user changes a date
    pendingDeletion: null,          // Context when user clicks delete
    pendingLockChange: null,        // Context when user toggles lock
    pendingMoveTask: null,          // Context when moving Inbox -> Project
    pendingClearDependencies: null, // Context when clicking a dependency dot
    
    // --- GLOBALS & CACHE ---
    sharedPicker: null,             // Flatpickr instance
    currentPickerContext: null,     // Which input opened the picker
    taskLoadChartColor: null,       // D3 color scale
    resizeTimeout: null,            // Debounce timer
    
    // --- DOM ELEMENT CACHE ---
    // Populated by main.js > cacheDOMElements()
    elements: {}
};