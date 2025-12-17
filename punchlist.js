window.punchListApp = {
    STORAGE_KEY: 'timelinePunchListData',
    taskList: null,
    initialized: false,
    isMac: /Mac|iPod|iPhone|iPad/.test(navigator.platform),

    // --- INITIALIZATION ---

    init() {
        if (this.initialized) return;
        
        this.taskList = document.getElementById('punch-list-container');
        if (!this.taskList) return;

        this.loadList();
        this.addEventListeners();
        this.initialized = true;
        console.log("Punchlist (Inbox) Initialized");
    },

    isShortcut(event, key, { ctrl = true, alt = false, shift = false } = {}) {
        const ctrlKey = this.isMac ? event.metaKey : event.ctrlKey;
        return (
            ctrlKey === ctrl &&
            event.altKey === alt &&
            event.shiftKey === shift &&
            event.key.toLowerCase() === key.toLowerCase()
        );
    },

    // --- DOM & EVENTS ---

    addEventListeners() {
        // 1. Text Input & Markdown Processing
        this.taskList.addEventListener('input', (e) => {
            const target = e.target;
            if (target && target.classList.contains('task-label')) {
                this.handleMarkdown.call(this, e);
            }
        });

        // 2. Keyboard Navigation
        this.taskList.addEventListener('keydown', (e) => {
            const target = e.target;
            if (target && target.classList.contains('task-label')) {
                this.handleKeyboard.call(this, e);
            }
        });

        // 3. Focus Tracking
        document.addEventListener('focusin', this.updateActiveTaskHighlight.bind(this));
        document.addEventListener('click', this.updateActiveTaskHighlight.bind(this));

        // 4. Checkbox State
        this.taskList.addEventListener('change', e => {
            if (e.target.type === 'checkbox') {
                this.updateCheckboxState(e.target);
            }
        });
        
        // 5. Paste Handling
        this.taskList.addEventListener('paste', (e) => {
             const target = e.target;
             if (target && target.classList.contains('task-label')) {
                 e.preventDefault();
                 const text = (e.clipboardData || window.clipboardData).getData('text');
                 document.execCommand('insertText', false, text);
             }
        });
    },

    // --- DATA MANAGEMENT ---

    saveList() {
        if (!this.taskList) return;
        const items = [...this.taskList.querySelectorAll('.task-item')];
        const dataToSave = items.map(li => {
            const label = li.querySelector('.task-label');
            if (!label) return null;
            
            const text = label.innerText;
            let type = 'text';
            
            if (label.classList.contains('header-1')) type = 'header-1';
            else if (label.classList.contains('header-2')) type = 'header-2';
            else if (label.classList.contains('note-block')) type = 'note';
            else if (li.querySelector('input[type="checkbox"]')) type = 'checkbox';

            // Detect Highlights
            const highlightClass = ['highlight-yellow', 'highlight-blue', 'highlight-purple', 'highlight-red']
                .find(cls => label.classList.contains(cls));

            return { 
                text, 
                type, 
                indent: this.getIndentLevel(li), 
                checked: li.classList.contains('checked'), 
                highlight: highlightClass || null 
            };
        }).filter(Boolean);
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
    },

    loadList() {
        const listData = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        this.taskList.innerHTML = '';
        
        let wrapper = null;
        
        listData.forEach(task => {
            const li = this.createTaskElement(task);
            const label = li.querySelector('.task-label');
            
            // Header 2 Logic (Project Wrappers) - Optional visual grouping
            const isHeader2 = label && label.classList.contains('header-2');
            
            // Just append to list for now to keep simple structure
            this.taskList.appendChild(li);
        });
        
        this.ensureAtLeastOneTask();
        this.updateActiveTaskHighlight();
    },

    // --- ELEMENT CREATION ---

    createTaskElement({ text = '', type = 'text', indent = 0, checked = false, highlight = null } = {}) {
        const li = document.createElement('li');
        li.className = 'task-item';
        if (indent > 0) li.classList.add(`indent-${indent}`);
        if (checked) li.classList.add('checked');

        // Checkbox
        if (type === 'checkbox') {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'custom-checkbox';
            input.checked = checked;
            li.appendChild(input);
        }

        // --- BUTTONS CONTAINER (The New Actions) ---
        if (type === 'text' || type === 'checkbox') {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'punchlist-actions flex items-center mr-2';

            // 1. Move to ACTION HUB (Lightning Icon)
            const actionBtn = document.createElement('button');
            actionBtn.className = 'mr-1 text-amber-500 hover:text-amber-600 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity';
            actionBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
            actionBtn.title = "Move to Action Hub (Single Action)";
            actionBtn.tabIndex = -1; // Skip tab focus
            
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                const label = li.querySelector('.task-label');
                if (label && label.innerText.trim()) {
                    if (window.timelineApp && typeof window.timelineApp.moveInboxTaskToSingleActions === 'function') {
                        window.timelineApp.moveInboxTaskToSingleActions(label.innerText.trim());
                        li.remove();
                        this.saveList();
                        this.ensureAtLeastOneTask();
                    } else {
                        alert("Timeline App not ready. Please check if main.js loaded.");
                    }
                }
            };
            btnContainer.appendChild(actionBtn);

            // 2. Move to PROJECT (Arrow Icon)
            const moveBtn = document.createElement('button');
            moveBtn.className = 'text-gray-400 hover:text-blue-500 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity';
            moveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>`;
            moveBtn.title = "Move to specific Project";
            moveBtn.tabIndex = -1;

            moveBtn.onclick = (e) => {
                e.stopPropagation(); 
                const label = li.querySelector('.task-label');
                if (label && label.innerText.trim()) {
                    // Check if it's highlighted purple (Follow Up)
                    const isFollowUp = label.classList.contains('highlight-purple');
                    
                    if (window.timelineApp && typeof window.timelineApp.promptMoveToProject === 'function') {
                        window.timelineApp.promptMoveToProject(label.innerText.trim(), isFollowUp, () => {
                            // Success Callback
                            li.remove();
                            this.saveList();
                            this.ensureAtLeastOneTask();
                        });
                    }
                }
            };
            btnContainer.appendChild(moveBtn);
            
            li.appendChild(btnContainer);
        }

        // Editable Text Span
        const span = document.createElement('span');
        span.className = 'task-label';
        span.contentEditable = true;
        span.spellcheck = false;
        span.innerText = text;

        if (type === 'header-1') span.classList.add('header-1');
        else if (type === 'header-2') span.classList.add('header-2');
        else if (type === 'note') span.classList.add('note-block');
        
        if (highlight) span.classList.add(highlight);

        li.appendChild(span);
        return li;
    },

    // --- LOGIC ---

    handleKeyboard(e) {
        const li = e.target.closest('.task-item');
        if (!li) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const newItem = this.createTaskElement({ indent: this.getIndentLevel(li) });
            this.insertAfter(li, newItem);
            newItem.querySelector('.task-label').focus();
            this.saveList();
        } else if (e.key === 'Backspace' && e.target.innerText === '') {
            e.preventDefault();
            if (this.taskList.children.length > 1) {
                const prev = li.previousElementSibling;
                li.remove();
                if (prev) {
                    const range = document.createRange();
                    const sel = window.getSelection();
                    const prevLabel = prev.querySelector('.task-label');
                    range.selectNodeContents(prevLabel);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
                this.saveList();
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                this.changeIndent(li, -1);
            } else {
                this.changeIndent(li, 1);
            }
        } else if (e.key === 'ArrowUp' && e.altKey) {
            e.preventDefault();
            this.moveTask(li, -1);
        } else if (e.key === 'ArrowDown' && e.altKey) {
            e.preventDefault();
            this.moveTask(li, 1);
        }
    },

    handleMarkdown(e) {
        const span = e.target;
        const text = span.innerText;
        const li = span.closest('.task-item');

        // Store cursor position
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const offset = range.startOffset;

        let changed = false;

        // Checkbox []
        if (text.startsWith('[] ')) {
            span.innerText = text.substring(3);
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'custom-checkbox';
            li.insertBefore(input, span);
            
            // Re-add action buttons since type changed
            this.refreshActionButtons(li, 'checkbox');
            changed = true;
        } 
        // Header 1 #
        else if (text.startsWith('# ')) {
            span.innerText = text.substring(2);
            span.className = 'task-label header-1';
            this.removeActionButtons(li); // Headers usually don't have move actions
            changed = true;
        } 
        // Header 2 ##
        else if (text.startsWith('## ')) {
            span.innerText = text.substring(3);
            span.className = 'task-label header-2';
            this.removeActionButtons(li);
            changed = true;
        } 
        // Note >
        else if (text.startsWith('> ')) {
            span.innerText = text.substring(2);
            span.className = 'task-label note-block';
            this.removeActionButtons(li);
            changed = true;
        }

        // Highlighting Logic (::y, ::b, ::p, ::r)
        const highlightMap = {
            '::y': 'highlight-yellow', // Important
            '::b': 'highlight-blue',   // Info
            '::p': 'highlight-purple', // Follow Up
            '::r': 'highlight-red'     // Urgent
        };

        for (const [key, cls] of Object.entries(highlightMap)) {
            if (text.includes(key)) {
                span.innerText = text.replace(key, '').trim();
                span.classList.remove('highlight-yellow', 'highlight-blue', 'highlight-purple', 'highlight-red');
                span.classList.add(cls);
                changed = true;
            }
        }

        if (changed) {
            // Restore cursor (best effort)
            try {
                const newRange = document.createRange();
                newRange.setStart(span.firstChild || span, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
            } catch(e) {}
            this.saveList();
        }
    },

    // --- UTILITIES ---

    changeIndent(li, change) {
        let currentinfo = this.getIndentLevel(li);
        let newIndent = Math.max(0, Math.min(8, currentinfo + change)); // Max depth 8
        
        // Remove old indent class
        li.classList.remove(`indent-${currentinfo}`);
        
        // Add new
        if (newIndent > 0) li.classList.add(`indent-${newIndent}`);
        this.saveList();
    },

    getIndentLevel(li) {
        const cls = [...li.classList].find(c => c.startsWith('indent-'));
        return cls ? parseInt(cls.split('-')[1]) : 0;
    },

    moveTask(li, direction) {
        if (direction === -1 && li.previousElementSibling) {
            li.parentNode.insertBefore(li, li.previousElementSibling);
        } else if (direction === 1 && li.nextElementSibling) {
            li.parentNode.insertBefore(li.nextElementSibling, li);
        }
        li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        this.saveList();
    },

    updateCheckboxState(checkbox) {
        const li = checkbox.closest('.task-item');
        if (checkbox.checked) {
            li.classList.add('checked');
        } else {
            li.classList.remove('checked');
        }
        this.saveList();
    },

    updateActiveTaskHighlight() {
        if (!this.taskList) return;
        this.taskList.querySelectorAll('.task-item').forEach(el => el.classList.remove('active'));
        const active = document.activeElement?.closest('.task-item');
        if (active && this.taskList.contains(active)) active.classList.add('active');
    },

    insertAfter(referenceNode, newNode) {
        referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
    },

    ensureAtLeastOneTask() {
        if (this.taskList.children.length === 0) {
            const task = this.createTaskElement();
            this.taskList.appendChild(task);
        }
    },

    // Helpers for dynamic UI updates
    removeActionButtons(li) {
        const container = li.querySelector('.punchlist-actions');
        if (container) container.remove();
    },

    refreshActionButtons(li, type) {
        // Remove existing to prevent dupes
        this.removeActionButtons(li);
        
        if (type === 'checkbox' || type === 'text') {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'punchlist-actions flex items-center mr-2';
            
            // Re-create buttons (Code duplication from createTaskElement, but necessary for dynamic type switching)
            // 1. Lightning
            const actionBtn = document.createElement('button');
            actionBtn.className = 'mr-1 text-amber-500 hover:text-amber-600 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity';
            actionBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>`;
            actionBtn.title = "Move to Action Hub";
            actionBtn.tabIndex = -1;
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                const label = li.querySelector('.task-label');
                if(label && window.timelineApp) {
                     window.timelineApp.moveInboxTaskToSingleActions(label.innerText.trim());
                     li.remove();
                     this.saveList();
                }
            };
            btnContainer.appendChild(actionBtn);

            // 2. Move
            const moveBtn = document.createElement('button');
            moveBtn.className = 'text-gray-400 hover:text-blue-500 flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity';
            moveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>`;
            moveBtn.tabIndex = -1;
            moveBtn.onclick = (e) => {
                e.stopPropagation();
                const label = li.querySelector('.task-label');
                if(label && window.timelineApp) {
                    const isFollowUp = label.classList.contains('highlight-purple');
                    window.timelineApp.promptMoveToProject(label.innerText.trim(), isFollowUp, () => {
                        li.remove();
                        this.saveList();
                    });
                }
            };
            btnContainer.appendChild(moveBtn);

            li.insertBefore(btnContainer, li.querySelector('.task-label'));
        }
    }
};