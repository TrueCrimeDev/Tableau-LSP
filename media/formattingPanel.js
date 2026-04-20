// @ts-check
(function () {
    const vscode = acquireVsCodeApi()
    let state = { elements: {}, pendingEdits: {}, jsonPreview: null, applyMode: 'override' }

    // ── Tab switching ─────────────────────────────────────────────────────────

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
            tab.classList.add('active')
            const target = tab.getAttribute('data-tab')
            if (target) {
                document.getElementById(target)?.classList.add('active')
                if (target === 'tab-export') { vscode.postMessage({ type: 'requestExport' }) }
            }
        })
    })

    // ── Inspect & Edit ────────────────────────────────────────────────────────

    const GROUPS = {
        'Fonts': ['all', 'worksheet', 'worksheet-title', 'tooltip', 'dashboard-title', 'story-title', 'header', 'legend', 'legend-title', 'filter', 'filter-title', 'parameter-ctrl', 'parameter-ctrl-title', 'highlighter', 'highlighter-title', 'page-ctrl-title'],
        'Lines': ['gridline', 'zeroline'],
        'Borders': ['row-divider', 'column-divider', 'table-border'],
        'Shading': ['pane', 'inner-row-banding', 'outer-row-banding', 'inner-column-banding', 'outer-column-banding'],
        'Mark & View': ['mark', 'view'],
    }

    const ELEMENT_ATTRS = {
        'all':                   ['font-color', 'font-family'],
        'worksheet':             ['font-color', 'font-family', 'font-size'],
        'worksheet-title':       ['font-color', 'font-family', 'font-size'],
        'tooltip':               ['font-color', 'font-family', 'font-size'],
        'dashboard-title':       ['font-color', 'font-family', 'font-size', 'font-weight'],
        'story-title':           ['font-color', 'font-family', 'font-size'],
        'header':                ['font-color', 'font-family', 'background-color'],
        'legend':                ['font-color', 'font-family', 'font-size', 'background-color'],
        'legend-title':          ['font-color', 'font-family', 'font-size'],
        'filter':                ['font-color', 'font-family', 'font-size', 'background-color'],
        'filter-title':          ['font-color', 'font-family', 'font-size'],
        'parameter-ctrl':        ['font-color', 'font-family', 'font-size', 'background-color'],
        'parameter-ctrl-title':  ['font-color', 'font-family', 'font-size'],
        'highlighter':           ['font-color', 'font-family', 'font-size', 'background-color'],
        'highlighter-title':     ['font-color', 'font-family', 'font-size'],
        'page-ctrl-title':       ['font-color', 'font-family', 'font-size'],
        'gridline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
        'zeroline':              ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
        'row-divider':           ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
        'column-divider':        ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
        'table-border':          ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
        'pane':                  ['background-color'],
        'inner-row-banding':     ['background-color'],
        'outer-row-banding':     ['background-color'],
        'inner-column-banding':  ['background-color'],
        'outer-column-banding':  ['background-color'],
        'mark':                  ['mark-color'],
        'view':                  ['background-color'],
    }

    const COLOR_ATTRS = new Set(['font-color', 'background-color', 'line-color', 'mark-color'])
    const NUMBER_ATTRS = new Set(['font-size', 'line-width'])
    const SELECT_ATTRS = {
        'font-weight':     ['normal', 'bold'],
        'line-visibility': ['on', 'off'],
        'line-pattern':    ['solid', 'dashed', 'dotted'],
    }

    function renderInspect() {
        const container = document.getElementById('inspect-groups')
        if (!container) { return }
        container.innerHTML = ''

        for (const [groupName, elements] of Object.entries(GROUPS)) {
            const header = document.createElement('div')
            header.className = 'group-header'
            header.textContent = groupName
            container.appendChild(header)

            for (const element of elements) {
                const attrs = ELEMENT_ATTRS[element] || []
                const row = document.createElement('div')
                row.className = 'element-row'
                row.dataset.element = element

                const nameEl = document.createElement('span')
                nameEl.className = 'element-name'
                nameEl.textContent = element
                row.appendChild(nameEl)

                for (const attr of attrs) {
                    const currentVal = (state.pendingEdits[element] !== undefined && state.pendingEdits[element][attr] !== undefined)
                        ? state.pendingEdits[element][attr]
                        : (state.elements[element]?.[attr] ?? null)

                    const group = document.createElement('div')
                    group.className = 'attr-group'

                    const label = document.createElement('span')
                    label.className = 'attr-label'
                    label.textContent = attr
                    group.appendChild(label)

                    if (COLOR_ATTRS.has(attr)) {
                        const swatch = document.createElement('div')
                        swatch.className = 'color-swatch'
                        swatch.style.background = currentVal || '#888888'
                        const input = document.createElement('input')
                        input.type = 'text'
                        input.value = currentVal || ''
                        input.placeholder = '#000000'
                        input.style.width = '90px'
                        input.addEventListener('input', () => {
                            swatch.style.background = input.value
                            stageEdit(element, attr, input.value || null)
                            markRowDirty(row, element)
                        })
                        swatch.addEventListener('click', () => input.focus())
                        group.appendChild(swatch)
                        group.appendChild(input)
                    } else if (NUMBER_ATTRS.has(attr)) {
                        const input = document.createElement('input')
                        input.type = 'number'
                        input.value = currentVal !== null ? String(currentVal) : ''
                        input.min = '1'
                        input.max = '99'
                        input.addEventListener('input', () => {
                            stageEdit(element, attr, input.value || null)
                            markRowDirty(row, element)
                        })
                        group.appendChild(input)
                    } else if (SELECT_ATTRS[attr]) {
                        const sel = document.createElement('select')
                        const empty = document.createElement('option')
                        empty.value = ''
                        empty.textContent = '—'
                        sel.appendChild(empty)
                        for (const opt of SELECT_ATTRS[attr]) {
                            const o = document.createElement('option')
                            o.value = opt
                            o.textContent = opt
                            if (currentVal === opt) { o.selected = true }
                            sel.appendChild(o)
                        }
                        sel.addEventListener('change', () => {
                            stageEdit(element, attr, sel.value || null)
                            markRowDirty(row, element)
                        })
                        group.appendChild(sel)
                    } else {
                        const input = document.createElement('input')
                        input.type = 'text'
                        input.value = currentVal || ''
                        input.addEventListener('input', () => {
                            stageEdit(element, attr, input.value || null)
                            markRowDirty(row, element)
                        })
                        group.appendChild(input)
                    }

                    const clearBtn = document.createElement('button')
                    clearBtn.className = 'clear-btn'
                    clearBtn.title = 'Clear this override'
                    clearBtn.textContent = '×'
                    clearBtn.addEventListener('click', () => {
                        stageEdit(element, attr, null)
                        markRowDirty(row, element)
                        renderInspect()
                    })
                    group.appendChild(clearBtn)
                    row.appendChild(group)
                }
                container.appendChild(row)
            }
        }
        updateApplyBtn()
    }

    function stageEdit(element, attr, value) {
        if (!state.pendingEdits[element]) { state.pendingEdits[element] = {} }
        state.pendingEdits[element][attr] = value
    }

    function markRowDirty(row, element) {
        const hasPending = Object.keys(state.pendingEdits[element] || {}).length > 0
        row.classList.toggle('dirty', hasPending)
        updateApplyBtn()
    }

    function updateApplyBtn() {
        const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('apply-edits-btn'))
        if (btn) { btn.disabled = Object.keys(state.pendingEdits).length === 0 }
    }

    document.getElementById('apply-edits-btn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyEdits', edits: state.pendingEdits })
    })

    document.getElementById('reset-edits-btn')?.addEventListener('click', () => {
        state.pendingEdits = {}
        renderInspect()
    })

    // ── Apply Theme ───────────────────────────────────────────────────────────

    let importFilePath = null

    document.getElementById('browse-btn')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'pickImportFile' })
    })

    document.getElementById('apply-theme-btn')?.addEventListener('click', () => {
        if (!importFilePath) { return }
        const modeInput = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="apply-mode"]:checked'))
        const mode = modeInput?.value || 'override'
        vscode.postMessage({ type: 'importTheme', filePath: importFilePath, mode })
    })

    // ── Export Theme ──────────────────────────────────────────────────────────

    function renderExport() {
        const placeholder = document.getElementById('export-placeholder')
        const preview = document.getElementById('json-preview')
        const actions = document.getElementById('export-actions')
        if (!placeholder || !preview || !actions) { return }

        if (!state.jsonPreview) {
            placeholder.textContent = 'No active .twb file or no formatting set.'
            placeholder.style.display = ''
            preview.style.display = 'none'
            actions.style.display = 'none'
            return
        }

        placeholder.style.display = 'none'
        preview.textContent = state.jsonPreview
        preview.style.display = 'block'
        actions.style.display = 'flex'
    }

    document.getElementById('save-json-btn')?.addEventListener('click', () => {
        if (state.jsonPreview) { vscode.postMessage({ type: 'saveJson', json: state.jsonPreview }) }
    })

    document.getElementById('copy-json-btn')?.addEventListener('click', () => {
        if (state.jsonPreview) { navigator.clipboard.writeText(state.jsonPreview) }
    })

    // ── Message handler ───────────────────────────────────────────────────────

    function showStatus(tabId, message, tone) {
        const el = document.getElementById(tabId + '-status')
        if (!el) { return }
        el.textContent = message
        el.className = 'status-msg ' + tone
    }

    window.addEventListener('message', event => {
        const msg = event.data
        if (msg.type === 'formattingLoaded') {
            state.elements = msg.elements
            state.pendingEdits = {}
            renderInspect()
        }
        if (msg.type === 'importFilePicked') {
            importFilePath = msg.filePath
            const el = document.getElementById('import-filename')
            if (el) { el.textContent = (msg.filePath || '').split(/[\\/]/).pop() || msg.filePath }
            const modeRow = document.getElementById('apply-mode-row')
            if (modeRow) { modeRow.style.display = 'flex' }
            const btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('apply-theme-btn'))
            if (btn) { btn.disabled = false }
        }
        if (msg.type === 'themeJsonReady') {
            state.jsonPreview = msg.json
            renderExport()
        }
        if (msg.type === 'formattingError') {
            showStatus(msg.tab, msg.message, 'error')
        }
        if (msg.type === 'formattingSuccess') {
            showStatus(msg.tab, msg.message, 'success')
            if (msg.elements) {
                state.elements = msg.elements
                state.pendingEdits = {}
                renderInspect()
            }
        }
    })
})()
