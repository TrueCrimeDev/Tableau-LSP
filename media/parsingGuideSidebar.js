function tS(h) {
  h.classList.toggle('c')
  const b = h.nextElementSibling
  if (b && b.classList.contains('sb')) b.classList.toggle('c')
}
function tSS(h) {
  h.classList.toggle('c')
  const b = h.nextElementSibling
  if (b && b.classList.contains('ssb'))
    b.style.display = b.style.display === 'none' ? '' : 'none'
}
function openSection(id) {
  const h = document.getElementById(id)
  if (h && !h.classList.contains('c')) return
  if (h && h.classList.contains('c')) tS(h)
}

// Attach collapse toggles via addEventListener — CSP blocks inline onclick attributes.
// Guard .sh clicks so action buttons (.ha) inside the header don't also toggle the section.
document.querySelectorAll('.sh').forEach(function (el) {
  el.addEventListener('click', function (event) {
    if (event.target.closest('.ha')) {
      return
    }
    tS(el)
  })
})
document.querySelectorAll('.ssh').forEach(function (el) {
  el.addEventListener('click', function () {
    tSS(el)
  })
})

// Immediately stamp the header so we know this script version loaded.
;(function () {
  var el = document.getElementById('wb-script-stamp')
  if (!el) {
    return
  }
  var stamp = el.getAttribute('data-build-stamp')
  if (stamp) {
    el.textContent = '(' + stamp + ')'
  } else {
    el.textContent = '(js loaded)'
  }
})()

// Global JS error trap — shows errors directly in the sidebar, no DevTools needed.
window.addEventListener('error', function (ev) {
  var el = document.getElementById('workbook-empty-state')
  if (el) {
    el.textContent =
      '[JS ERROR] ' +
      (ev.message || String(ev.error)) +
      ' (' +
      ev.filename +
      ':' +
      ev.lineno +
      ')'
    el.style.display = ''
  }
})
window.addEventListener('unhandledrejection', function (ev) {
  var el = document.getElementById('workbook-empty-state')
  if (el) {
    el.textContent = '[UNHANDLED PROMISE] ' + String(ev.reason)
    el.style.display = ''
  }
})

const vscode = acquireVsCodeApi()

// ── Custom Color Picker ──────────────────────────────────────────────
;(function setupColorPicker() {
  const modal = document.getElementById('color-picker-modal')
  const square = document.getElementById('picker-square')
  const squareGradient = document.getElementById('picker-square-gradient')
  const squareCursor = document.getElementById('picker-square-cursor')
  const hueBar = document.getElementById('picker-hue')
  const hueCursor = document.getElementById('picker-hue-cursor')
  const preview = document.getElementById('picker-preview')
  const rField = document.getElementById('picker-r')
  const gField = document.getElementById('picker-g')
  const bField = document.getElementById('picker-b')
  const hexField = document.getElementById('picker-hex')
  const cancelBtn = document.getElementById('picker-cancel')
  const okBtn = document.getElementById('picker-ok')

  if (!modal || !square || !hueBar) {
    return
  }

  let hue = 0,
    sat = 100,
    val = 50 // H 0-360, S/V 0-100
  let resolveCallback = null
  let squareDragging = false,
    hueDragging = false

  function hsvToRgb(h, s, v) {
    s /= 100
    v /= 100
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c
    let r = 0,
      g = 0,
      b = 0
    if (h < 60) {
      r = c
      g = x
    } else if (h < 120) {
      r = x
      g = c
    } else if (h < 180) {
      g = c
      b = x
    } else if (h < 240) {
      g = x
      b = c
    } else if (h < 300) {
      r = x
      b = c
    } else {
      r = c
      b = x
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
    }
  }

  function rgbToHsv(r, g, b) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min
    let h = 0
    const s = max === 0 ? 0 : d / max,
      v = max
    if (d > 0) {
      if (max === r) {
        h = (((g - b) / d + (g < b ? 6 : 0)) / 6) * 360
      } else if (max === g) {
        h = (((b - r) / d + 2) / 6) * 360
      } else {
        h = (((r - g) / d + 4) / 6) * 360
      }
    }
    return { h, s: s * 100, v: v * 100 }
  }

  function toHex(r, g, b) {
    return (
      '#' +
      [r, g, b]
        .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
        .join('')
    )
  }

  function parseHex(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
    return m
      ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
      : null
  }

  function syncUI() {
    // Update gradient background to match current hue
    const hRgb = hsvToRgb(hue, 100, 100)
    squareGradient.style.background =
      'linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,rgb(' +
      hRgb.r +
      ',' +
      hRgb.g +
      ',' +
      hRgb.b +
      '))'

    // Update square cursor position
    squareCursor.style.left = (sat / 100) * square.offsetWidth + 'px'
    squareCursor.style.top = (1 - val / 100) * square.offsetHeight + 'px'

    // Update hue cursor position
    hueCursor.style.top = (hue / 360) * hueBar.offsetHeight + 'px'

    // Update inputs and preview
    const rgb = hsvToRgb(hue, sat, val)
    const hex = toHex(rgb.r, rgb.g, rgb.b)
    if (rField) {
      rField.value = String(rgb.r)
    }
    if (gField) {
      gField.value = String(rgb.g)
    }
    if (bField) {
      bField.value = String(rgb.b)
    }
    if (hexField) {
      hexField.value = hex
    }
    if (preview) {
      preview.style.backgroundColor = hex
    }
  }

  function setFromSquare(e) {
    const rect = square.getBoundingClientRect()
    sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100
    val =
      (1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))) * 100
    syncUI()
  }

  function setFromHue(e) {
    const rect = hueBar.getBoundingClientRect()
    hue = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)) * 360
    syncUI()
  }

  square.addEventListener('mousedown', (e) => {
    squareDragging = true
    setFromSquare(e)
    e.preventDefault()
  })
  hueBar.addEventListener('mousedown', (e) => {
    hueDragging = true
    setFromHue(e)
    e.preventDefault()
  })
  document.addEventListener('mousemove', (e) => {
    if (squareDragging) {
      setFromSquare(e)
    }
    if (hueDragging) {
      setFromHue(e)
    }
  })
  document.addEventListener('mouseup', () => {
    squareDragging = false
    hueDragging = false
  })

  // Touch support
  function toMouse(e) {
    return e.touches ? e.touches[0] : e
  }
  square.addEventListener(
    'touchstart',
    (e) => {
      squareDragging = true
      setFromSquare(toMouse(e))
      e.preventDefault()
    },
    { passive: false },
  )
  hueBar.addEventListener(
    'touchstart',
    (e) => {
      hueDragging = true
      setFromHue(toMouse(e))
      e.preventDefault()
    },
    { passive: false },
  )
  document.addEventListener(
    'touchmove',
    (e) => {
      if (squareDragging) {
        setFromSquare(toMouse(e))
      }
      if (hueDragging) {
        setFromHue(toMouse(e))
      }
    },
    { passive: false },
  )
  document.addEventListener('touchend', () => {
    squareDragging = false
    hueDragging = false
  })

  function syncFromRgb() {
    const r = Math.max(
      0,
      Math.min(255, parseInt(rField ? rField.value : '0') || 0),
    )
    const g = Math.max(
      0,
      Math.min(255, parseInt(gField ? gField.value : '0') || 0),
    )
    const b = Math.max(
      0,
      Math.min(255, parseInt(bField ? bField.value : '0') || 0),
    )
    const hsv = rgbToHsv(r, g, b)
    hue = hsv.h
    sat = hsv.s
    val = hsv.v
    syncUI()
  }

  ;[rField, gField, bField].forEach((f) => {
    if (f) {
      f.addEventListener('input', syncFromRgb)
      f.addEventListener('change', syncFromRgb)
    }
  })

  if (hexField) {
    hexField.addEventListener('input', () => {
      const parsed = parseHex(hexField.value)
      if (parsed) {
        const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b)
        hue = hsv.h
        sat = hsv.s
        val = hsv.v
        syncUI()
      }
    })
  }

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeWith(null)
    }
  })

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closeWith(null))
  }
  if (okBtn) {
    okBtn.addEventListener('click', () => {
      const rgb = hsvToRgb(hue, sat, val)
      closeWith(toHex(rgb.r, rgb.g, rgb.b))
    })
  }

  function closeWith(result) {
    modal.classList.remove('active')
    if (resolveCallback) {
      resolveCallback(result)
      resolveCallback = null
    }
  }

  window.openColorPicker = function (initialHex) {
    return new Promise((resolve) => {
      resolveCallback = resolve
      const parsed = parseHex(initialHex || '#000000')
      if (parsed) {
        const hsv = rgbToHsv(parsed.r, parsed.g, parsed.b)
        hue = hsv.h
        sat = hsv.s
        val = hsv.v
      }
      modal.classList.add('active')
      // Sync after layout so offsets are correct
      requestAnimationFrame(syncUI)
    })
  }
})()
// ────────────────────────────────────────────────────────────────────

const paletteList = document.getElementById('palette-list')
const paletteNameInput = document.getElementById('palette-name')
const paletteTypeSelect = document.getElementById('palette-type')
const colorsList = document.getElementById('colors-list')
const savePaletteButton = document.getElementById('save-palette')
const newPaletteButton = document.getElementById('new-palette')
const newPaletteAddButton = document.getElementById('new-palette-add')
const archivePaletteButton = document.getElementById('archive-palette')
const deletePaletteButton = document.getElementById('delete-palette')
const applyToWorkbookButton = document.getElementById('apply-to-workbook')
const saveFileButton = document.getElementById('save-file')
const reloadFileButton = document.getElementById('reload-file')
const extractCalcsWrap = document.getElementById('extract-calcs-wrap')
const scaleBaseSwatch = document.getElementById('scale-base-swatch')
const scaleBaseHex = document.getElementById('scale-base-hex')
const scaleSteps = document.getElementById('scale-steps')
const scaleEasing = document.getElementById('scale-easing')
const scaleGenerateButton = document.getElementById('scale-generate')
const scalePreview = document.getElementById('scale-preview')
const scaleApplyButton = document.getElementById('scale-apply')
const blendStartSwatch = document.getElementById('blend-start-swatch')
const blendStartHex = document.getElementById('blend-start-hex')
const blendEndSwatch = document.getElementById('blend-end-swatch')
const blendEndHex = document.getElementById('blend-end-hex')
const blendSteps = document.getElementById('blend-steps')
const blendEasing = document.getElementById('blend-easing')
const blendColorspace = document.getElementById('blend-colorspace')
const blendGenerateButton = document.getElementById('blend-generate')
const blendPreview = document.getElementById('blend-preview')
const blendApplyButton = document.getElementById('blend-apply')
const themeList = document.getElementById('theme-list')
const parseWorkbookBtn = document.getElementById('parse-workbook-btn')
const extractCalcsBtn = document.getElementById('extract-calcs-btn')

const themePresets = [
  {
    name: 'Copper Noir',
    type: 'regular',
    tags: ['moody', 'studio', 'warm'],
    colors: [
      '#F4B860',
      '#E07A5F',
      '#D1495B',
      '#9B4F5B',
      '#6D3B47',
      '#3D405B',
      '#1F2A44',
      '#0F1C2E',
    ],
  },
  {
    name: 'Ocean Studio',
    type: 'regular',
    tags: ['cool', 'modern', 'clean'],
    colors: [
      '#D6F2F0',
      '#A3DAD4',
      '#5CB8B2',
      '#2A9D8F',
      '#1B6F8F',
      '#264653',
      '#0B1F2A',
    ],
  },
  {
    name: 'Dusty Atelier',
    type: 'regular',
    tags: ['neutral', 'vintage', 'paper'],
    colors: [
      '#F4ECE1',
      '#E7D2C0',
      '#D4B49E',
      '#BA907B',
      '#9B6B5A',
      '#6E4D44',
      '#3F2E2E',
    ],
  },
  {
    name: 'Botanical Lab',
    type: 'regular',
    tags: ['botanical', 'fresh', 'soft'],
    colors: [
      '#E9F5DB',
      '#CFE1B9',
      '#B5C99A',
      '#97A97C',
      '#87986A',
      '#718355',
      '#546A3A',
    ],
  },
  {
    name: 'Signal Drift',
    type: 'regular',
    tags: ['contrast', 'signal', 'night'],
    colors: [
      '#F6BD60',
      '#F28482',
      '#84A59D',
      '#4D6F6F',
      '#2F4858',
      '#1B263B',
      '#0D1B2A',
    ],
  },
  {
    name: 'Slate Archive',
    type: 'regular',
    tags: ['slate', 'archive', 'mono'],
    colors: [
      '#E8EDF2',
      '#C6D0DA',
      '#A1AFC1',
      '#7C8DA3',
      '#607089',
      '#445468',
      '#2F3843',
    ],
  },
  {
    name: 'Midnight Citrus',
    type: 'regular',
    tags: ['citrus', 'night', 'bold'],
    colors: [
      '#F4D35E',
      '#EE964B',
      '#F95738',
      '#EE6C4D',
      '#3D5A80',
      '#1B263B',
      '#0D1B2A',
    ],
  },
  {
    name: 'Quiet Bloom',
    type: 'regular',
    tags: ['bloom', 'soft', 'rose'],
    colors: [
      '#F8EDEB',
      '#F4D6CC',
      '#F1B5A7',
      '#D87C7C',
      '#A44354',
      '#7E3147',
      '#4E1D3A',
    ],
  },
]

const state = {
  palettes: [],
  selectedName: '',
  scaleColors: [],
  blendColors: [],
  editor: {
    name: '',
    type: 'regular',
    colors: [],
  },
  workbookData: null,
  calcBankCalcs: [],
  calcPortfolioGroups: [],
  commonCalculations: [],
}

const requiredElements = [
  paletteList,
  paletteNameInput,
  paletteTypeSelect,
  colorsList,
  scaleBaseSwatch,
  scaleBaseHex,
  scaleSteps,
  scaleEasing,
  scaleGenerateButton,
  scalePreview,
  scaleApplyButton,
  blendStartSwatch,
  blendStartHex,
  blendEndSwatch,
  blendEndHex,
  blendSteps,
  blendEasing,
  blendColorspace,
  blendGenerateButton,
  blendPreview,
  blendApplyButton,
  themeList,
]

if (requiredElements.some((element) => !element)) {
  setStatus('Palette editor failed to load.', 'error')
} else {
  const normalizedScaleBase = normalizeHex(scaleBaseHex.value)
  if (normalizedScaleBase) {
    scaleBaseHex.value = normalizedScaleBase
    scaleBaseSwatch.style.backgroundColor = normalizedScaleBase
    scaleBaseHex.classList.remove('invalid')
  }

  const blendStartInitial = normalizeHex(blendStartHex.value) || '#F4B860'
  blendStartSwatch.style.backgroundColor = blendStartInitial
  const blendEndInitial = normalizeHex(blendEndHex.value) || '#3D5A80'
  blendEndSwatch.style.backgroundColor = blendEndInitial

  state.scaleColors = generateScaleColors(
    scaleBaseHex.value,
    normalizeSteps(scaleSteps.value, 9),
  )
  state.blendColors = generateBlendColors(
    blendStartInitial,
    blendEndInitial,
    normalizeSteps(blendSteps.value, 7),
  )

  paletteList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }

    // Check if a card action button was clicked
    const actionButton = target.closest('[data-action]')
    if (actionButton instanceof HTMLElement) {
      event.stopPropagation()
      const idx = Number(actionButton.dataset.index)
      const palette = state.palettes[idx]
      if (!palette) {
        return
      }
      const action = actionButton.dataset.action
      if (action === 'apply') {
        const colors = normalizeColorList(palette.colors).filter(Boolean)
        vscode.postMessage({
          type: 'applyToWorkbook',
          palette: { name: palette.name, type: palette.type, colors },
        })
        setStatus(
          'Applying \u201c' +
            escapeHtml(palette.name) +
            '\u201d to workbook\u2026',
          'info',
        )
      } else if (action === 'edit') {
        state.selectedName = palette.name
        state.editor = {
          name: palette.name,
          type: palette.type,
          colors: palette.colors.slice(),
        }
        openSection('builder-section-sh')
        renderAll()
      } else if (action === 'archive') {
        vscode.postMessage({
          type: 'archivePalette',
          paletteName: palette.name,
        })
      }
      return
    }

    // Fall through: clicking the card body selects the palette
    const item = target.closest('.ri')
    if (!item) {
      return
    }
    const index = Number(item.dataset.index)
    const palette = state.palettes[index]
    if (!palette) {
      return
    }
    state.selectedName = palette.name
    state.editor = {
      name: palette.name,
      type: palette.type,
      colors: palette.colors.slice(),
    }
    renderAll()
  })

  paletteList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const item = target.closest('.ri')
    if (!item) {
      return
    }
    event.preventDefault()
    const index = Number(item.dataset.index)
    const palette = state.palettes[index]
    if (!palette) {
      return
    }
    state.selectedName = palette.name
    state.editor = {
      name: palette.name,
      type: palette.type,
      colors: palette.colors.slice(),
    }
    renderAll()
  })

  paletteNameInput.addEventListener('input', () => {
    state.editor.name = paletteNameInput.value
  })

  paletteTypeSelect.addEventListener('change', () => {
    state.editor.type = paletteTypeSelect.value
  })

  colorsList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const chip = target.closest('.cp')
    if (!chip || !(chip instanceof HTMLElement)) {
      return
    }
    if (chip.classList.contains('add')) {
      window.openColorPicker('#F4B860').then((picked) => {
        if (!picked) {
          return
        }
        state.editor.colors.push(picked)
        renderColors()
      })
      return
    }
    const index = Number(chip.dataset.index)
    if (Number.isNaN(index)) {
      return
    }
    const current = state.editor.colors[index] || '#000000'
    window.openColorPicker(current).then((picked) => {
      if (!picked) {
        return
      }
      state.editor.colors[index] = picked
      renderColors()
    })
  })

  if (savePaletteButton) {
    savePaletteButton.addEventListener('click', () => {
      const name = paletteNameInput.value.trim()
      if (!name) {
        setStatus('Palette name is required.', 'error')
        return
      }
      const normalizedColors = state.editor.colors.map((color) =>
        normalizeHex(color),
      )
      if (normalizedColors.some((color) => !color)) {
        setStatus('Fix invalid colors before saving.', 'error')
        return
      }
      const colors = normalizedColors.filter(Boolean)
      if (colors.length === 0) {
        setStatus('Add at least one color before saving.', 'error')
        return
      }
      const palette = {
        name,
        type: normalizePaletteType(paletteTypeSelect.value),
        colors,
      }
      upsertPalette(palette)
      state.selectedName = palette.name
      state.editor = {
        name: palette.name,
        type: palette.type,
        colors: palette.colors.slice(),
      }
      renderAll()
      setStatus('Palette saved to the sidebar list.', 'success')
    })
  }

  if (newPaletteButton) {
    newPaletteButton.addEventListener('click', () => {
      state.selectedName = ''
      state.editor = {
        name: '',
        type: 'regular',
        colors: [],
      }
      paletteNameInput.value = ''
      paletteTypeSelect.value = 'regular'
      renderAll()
      setStatus('New palette ready.', 'info')
    })
  }

  if (newPaletteAddButton) {
    newPaletteAddButton.addEventListener('click', () => {
      state.selectedName = ''
      state.editor = { name: '', type: 'regular', colors: [] }
      if (paletteNameInput) {
        paletteNameInput.value = ''
      }
      if (paletteTypeSelect) {
        paletteTypeSelect.value = 'regular'
      }
      openSection('builder-section-sh')
      renderAll()
      setStatus('New palette ready.', 'info')
    })
  }

  const importPaletteBtnEl = document.getElementById('import-palette-btn')
  if (importPaletteBtnEl) {
    importPaletteBtnEl.addEventListener('click', () => {
      vscode.postMessage({ type: 'importPaletteFromFile' })
    })
  }

  if (deletePaletteButton) {
    deletePaletteButton.addEventListener('click', () => {
      if (!state.selectedName) {
        setStatus('Select a palette to delete.', 'error')
        return
      }
      vscode.postMessage({
        type: 'deletePalette',
        paletteName: state.selectedName,
      })
    })
  }

  if (archivePaletteButton) {
    archivePaletteButton.addEventListener('click', () => {
      if (!state.selectedName) {
        setStatus('Select a palette to archive.', 'error')
        return
      }
      vscode.postMessage({
        type: 'archivePalette',
        paletteName: state.selectedName,
      })
    })
  }

  if (applyToWorkbookButton) {
    applyToWorkbookButton.addEventListener('click', () => {
      const name = paletteNameInput.value.trim()
      if (!name) {
        setStatus('Palette name is required before applying.', 'error')
        return
      }
      const normalizedColors = state.editor.colors.map((color) =>
        normalizeHex(color),
      )
      if (normalizedColors.some((color) => !color)) {
        setStatus('Fix invalid colors before applying.', 'error')
        return
      }
      const colors = normalizedColors.filter(Boolean)
      if (colors.length === 0) {
        setStatus('Add at least one color before applying.', 'error')
        return
      }

      vscode.postMessage({
        type: 'applyToWorkbook',
        palette: {
          name,
          type: normalizePaletteType(paletteTypeSelect.value),
          colors,
        },
      })
    })
  }

  if (saveFileButton) {
    saveFileButton.addEventListener('click', () => {
      vscode.postMessage({
        type: 'savePalettes',
        palettes: state.palettes,
      })
    })
  }

  if (reloadFileButton) {
    reloadFileButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestPalettes' })
    })
  }

  const openInTableauBtn = document.getElementById('open-in-tableau-btn')
  if (openInTableauBtn) {
    openInTableauBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'openInTableau' })
    })
  }

  const extractCalcsHeaderBtn = document.getElementById(
    'extract-calcs-header-btn',
  )
  if (extractCalcsHeaderBtn) {
    extractCalcsHeaderBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'extractCalculations' })
    })
  }

  const stripFormattingBtn = document.getElementById('strip-formatting-btn')
  if (stripFormattingBtn) {
    stripFormattingBtn.addEventListener('click', () => {
      const options = {
        borders: /** @type {HTMLInputElement|null} */ (document.getElementById('strip-borders'))?.checked ?? false,
        bold: /** @type {HTMLInputElement|null} */ (document.getElementById('strip-bold'))?.checked ?? false,
        fontSize: /** @type {HTMLInputElement|null} */ (document.getElementById('strip-font-size'))?.checked ?? false,
        fontColor: /** @type {HTMLInputElement|null} */ (document.getElementById('strip-font-color'))?.checked ?? false,
      }
      if (!options.borders && !options.bold && !options.fontSize && !options.fontColor) {
        setFormatStripStatus('Select at least one option.', 'error')
        return
      }
      vscode.postMessage({
        type: 'stripFormatting',
        options,
        relaunch: /** @type {HTMLInputElement|null} */ (document.getElementById('fmt-relaunch-after-write'))?.checked ?? false,
      })
    })
  }

  const addWorkbookCalculationBtn = document.getElementById('wb-add-calc-btn')
  if (addWorkbookCalculationBtn) {
    addWorkbookCalculationBtn.addEventListener('click', () => {
      const datasource = /** @type {HTMLSelectElement|null} */ (document.getElementById('wb-calc-datasource'))?.value.trim() || ''
      const caption = /** @type {HTMLInputElement|null} */ (document.getElementById('wb-calc-name'))?.value.trim() || ''
      const formula = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('wb-calc-formula'))?.value.trim() || ''
      const datatype = /** @type {HTMLSelectElement|null} */ (document.getElementById('wb-calc-datatype'))?.value || 'string'
      if (!datasource || !caption || !formula) {
        setCalculationMutationStatus('Choose a datasource and enter both a name and formula.', 'error')
        return
      }
      setCalculationMutationStatus('Validating and writing the workbook…', 'info')
      vscode.postMessage({
        type: 'addWorkbookCalculation',
        calculation: {
          datasource,
          caption,
          formula,
          datatype,
          replaceExisting: /** @type {HTMLInputElement|null} */ (document.getElementById('wb-calc-replace'))?.checked ?? false,
        },
        relaunch: /** @type {HTMLInputElement|null} */ (document.getElementById('wb-calc-relaunch'))?.checked ?? false,
      })
    })
  }

  const commonCalculationSelect = document.getElementById('wb-common-calc-select')
  if (commonCalculationSelect) {
    commonCalculationSelect.addEventListener('change', updateCommonCalculationActions)
  }
  const useCommonCalculationBtn = document.getElementById('wb-common-calc-use')
  if (useCommonCalculationBtn) {
    useCommonCalculationBtn.addEventListener('click', () => {
      const calculation = selectedCommonCalculation()
      if (!calculation) {
        setCommonCalculationStatus('Choose a saved calculation first.', 'error')
        return
      }
      const name = document.getElementById('wb-calc-name')
      const formula = document.getElementById('wb-calc-formula')
      const datatype = document.getElementById('wb-calc-datatype')
      if (name instanceof HTMLInputElement) { name.value = calculation.name }
      if (formula instanceof HTMLTextAreaElement) { formula.value = calculation.formula }
      if (datatype instanceof HTMLSelectElement) { datatype.value = calculation.datatype }
      setCommonCalculationStatus('Loaded into Calculation details.', 'success')
    })
  }
  const saveCommonCalculationBtn = document.getElementById('wb-common-calc-save')
  if (saveCommonCalculationBtn) {
    saveCommonCalculationBtn.addEventListener('click', () => {
      const name = /** @type {HTMLInputElement|null} */ (document.getElementById('wb-calc-name'))?.value.trim() || ''
      const formula = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('wb-calc-formula'))?.value.trim() || ''
      const datatype = /** @type {HTMLSelectElement|null} */ (document.getElementById('wb-calc-datatype'))?.value || 'string'
      if (!name || !formula) {
        setCommonCalculationStatus('Enter a field name and formula in Calculation details first.', 'error')
        return
      }
      setCommonCalculationStatus('Saving common calculation…', 'info')
      vscode.postMessage({
        type: 'saveCommonCalculation',
        commonCalculation: { name, formula, datatype },
      })
    })
  }
  const deleteCommonCalculationBtn = document.getElementById('wb-common-calc-delete')
  if (deleteCommonCalculationBtn) {
    deleteCommonCalculationBtn.addEventListener('click', () => {
      const calculation = selectedCommonCalculation()
      if (!calculation) {
        setCommonCalculationStatus('Choose a saved calculation first.', 'error')
        return
      }
      vscode.postMessage({
        type: 'deleteCommonCalculation',
        commonCalculationName: calculation.name,
      })
    })
  }
  const refreshCommonCalculationBtn = document.getElementById('wb-common-calc-refresh')
  if (refreshCommonCalculationBtn) {
    refreshCommonCalculationBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestCommonCalculations' })
    })
  }

  scaleBaseSwatch.addEventListener('click', async () => {
    const current = normalizeHex(scaleBaseHex.value) || '#5CB8B2'
    const picked = await window.openColorPicker(current)
    if (picked) {
      scaleBaseSwatch.style.backgroundColor = picked
      scaleBaseHex.value = picked
      scaleBaseHex.classList.remove('invalid')
    }
  })

  scaleBaseHex.addEventListener('input', () => {
    const normalized = normalizeHex(scaleBaseHex.value)
    if (normalized) {
      scaleBaseHex.classList.remove('invalid')
      scaleBaseHex.value = normalized
      scaleBaseSwatch.style.backgroundColor = normalized
    } else {
      scaleBaseHex.classList.add('invalid')
    }
  })

  blendStartHex.addEventListener('input', () => {
    const normalized = normalizeHex(blendStartHex.value)
    if (normalized) {
      blendStartHex.classList.remove('invalid')
      blendStartHex.value = normalized
      blendStartSwatch.style.backgroundColor = normalized
    } else {
      blendStartHex.classList.add('invalid')
    }
  })

  blendStartSwatch.addEventListener('click', async () => {
    const current = normalizeHex(blendStartHex.value) || '#F4B860'
    const picked = await window.openColorPicker(current)
    if (picked) {
      blendStartSwatch.style.backgroundColor = picked
      blendStartHex.value = picked
      blendStartHex.classList.remove('invalid')
    }
  })

  blendEndHex.addEventListener('input', () => {
    const normalized = normalizeHex(blendEndHex.value)
    if (normalized) {
      blendEndHex.classList.remove('invalid')
      blendEndHex.value = normalized
      blendEndSwatch.style.backgroundColor = normalized
    } else {
      blendEndHex.classList.add('invalid')
    }
  })

  blendEndSwatch.addEventListener('click', async () => {
    const current = normalizeHex(blendEndHex.value) || '#3D5A80'
    const picked = await window.openColorPicker(current)
    if (picked) {
      blendEndSwatch.style.backgroundColor = picked
      blendEndHex.value = picked
      blendEndHex.classList.remove('invalid')
    }
  })

  scaleGenerateButton.addEventListener('click', () => {
    const base = normalizeHex(scaleBaseHex.value)
    if (!base) {
      scaleBaseHex.classList.add('invalid')
      setStatus('Enter a valid hex color for the scale base.', 'error')
      return
    }
    const steps = normalizeSteps(scaleSteps.value, 9)
    const easing = scaleEasing.value || 'easeOut'
    scaleSteps.value = String(steps)
    scaleBaseHex.value = base
    scaleBaseSwatch.style.backgroundColor = base

    const colors = generateScaleColors(base, steps, easing)
    if (colors.length === 0) {
      setStatus('Unable to generate scale colors.', 'error')
      return
    }
    state.scaleColors = colors
    renderScalePreview()
    setStatus('Scale ready. Use Apply to Editor to load it.', 'info')
  })

  scaleApplyButton.addEventListener('click', () => {
    if (state.scaleColors.length === 0) {
      setStatus('Generate a scale before applying.', 'error')
      return
    }
    applyGeneratedPalette(state.scaleColors)
    setStatus('Scale applied to the editor.', 'success')
  })

  blendGenerateButton.addEventListener('click', () => {
    const start = normalizeHex(blendStartHex.value)
    const end = normalizeHex(blendEndHex.value)
    if (!start || !end) {
      setStatus('Select valid blend colors.', 'error')
      return
    }
    const steps = normalizeSteps(blendSteps.value, 7)
    const easing = blendEasing.value || 'linear'
    const colorspace = blendColorspace.value || 'lab'
    blendSteps.value = String(steps)
    blendStartHex.value = start
    blendStartSwatch.style.backgroundColor = start
    blendEndHex.value = end
    blendEndSwatch.style.backgroundColor = end

    const colors = generateBlendColors(start, end, steps, easing, colorspace)
    if (colors.length === 0) {
      setStatus('Unable to blend colors.', 'error')
      return
    }
    state.blendColors = colors
    renderBlendPreview()
    setStatus('Gradient ready. Use Apply to Editor to load it.', 'info')
  })

  blendApplyButton.addEventListener('click', () => {
    if (state.blendColors.length === 0) {
      setStatus('Generate a blend before applying.', 'error')
      return
    }
    applyGeneratedPalette(state.blendColors)
    setStatus('Blend applied to the editor.', 'success')
  })

  themeList.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) {
      return
    }
    const button = target.closest('[data-action]')
    if (!button || !(button instanceof HTMLElement)) {
      return
    }
    const index = Number(button.dataset.index)
    if (Number.isNaN(index)) {
      return
    }
    const theme = themePresets[index]
    if (!theme) {
      setStatus('No theme available.', 'error')
      return
    }
    const colors = normalizeColorList(theme.colors)
    if (colors.length === 0) {
      setStatus('Theme has no colors.', 'error')
      return
    }
    const action = button.dataset.action
    if (action === 'load-theme') {
      const palette = {
        name: ensureUniqueName(theme.name),
        type: normalizePaletteType(theme.type),
        colors,
      }
      upsertPalette(palette)
      state.selectedName = palette.name
      state.editor = {
        name: palette.name,
        type: palette.type,
        colors: palette.colors.slice(),
      }
      renderAll()
      openSection('builder-section-sh')
      setStatus('Theme "' + theme.name + '" loaded to editor.', 'success')
    } else if (action === 'apply-theme') {
      vscode.postMessage({
        type: 'applyToWorkbook',
        palette: {
          name: theme.name,
          type: normalizePaletteType(theme.type),
          colors,
        },
      })
      setStatus('Applying "' + theme.name + '" to workbook\u2026', 'info')
    }
  })

  if (parseWorkbookBtn) {
    parseWorkbookBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'parseWorkbook' })
    })
  }

  if (extractCalcsBtn) {
    extractCalcsBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'extractCalculations' })
    })
  }

  // Workbook section action delegation (import palette, copy/insert formula)
  const workbookSbEl = document.getElementById('workbook-sb')
  if (workbookSbEl) {
    workbookSbEl.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const button = target.closest('[data-action]')
      if (!button || !(button instanceof HTMLElement)) {
        return
      }
      const action = button.dataset.action

      if (action === 'toggle-more') {
        const wrap = button.previousElementSibling
        if (wrap && wrap.classList.contains('wb-more-hidden')) {
          wrap.hidden = !wrap.hidden
          const lbl = button.querySelector('.tree-more-label')
          if (lbl) {
            lbl.textContent = wrap.hidden
              ? 'Show ' + button.dataset.remaining + ' more'
              : 'Show less'
          }
          button.classList.toggle('expanded', !wrap.hidden)
        }
        return
      }

      const idx = Number(button.dataset.index)
      const data = state.workbookData
      if (!data) {
        return
      }

      if (action === 'import-workbook') {
        if (!data.palettes) {
          return
        }
        const palette = data.palettes[idx]
        if (!palette) {
          return
        }
        const colors = normalizeColorList(palette.colors).filter(Boolean)
        vscode.postMessage({
          type: 'importWorkbookPalette',
          palette: { name: palette.name, type: palette.type, colors },
        })
        setStatus(
          'Importing \u201c' + escapeHtml(palette.name) + '\u201d\u2026',
          'info',
        )
      } else if (action === 'toggle-ds-fields') {
        const panel = document.getElementById('ds-fields-' + idx)
        if (panel) {
          panel.hidden = !panel.hidden
          button.classList.toggle('ds-open', !panel.hidden)
        }
      } else if (action === 'copy-ds-fields') {
        const ds = data.datasources && data.datasources[idx]
        if (!ds || !ds.fields || !ds.fields.length) {
          setStatus('No plain fields to copy.', 'info')
          return
        }
        const text = ds.fields.map((f) => '[' + f.name + ']').join('\n')
        vscode.postMessage({ type: 'copyFormula', formula: text })
        setStatus(
          'Copied ' + ds.fields.length + ' field names from \u201c' +
            escapeHtml(ds.caption || 'Unknown') +
            '\u201d',
          'success',
        )
      } else if (action === 'copy-field') {
        const ds =
          data.datasources && data.datasources[Number(button.dataset.ds)]
        const f = ds && ds.fields && ds.fields[Number(button.dataset.field)]
        if (!f) {
          return
        }
        vscode.postMessage({ type: 'copyFormula', formula: '[' + f.name + ']' })
        setStatus('Copied [' + escapeHtml(f.name) + ']', 'success')
      } else if (action === 'generate-field-defs') {
        if (!data.datasources) {
          return
        }
        const ds = data.datasources[idx]
        if (!ds) {
          return
        }
        vscode.postMessage({
          type: 'generateFieldDefs',
          datasource: ds.caption || 'Unknown',
        })
        setStatus(
          'Generating field definitions for “' +
            escapeHtml(ds.caption || 'Unknown') +
            '”…',
          'info',
        )
      } else if (action === 'copy-calc') {
        // Inner buttons (copy-formula, insert-formula) carry their own data-action, so
        // closest('[data-action]') resolves to the button first — this branch is only
        // reached when clicking the row itself (label, icon, or whitespace).
        if (!data.calculations) {
          return
        }
        const calc = data.calculations[idx]
        if (!calc) {
          return
        }
        const rawCaption = calc.caption || 'Unnamed'
        const header = '// ' + rawCaption
        vscode.postMessage({
          type: 'copyFormula',
          formula: header + '\n' + (calc.formula || ''),
        })
        setStatus('Copied \u201c' + rawCaption + '\u201d', 'success')
      } else if (action === 'copy-formula') {
        if (!data.calculations) {
          return
        }
        const calc = data.calculations[idx]
        if (!calc) {
          return
        }
        vscode.postMessage({ type: 'copyFormula', formula: calc.formula || '' })
        setStatus('Copied formula “' + (calc.caption || 'Unnamed') + '”', 'success')
      } else if (action === 'insert-formula') {
        if (!data.calculations) {
          return
        }
        const calc = data.calculations[idx]
        if (!calc) {
          return
        }
        vscode.postMessage({
          type: 'insertFormula',
          formula: calc.formula || '',
        })
        setStatus('Inserted formula “' + (calc.caption || 'Unnamed') + '”', 'success')
      }
    })
  }

  renderAll()
  vscode.postMessage({ type: 'requestPalettes' })
}

// Message handler and workbook/context init are intentionally OUTSIDE the
// palette-editor guard so they always run even if a builder element is null.
// ── Workbook Formatting (inline sidebar) ────────────────────────────────────

;(function () {
  const FMT_GROUPS = {
    'Fonts': ['all', 'worksheet', 'worksheet-title', 'tooltip', 'dashboard-title', 'story-title', 'header', 'legend', 'legend-title', 'filter', 'filter-title', 'parameter-ctrl', 'parameter-ctrl-title', 'highlighter', 'highlighter-title', 'page-ctrl-title'],
    'Lines': ['gridline', 'zeroline'],
    'Borders': ['row-divider', 'column-divider', 'table-border'],
    'Shading': ['pane', 'inner-row-banding', 'outer-row-banding', 'inner-column-banding', 'outer-column-banding'],
    'Mark & View': ['mark', 'view'],
  }
  const FMT_ATTRS = {
    'all':                  ['font-color', 'font-family'],
    'worksheet':            ['font-color', 'font-family', 'font-size'],
    'worksheet-title':      ['font-color', 'font-family', 'font-size'],
    'tooltip':              ['font-color', 'font-family', 'font-size'],
    'dashboard-title':      ['font-color', 'font-family', 'font-size', 'font-weight'],
    'story-title':          ['font-color', 'font-family', 'font-size'],
    'header':               ['font-color', 'font-family', 'background-color'],
    'legend':               ['font-color', 'font-family', 'font-size', 'background-color'],
    'legend-title':         ['font-color', 'font-family', 'font-size'],
    'filter':               ['font-color', 'font-family', 'font-size', 'background-color'],
    'filter-title':         ['font-color', 'font-family', 'font-size'],
    'parameter-ctrl':       ['font-color', 'font-family', 'font-size', 'background-color'],
    'parameter-ctrl-title': ['font-color', 'font-family', 'font-size'],
    'highlighter':          ['font-color', 'font-family', 'font-size', 'background-color'],
    'highlighter-title':    ['font-color', 'font-family', 'font-size'],
    'page-ctrl-title':      ['font-color', 'font-family', 'font-size'],
    'gridline':             ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'zeroline':             ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'row-divider':          ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'column-divider':       ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'table-border':         ['line-visibility', 'line-pattern', 'line-width', 'line-color'],
    'pane':                 ['background-color'],
    'inner-row-banding':    ['background-color'],
    'outer-row-banding':    ['background-color'],
    'inner-column-banding': ['background-color'],
    'outer-column-banding': ['background-color'],
    'mark':                 ['mark-color'],
    'view':                 ['background-color'],
  }
  const FMT_COLOR_ATTRS = new Set(['font-color', 'background-color', 'line-color', 'mark-color'])
  const FMT_NUMBER_ATTRS = new Set(['font-size', 'line-width'])
  const FMT_SELECT_ATTRS = {
    'font-weight':     ['normal', 'bold'],
    'line-visibility': ['on', 'off'],
    'line-pattern':    ['solid', 'dashed', 'dotted'],
  }
  // Same threshold as the other sidebar lists (see joinWithShowMore below) so
  // the Fonts group (16 elements) doesn't flood the formatting area.
  var FMT_GROUP_LIMIT = 6

  let fmtState = { elements: {}, pendingEdits: {}, jsonPreview: null, importFilePath: null }

  // Delegated "Show N more" toggle for formatting groups (Fonts group has 16
  // elements) -- mirrors the workbook-sb toggle-more handler above.
  var fmtInspectGroupsEl = document.getElementById('fmt-inspect-groups')
  if (fmtInspectGroupsEl) {
    fmtInspectGroupsEl.addEventListener('click', function (event) {
      var target = event.target
      if (!(target instanceof Element)) { return }
      var button = target.closest('[data-action="toggle-more"]')
      if (!button) { return }
      var wrap = button.previousElementSibling
      if (wrap && wrap.classList.contains('wb-more-hidden')) {
        wrap.hidden = !wrap.hidden
        var lbl = button.querySelector('.tree-more-label')
        if (lbl) {
          lbl.textContent = wrap.hidden ? 'Show ' + button.dataset.remaining + ' more' : 'Show less'
        }
        button.classList.toggle('expanded', !wrap.hidden)
      }
    })
  }

  // Trigger export data fetch when Export Theme subsection is expanded
  var fmtExportSsh = document.getElementById('fmt-export-ssh')
  if (fmtExportSsh) {
    fmtExportSsh.addEventListener('click', function () {
      requestAnimationFrame(function () {
        var body = fmtExportSsh.nextElementSibling
        if (body && body.style.display !== 'none') {
          vscode.postMessage({ type: 'requestFormattingExport' })
        }
      })
    })
  }

  var FMT_ATTR_LABELS = {
    'font-color': 'Color', 'font-family': 'Family', 'font-size': 'Size',
    'font-weight': 'Weight', 'background-color': 'Background',
    'line-visibility': 'Visibility', 'line-pattern': 'Pattern',
    'line-width': 'Width', 'line-color': 'Color', 'mark-color': 'Color',
  }
  function fmtElemLabel(elem) {
    return elem.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase() })
  }

  function fmtRender() {
    var container = document.getElementById('fmt-inspect-groups')
    if (!container) { return }
    container.innerHTML = ''
    for (var groupName in FMT_GROUPS) {
      var elements = FMT_GROUPS[groupName]
      var hdr = document.createElement('div')
      hdr.className = 'fmt-group-hdr'
      hdr.textContent = groupName
      container.appendChild(hdr)

      var rows = elements.map(fmtBuildElementRow)
      if (rows.length <= FMT_GROUP_LIMIT) {
        rows.forEach(function (r) { container.appendChild(r) })
      } else {
        rows.slice(0, FMT_GROUP_LIMIT).forEach(function (r) { container.appendChild(r) })

        var hiddenWrap = document.createElement('div')
        hiddenWrap.className = 'wb-more-hidden'
        hiddenWrap.hidden = true
        rows.slice(FMT_GROUP_LIMIT).forEach(function (r) { hiddenWrap.appendChild(r) })
        container.appendChild(hiddenWrap)

        var remaining = rows.length - FMT_GROUP_LIMIT
        var moreBtn = document.createElement('div')
        moreBtn.className = 'tree-more'
        moreBtn.dataset.action = 'toggle-more'
        moreBtn.dataset.remaining = String(remaining)
        moreBtn.setAttribute('role', 'button')
        moreBtn.tabIndex = 0
        moreBtn.innerHTML =
          '<span class="tree-more-chev"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>' +
          '<span class="tree-more-label">Show ' + remaining + ' more</span>'
        container.appendChild(moreBtn)
      }
    }
    fmtUpdateApplyBtn()
  }

  function fmtBuildElementRow(element) {
    var attrs = FMT_ATTRS[element] || []
    var row = document.createElement('div')
    row.className = 'fmt-elem-row'
    row.dataset.element = element
    var hdrEl = document.createElement('div')
    hdrEl.className = 'fmt-elem-hdr'
    var nameEl = document.createElement('div')
    nameEl.className = 'fmt-elem-name'
    nameEl.textContent = fmtElemLabel(element)
    hdrEl.appendChild(nameEl)
    row.appendChild(hdrEl)

    attrs.forEach(function (attr) {
      var currentVal = (fmtState.pendingEdits[element] !== undefined && fmtState.pendingEdits[element][attr] !== undefined)
        ? fmtState.pendingEdits[element][attr]
        : (fmtState.elements[element] && fmtState.elements[element][attr] != null ? fmtState.elements[element][attr] : null)

      var propRow = document.createElement('div')
      propRow.className = 'fmt-prop-row'

      var lbl = document.createElement('span')
      lbl.className = 'fmt-prop-lbl'
      lbl.textContent = FMT_ATTR_LABELS[attr] || attr
      lbl.title = attr
      propRow.appendChild(lbl)

      var ctrl = document.createElement('div')
      ctrl.className = 'fmt-prop-ctrl'

      if (FMT_COLOR_ATTRS.has(attr)) {
        var sw = document.createElement('div')
        sw.className = 'fmt-swatch' + (currentVal ? ' has-val' : '')
        if (currentVal) { sw.style.setProperty('--fmt-color', currentVal) }
        var inp = document.createElement('input')
        inp.type = 'text'
        inp.value = currentVal || ''
        inp.placeholder = '#RRGGBB'
        ;(function (elem, a, swEl, inpEl, rowEl) {
          inpEl.addEventListener('input', function () {
            var v = inpEl.value.trim()
            if (v) {
              swEl.classList.add('has-val')
              swEl.style.setProperty('--fmt-color', v)
            } else {
              swEl.classList.remove('has-val')
              swEl.style.removeProperty('--fmt-color')
            }
            fmtStage(elem, a, v || null)
            fmtDirty(rowEl, elem)
          })
          swEl.addEventListener('click', function () {
            var current = inpEl.value || '#888888'
            if (typeof window.openColorPicker === 'function') {
              window.openColorPicker(current).then(function (picked) {
                if (picked) {
                  swEl.classList.add('has-val')
                  swEl.style.setProperty('--fmt-color', picked)
                  inpEl.value = picked
                  fmtStage(elem, a, picked)
                  fmtDirty(rowEl, elem)
                }
              })
            } else {
              inpEl.focus()
            }
          })
        })(element, attr, sw, inp, row)
        ctrl.appendChild(sw)
        ctrl.appendChild(inp)
      } else if (FMT_NUMBER_ATTRS.has(attr)) {
        var ninp = document.createElement('input')
        ninp.type = 'number'
        ninp.value = currentVal !== null ? String(currentVal) : ''
        ninp.placeholder = '—'
        ninp.min = '1'; ninp.max = '99'
        ;(function (elem, a, el2, rowEl) {
          el2.addEventListener('input', function () {
            fmtStage(elem, a, el2.value || null)
            fmtDirty(rowEl, elem)
          })
        })(element, attr, ninp, row)
        ctrl.appendChild(ninp)
      } else if (FMT_SELECT_ATTRS[attr]) {
        var sel = document.createElement('select')
        var emptyOpt = document.createElement('option')
        emptyOpt.value = ''; emptyOpt.textContent = '—'
        sel.appendChild(emptyOpt)
        FMT_SELECT_ATTRS[attr].forEach(function (opt) {
          var o = document.createElement('option')
          o.value = opt; o.textContent = opt.charAt(0).toUpperCase() + opt.slice(1)
          if (currentVal === opt) { o.selected = true }
          sel.appendChild(o)
        })
        ;(function (elem, a, selEl, rowEl) {
          selEl.addEventListener('change', function () {
            fmtStage(elem, a, selEl.value || null)
            fmtDirty(rowEl, elem)
          })
        })(element, attr, sel, row)
        ctrl.appendChild(sel)
      } else {
        var tinp = document.createElement('input')
        tinp.type = 'text'
        tinp.value = currentVal || ''
        tinp.placeholder = '—'
        ;(function (elem, a, el3, rowEl) {
          el3.addEventListener('input', function () {
            fmtStage(elem, a, el3.value || null)
            fmtDirty(rowEl, elem)
          })
        })(element, attr, tinp, row)
        ctrl.appendChild(tinp)
      }

      var clrBtn = document.createElement('button')
      clrBtn.className = 'fmt-clear' + (currentVal ? ' has-val' : '')
      clrBtn.title = 'Clear'
      clrBtn.textContent = '\u00d7'
      ;(function (elem, a, rowEl) {
        clrBtn.addEventListener('click', function () {
          fmtStage(elem, a, null)
          fmtDirty(rowEl, elem)
          fmtRender()
        })
      })(element, attr, row)
      ctrl.appendChild(clrBtn)

      propRow.appendChild(ctrl)
      row.appendChild(propRow)
    })
    var hasData = fmtState.elements[element] && Object.values(fmtState.elements[element]).some(function (v) { return v !== null })
    var locBtn = document.createElement('button')
    locBtn.className = 'fmt-locate-btn'
    locBtn.title = 'Locate in .twb file'
    locBtn.textContent = '{ }'
    locBtn.disabled = !hasData
    ;(function (elem) {
      locBtn.addEventListener('click', function () {
        vscode.postMessage({ type: 'locateElement', element: elem })
      })
    })(element)
    hdrEl.appendChild(locBtn)

    return row
  }

  function fmtStage(element, attr, value) {
    if (!fmtState.pendingEdits[element]) { fmtState.pendingEdits[element] = {} }
    fmtState.pendingEdits[element][attr] = value
  }
  function fmtDirty(row, element) {
    var hasPending = Object.keys(fmtState.pendingEdits[element] || {}).length > 0
    row.classList.toggle('dirty', hasPending)
    fmtUpdateApplyBtn()
  }
  function fmtUpdateApplyBtn() {
    var btn = document.getElementById('fmt-apply-edits-btn')
    if (btn) { btn.disabled = Object.keys(fmtState.pendingEdits).length === 0 }
  }
  function fmtStatus(tab, msg, tone) {
    var el = document.getElementById('fmt-' + tab + '-status')
    if (!el) { return }
    el.textContent = msg
    el.className = 'fmt-status ' + tone
  }
  function fmtShouldRelaunch() {
    var el = document.getElementById('fmt-relaunch-after-write')
    return el instanceof HTMLInputElement ? el.checked : false
  }
  function fmtRenderExport() {
    var ph = document.getElementById('fmt-export-placeholder')
    var pre = document.getElementById('fmt-json-preview')
    var acts = document.getElementById('fmt-export-actions')
    if (!ph || !pre || !acts) { return }
    if (!fmtState.jsonPreview) {
      ph.textContent = 'No active .twb file or no formatting set.'
      ph.style.display = ''
      pre.style.display = 'none'
      acts.style.display = 'none'
    } else {
      ph.style.display = 'none'
      pre.textContent = fmtState.jsonPreview
      pre.style.display = 'block'
      acts.style.display = 'flex'
    }
  }

  document.getElementById('fmt-apply-edits-btn') && document.getElementById('fmt-apply-edits-btn').addEventListener('click', function () {
    vscode.postMessage({ type: 'applyFormattingEdits', edits: fmtState.pendingEdits, relaunch: fmtShouldRelaunch() })
  })
  document.getElementById('fmt-reset-edits-btn') && document.getElementById('fmt-reset-edits-btn').addEventListener('click', function () {
    fmtState.pendingEdits = {}
    fmtRender()
  })
  document.getElementById('fmt-browse-btn') && document.getElementById('fmt-browse-btn').addEventListener('click', function () {
    vscode.postMessage({ type: 'pickFormattingImportFile' })
  })
  document.getElementById('fmt-apply-theme-btn') && document.getElementById('fmt-apply-theme-btn').addEventListener('click', function () {
    if (!fmtState.importFilePath) { return }
    var modeInput = document.querySelector('input[name="fmt-apply-mode"]:checked')
    var mode = modeInput ? modeInput.value : 'override'
    vscode.postMessage({ type: 'importFormattingTheme', path: fmtState.importFilePath, mode: mode, relaunch: fmtShouldRelaunch() })
  })
  document.getElementById('fmt-save-json-btn') && document.getElementById('fmt-save-json-btn').addEventListener('click', function () {
    if (fmtState.jsonPreview) { vscode.postMessage({ type: 'saveFormattingJson', json: fmtState.jsonPreview }) }
  })
  document.getElementById('fmt-copy-json-btn') && document.getElementById('fmt-copy-json-btn').addEventListener('click', function () {
    if (fmtState.jsonPreview) { navigator.clipboard.writeText(fmtState.jsonPreview) }
  })

  window._fmtHandleMessage = function (message) {
    if (message.type === 'formattingLoaded') {
      fmtState.elements = message.elements || {}
      fmtState.pendingEdits = {}
      fmtRender()
    }
    if (message.type === 'formattingImportFilePicked') {
      fmtState.importFilePath = message.filePath
      var el = document.getElementById('fmt-import-filename')
      if (el) { el.textContent = (message.filePath || '').split(/[/\\]/).pop() || message.filePath }
      var modeRow = document.getElementById('fmt-apply-mode-row')
      if (modeRow) { modeRow.style.display = 'flex' }
      var btn = document.getElementById('fmt-apply-theme-btn')
      if (btn) { btn.disabled = false }
    }
    if (message.type === 'formattingJsonReady') {
      fmtState.jsonPreview = message.json
      fmtRenderExport()
    }
    if (message.type === 'formattingError') {
      fmtStatus(message.tab, message.message, 'error')
    }
    if (message.type === 'formattingSuccess') {
      fmtStatus(message.tab, message.message, 'success')
      if (message.elements) {
        fmtState.elements = message.elements
        fmtState.pendingEdits = {}
        fmtRender()
      }
    }
  }

  fmtRender()
})()

window.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') {
    return
  }
  try {
    if (message.type === 'contextChanged' && message.context) {
      updateSourceLabel(message.context.sourceLabel, message.context.sourceUri)
    }
    if (message.type === 'palettesLoaded') {
      state.palettes = coercePaletteList(message.palettes)
      const selected = state.selectedName
        ? state.palettes.find((item) => item.name === state.selectedName)
        : state.palettes[0]
      if (selected) {
        state.selectedName = selected.name
        state.editor = {
          name: selected.name,
          type: selected.type,
          colors: selected.colors.slice(),
        }
      } else {
        state.selectedName = ''
        state.editor = {
          name: '',
          type: 'regular',
          colors: [],
        }
      }
      updateSourceLabel(message.sourceLabel, message.sourcePath)
      renderAll()
    }
    if (message.type === 'paletteStatus') {
      setStatus(message.message || 'Update complete.', message.tone || 'info')
    }
    if (message.type === 'workbookParsed') {
      state.workbookData = message
      try {
        renderWorkbookData(message)
      } catch (renderErr) {
        console.error('[WBI] renderWorkbookData threw:', renderErr)
        const _eEl = document.getElementById('workbook-empty-state')
        if (_eEl) {
          _eEl.textContent = 'Render error: ' + String(renderErr)
          _eEl.style.display = ''
        }
      }
    }
    if (message.type === 'workbookCleared') {
      state.workbookData = null
      renderWorkbookData(null)
    }
    if (message.type === 'workbookError') {
      state.workbookData = null
      renderWorkbookData(null)
      const emptyEl = document.getElementById('workbook-empty-state')
      if (emptyEl) {
        emptyEl.textContent =
          typeof message.message === 'string'
            ? message.message
            : 'Workbook error.'
      }
    }
    if (message.type === 'extractResult') {
      const extractBtn = document.getElementById('extract-calcs-btn')
      if (extractBtn) {
        const count = typeof message.count === 'number' ? message.count : 0
        const orig = extractBtn.innerHTML
        extractBtn.innerHTML =
          '<svg class="ic"><use href="#i-check"/></svg> Extracted ' +
          count +
          ' calculation' +
          (count !== 1 ? 's' : '')
        extractBtn.classList.remove('bp')
        extractBtn.classList.add('bs')
        extractBtn.style.borderLeft = '3px solid #3794ff'
        setTimeout(() => {
          extractBtn.innerHTML = orig
          extractBtn.classList.remove('bs')
          extractBtn.classList.add('bp')
          extractBtn.style.borderLeft = ''
        }, 2500)
      }
    }
    if (message.type === 'calcBankLoaded') {
      const list = document.getElementById('calc-bank-list')
      if (!list) { return }
      state.calcBankCalcs = message.calcs || []
      if (message.error) {
        list.innerHTML =
          '<div style="padding:8px;font-size:11px;color:var(--vscode-descriptionForeground)">' +
          escapeHtml(message.error) +
          '</div>'
        return
      }
      if (state.calcBankCalcs.length === 0) {
        list.innerHTML =
          '<div style="padding:8px;font-size:11px;color:var(--vscode-descriptionForeground)">No calculations found in _calc_bank.twbl.</div>'
        return
      }
      list.innerHTML = state.calcBankCalcs
        .map(function (c, i) {
          return (
            '<div class="ri" data-action="insertCalcBank" data-index="' +
            i +
            '">' +
            '<svg class="ic" style="flex-shrink:0;margin-right:4px"><use href="#i-fx"/></svg>' +
            '<span class="lb">' +
            escapeHtml(c.title) +
            '</span>' +
            '</div>'
          )
        })
        .join('')
    }
    if (message.type === 'formatStripStatus') {
      setFormatStripStatus(message.message, message.tone)
      return
    }
    if (message.type === 'formatStripScan') {
      updateStripLabels(message.result)
      return
    }
    if (message.type === 'calculationMutationResult') {
      const tone = message.tone || (message.success === true ? 'success' : message.success === false ? 'error' : 'info')
      setCalculationMutationStatus(message.message || 'Workbook calculation update complete.', tone)
      if (tone === 'success') {
        const name = document.getElementById('wb-calc-name')
        const formula = document.getElementById('wb-calc-formula')
        if (name instanceof HTMLInputElement) { name.value = '' }
        if (formula instanceof HTMLTextAreaElement) { formula.value = '' }
      }
      return
    }
    if (message.type === 'commonCalculationsLoaded') {
      renderCommonCalculations(
        message.calculations || [],
        typeof message.maximum === 'number' ? message.maximum : 10,
        message.status,
        message.tone,
      )
      return
    }
    if (message.type === 'calcPortfolioLoaded') {
      const plist = document.getElementById('calc-portfolio-list')
      if (!plist) { return }
      state.calcPortfolioGroups = message.groups || []
      if (state.calcPortfolioGroups.length === 0) {
        plist.innerHTML =
          '<div style="padding:8px;font-size:11px;color:var(--vscode-descriptionForeground)">No example calculations available.</div>'
        return
      }
      plist.innerHTML = state.calcPortfolioGroups
        .map(function (g, gi) {
          const rows = (g.calcs || [])
            .map(function (c, ci) {
              return (
                '<div class="ri" data-action="insertPortfolio" data-g="' + gi + '" data-i="' + ci + '" title="' +
                escapeHtml(c.description || '') + '">' +
                '<svg class="ic" style="flex-shrink:0;margin-right:4px"><use href="#i-fx"/></svg>' +
                '<span class="lb">' + escapeHtml(c.title) + '</span>' +
                '</div>'
              )
            })
            .join('')
          const collapsed = !g.open
          return (
            '<div class="ssh' + (collapsed ? ' c' : '') + '" data-pcat="' + gi + '">' +
            '<span class="cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>' +
            escapeHtml(g.category) +
            '<span style="margin-left:6px;opacity:.55;font-size:10px">' + (g.calcs || []).length + '</span>' +
            '</div>' +
            '<div class="ssb"' + (collapsed ? ' style="display:none"' : '') + '>' + rows + '</div>'
          )
        })
        .join('')
    }
    if (typeof window._fmtHandleMessage === 'function') {
      window._fmtHandleMessage(message)
    }
  } catch (handlerErr) {
    console.error('[WBI] message handler threw:', handlerErr)
  }
})

vscode.postMessage({ type: 'requestContext' })
vscode.postMessage({ type: 'parseWorkbook' })
vscode.postMessage({ type: 'requestCalcPortfolio' })
vscode.postMessage({ type: 'requestCommonCalculations' })

;(function setupCalcBank() {
  const refreshBtn = document.getElementById('calc-bank-refresh')
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'requestCalcBank' })
    })
  }

  // Floating formula preview shown on row hover
  const tooltip = document.createElement('div')
  tooltip.style.cssText =
    'position:fixed;z-index:9999;display:none;max-width:320px;max-height:220px;' +
    'overflow:auto;background:var(--vscode-editorHoverWidget-background,#252526);' +
    'border:1px solid var(--vscode-editorHoverWidget-border,#454545);' +
    'border-radius:4px;padding:8px 10px;' +
    'font-family:var(--vscode-editor-font-family,monospace);font-size:11px;line-height:1.5;' +
    'color:var(--vscode-editorHoverWidget-foreground,#cccccc);pointer-events:none;' +
    'white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,0.4)'
  tooltip.className = 'fx-hl'
  document.body.appendChild(tooltip)

  const calcBankSb = document.getElementById('calc-bank-sb')
  if (calcBankSb) {
    calcBankSb.addEventListener('click', function (event) {
      const row = event.target.closest('[data-action="insertCalcBank"]')
      if (!row || !(row instanceof HTMLElement)) { return }
      const idx = parseInt(row.getAttribute('data-index') || '', 10)
      if (isNaN(idx)) { return }
      const calc = state.calcBankCalcs[idx]
      if (!calc) { return }
      vscode.postMessage({
        type: 'insertFormula',
        formula: '// ' + calc.title + '\n' + calc.formula,
      })
    })

    calcBankSb.addEventListener('mouseover', function (event) {
      const row = event.target.closest('[data-action="insertCalcBank"]')
      if (!row || !(row instanceof HTMLElement)) {
        tooltip.style.display = 'none'
        return
      }
      const idx = parseInt(row.getAttribute('data-index') || '', 10)
      if (isNaN(idx)) { return }
      const calc = state.calcBankCalcs[idx]
      if (!calc || !calc.formula) { return }

      tooltip.innerHTML = highlightFormula(calc.formula)
      tooltip.style.display = 'block'

      const rect = row.getBoundingClientRect()
      const tipH = Math.min(220, tooltip.scrollHeight + 20)
      const spaceBelow = window.innerHeight - rect.bottom
      tooltip.style.top = (spaceBelow >= tipH + 8
        ? rect.bottom + 4
        : Math.max(4, rect.top - tipH - 4)) + 'px'
      tooltip.style.left = Math.max(4, rect.left) + 'px'
      tooltip.style.width = Math.min(320, window.innerWidth - rect.left - 8) + 'px'
    })

    calcBankSb.addEventListener('mouseleave', function () {
      tooltip.style.display = 'none'
    })
  }
})()

;(function setupCalcPortfolio() {
  const refreshBtn = document.getElementById('calc-portfolio-refresh')
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function (event) {
      event.stopPropagation()
      vscode.postMessage({ type: 'requestCalcPortfolio' })
    })
  }

  const list = document.getElementById('calc-portfolio-list')
  if (!list) { return }

  const tooltip = document.createElement('div')
  tooltip.style.cssText =
    'position:fixed;z-index:9999;display:none;max-width:320px;max-height:220px;' +
    'overflow:auto;background:var(--vscode-editorHoverWidget-background,#252526);' +
    'border:1px solid var(--vscode-editorHoverWidget-border,#454545);' +
    'border-radius:4px;padding:8px 10px;' +
    'font-family:var(--vscode-editor-font-family,monospace);font-size:11px;line-height:1.5;' +
    'color:var(--vscode-editorHoverWidget-foreground,#cccccc);pointer-events:none;' +
    'white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,0.4)'
  tooltip.className = 'fx-hl'
  document.body.appendChild(tooltip)

  function calcAt(row) {
    const gi = parseInt(row.getAttribute('data-g') || '', 10)
    const ci = parseInt(row.getAttribute('data-i') || '', 10)
    if (isNaN(gi) || isNaN(ci)) { return null }
    const g = state.calcPortfolioGroups[gi]
    if (!g || !g.calcs) { return null }
    return g.calcs[ci] || null
  }

  list.addEventListener('click', function (event) {
    // Category header → collapse/expand (these rows are added after load, so the
    // generic .ssh handler never bound to them).
    const cat = event.target.closest('.ssh')
    if (cat && list.contains(cat)) {
      tSS(cat)
      tooltip.style.display = 'none'
      return
    }
    const row = event.target.closest('[data-action="insertPortfolio"]')
    if (!row) { return }
    const calc = calcAt(row)
    if (!calc) { return }
    const header = '// ' + calc.title + (calc.description ? ' - ' + calc.description : '')
    vscode.postMessage({ type: 'insertFormula', formula: header + '\n' + calc.formula })
  })

  list.addEventListener('mouseover', function (event) {
    const row = event.target.closest('[data-action="insertPortfolio"]')
    if (!row || !(row instanceof HTMLElement)) {
      tooltip.style.display = 'none'
      return
    }
    const calc = calcAt(row)
    if (!calc || !calc.formula) { return }

    tooltip.innerHTML =
      (calc.description
        ? '<div style="opacity:.7;margin-bottom:5px;font-family:var(--vscode-font-family,sans-serif)">' +
          escapeHtml(calc.description) + '</div>'
        : '') +
      highlightFormula(calc.formula)
    tooltip.style.display = 'block'

    const rect = row.getBoundingClientRect()
    const tipH = Math.min(220, tooltip.scrollHeight + 20)
    const spaceBelow = window.innerHeight - rect.bottom
    tooltip.style.top = (spaceBelow >= tipH + 8
      ? rect.bottom + 4
      : Math.max(4, rect.top - tipH - 4)) + 'px'
    tooltip.style.left = Math.max(4, rect.left) + 'px'
    tooltip.style.width = Math.min(320, window.innerWidth - rect.left - 8) + 'px'
  })

  list.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none'
  })
})()

;(function setupWorkbookCalcHover() {
  const TOOLTIP_CSS =
    'position:fixed;z-index:9999;display:none;max-width:320px;max-height:220px;' +
    'overflow:auto;background:var(--vscode-editorHoverWidget-background,#252526);' +
    'border:1px solid var(--vscode-editorHoverWidget-border,#454545);' +
    'border-radius:4px;padding:8px 10px;' +
    'font-family:var(--vscode-editor-font-family,monospace);font-size:11px;line-height:1.5;' +
    'color:var(--vscode-editorHoverWidget-foreground,#cccccc);pointer-events:none;' +
    'white-space:pre-wrap;word-break:break-word;box-shadow:0 2px 8px rgba(0,0,0,0.4)'

  const tooltip = document.createElement('div')
  tooltip.style.cssText = TOOLTIP_CSS
  tooltip.className = 'fx-hl'
  document.body.appendChild(tooltip)

  const workbookSb = document.getElementById('workbook-sb')
  if (!workbookSb) { return }

  workbookSb.addEventListener('mouseover', function (event) {
    const target = event.target
    if (!(target instanceof Element)) {
      tooltip.style.display = 'none'
      return
    }
    const previewTarget = target.closest('.ti-preview[data-preview-calc-index]')
    if (!previewTarget || !(previewTarget instanceof HTMLElement)) {
      tooltip.style.display = 'none'
      return
    }
    const data = state.workbookData
    if (!data || !data.calculations) {
      tooltip.style.display = 'none'
      return
    }
    const idx = parseInt(
      previewTarget.getAttribute('data-preview-calc-index') || '',
      10,
    )
    if (isNaN(idx)) {
      tooltip.style.display = 'none'
      return
    }
    const calc = data.calculations[idx]
    if (!calc || !calc.formula) {
      tooltip.style.display = 'none'
      return
    }

    tooltip.innerHTML = highlightFormula(calc.formula)
    tooltip.style.display = 'block'

    const rect = previewTarget.getBoundingClientRect()
    const tipH = Math.min(220, tooltip.scrollHeight + 20)
    const spaceBelow = window.innerHeight - rect.bottom
    tooltip.style.top = (spaceBelow >= tipH + 8
      ? rect.bottom + 4
      : Math.max(4, rect.top - tipH - 4)) + 'px'
    tooltip.style.left = Math.max(4, rect.left) + 'px'
    tooltip.style.width = Math.min(320, window.innerWidth - rect.left - 8) + 'px'
  })

  workbookSb.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none'
  })
})()

function renderAll() {
  renderPaletteList()
  renderColors()
  renderThemes()
  renderScalePreview()
  renderBlendPreview()
  if (paletteNameInput) {
    paletteNameInput.value = state.editor.name
  }
  if (paletteTypeSelect) {
    paletteTypeSelect.value = normalizePaletteType(
      state.editor.type || 'regular',
    )
  }
}

function renderPaletteList() {
  if (!paletteList) {
    return
  }
  const badge = document.getElementById('palette-library-badge')
  if (badge) {
    badge.textContent = String(state.palettes.length)
  }
  if (state.palettes.length === 0) {
    paletteList.innerHTML = '<div class="em">No palettes loaded.</div>'
    return
  }
  paletteList.innerHTML = state.palettes
    .map((palette, index) => {
      const colors = normalizeColorList(palette.colors)
      const selClass = palette.name === state.selectedName ? ' sel' : ''
      const gradient = buildGradient(colors)
      const name = escapeHtml(palette.name)
      return (
        '<div class="ri' +
        selClass +
        '" data-index="' +
        index +
        '">' +
        '<div class="cb" style="background:' +
        gradient +
        '"></div>' +
        '<span class="lb">' +
        name +
        '</span>' +
        '<span class="mt">' +
        colors.length +
        '</span>' +
        '<div class="ra">' +
        '<button class="ib" data-action="edit" data-index="' +
        index +
        '" title="Edit"><svg class="ic"><use href="#i-pen"/></svg></button>' +
        '<button class="ib" data-action="apply" data-index="' +
        index +
        '" title="Apply"><svg class="ic"><use href="#i-arrow"/></svg></button>' +
        '<button class="ib" data-action="archive" data-index="' +
        index +
        '" title="Archive"><svg class="ic"><use href="#i-dots"/></svg></button>' +
        '</div>' +
        '</div>'
      )
    })
    .join('')
}

function renderColors() {
  if (!colorsList) {
    return
  }
  const chips = state.editor.colors.map((color, index) => {
    const normalized = normalizeHex(color)
    const safeColor = normalized || '#000000'
    return (
      '<div class="cp" data-index="' +
      index +
      '" style="background:' +
      safeColor +
      '" title="' +
      escapeHtml(safeColor) +
      '"></div>'
    )
  })
  chips.push('<div class="cp add" title="Add Color">+</div>')
  colorsList.innerHTML = chips.join('')
}

function renderThemes() {
  if (!themeList) {
    return
  }
  themeList.innerHTML = themePresets
    .map((theme, index) => {
      const colors = normalizeColorList(theme.colors)
      const gradient = buildGradient(colors)
      const name = escapeHtml(theme.name)
      return (
        '<div class="ri">' +
        '<div class="cb" style="background:' +
        gradient +
        '"></div>' +
        '<span class="lb">' +
        name +
        '</span>' +
        '<span class="mt">' +
        colors.length +
        '</span>' +
        '<div class="ra">' +
        '<button class="ib" data-action="load-theme" data-index="' +
        index +
        '" title="Load"><svg class="ic"><use href="#i-load"/></svg></button>' +
        '<button class="ib" data-action="apply-theme" data-index="' +
        index +
        '" title="Apply"><svg class="ic"><use href="#i-arrow"/></svg></button>' +
        '</div>' +
        '</div>'
      )
    })
    .join('')
}

function renderScalePreview() {
  if (!scalePreview) {
    return
  }
  if (state.scaleColors.length === 0) {
    scalePreview.innerHTML = ''
    return
  }
  scalePreview.innerHTML = state.scaleColors
    .map((color) => {
      const safeColor = sanitizeColor(color)
      return (
        '<div class="sw" style="background:' +
        safeColor +
        '"><span class="tp">' +
        safeColor +
        '</span></div>'
      )
    })
    .join('')
}

function renderBlendPreview() {
  if (!blendPreview) {
    return
  }
  if (state.blendColors.length === 0) {
    blendPreview.innerHTML = ''
    return
  }
  blendPreview.innerHTML = state.blendColors
    .map((color) => {
      const safeColor = sanitizeColor(color)
      return (
        '<div class="sw" style="background:' +
        safeColor +
        '"><span class="tp">' +
        safeColor +
        '</span></div>'
      )
    })
    .join('')
}

function applyGeneratedPalette(colors) {
  state.editor.colors = colors.slice()
  renderAll()
}

const CONNECTION_LABELS = {
  'excel-direct': 'Excel',
  sqlserver: 'SQL Server',
  postgres: 'PostgreSQL',
  snowflake: 'Snowflake',
  textscan: 'CSV/Text',
  hyper: 'Extract',
  bigquery: 'BigQuery',
  redshift: 'Redshift',
  'generic-odbc': 'ODBC',
}

// Token sets mirror syntaxes/twbl.tmLanguage.json so the preview matches the
// editor's syntax highlighting (Dark Modern colours, see .fx-hl / .tree-formula CSS).
const TLSP_KEYWORDS =
  /\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT|IN|FIXED|INCLUDE|EXCLUDE|AGGREGATE|TRUE|FALSE|NULL)\b/gi
const TLSP_FUNCTIONS = new RegExp(
  '\\b(' +
    // aggregate
    'SUM|AVG|COUNT|COUNTD|MIN|MAX|MEDIAN|STDEV|STDEVP|VAR|VARP|PERCENTILE|ATTR|' +
    // date
    'DATEADD|DATEDIFF|DATEPART|DATETRUNC|DATENAME|DATEPARSE|TODAY|NOW|YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|WEEKDAY|QUARTER|MAKEDATE|MAKEDATETIME|MAKETIME|' +
    // string
    'LEFT|RIGHT|MID|LEN|CONTAINS|STARTSWITH|ENDSWITH|REPLACE|SUBSTITUTE|TRIM|LTRIM|RTRIM|UPPER|LOWER|PROPER|SPLIT|FIND|FINDNTH|REGEXP_EXTRACT|REGEXP_MATCH|REGEXP_REPLACE|ASCII|CHAR|' +
    // logical
    'ISNULL|IFNULL|IIF|ISDATE|ISEMPTY|ZN|' +
    // math
    'ABS|ACOS|ASIN|ATAN|ATAN2|CEILING|COS|COT|DEGREES|EXP|FLOOR|HEXBINX|HEXBINY|LN|LOG|PI|POWER|RADIANS|ROUND|SIGN|SIN|SQRT|SQUARE|TAN|DIV|' +
    // table calc
    'FIRST|INDEX|LAST|LOOKUP|PREVIOUS_VALUE|RANK|RANK_DENSE|RANK_UNIQUE|RUNNING_AVG|RUNNING_COUNT|RUNNING_MAX|RUNNING_MIN|RUNNING_SUM|SIZE|TOTAL|WINDOW_AVG|WINDOW_COUNT|WINDOW_MAX|WINDOW_MIN|WINDOW_SUM|WINDOW_MEDIAN|WINDOW_STDEV|WINDOW_VAR|' +
    // type conversion
    'BOOL|DATE|DATETIME|FLOAT|INT|STR' +
    ')\\b',
  'gi',
)

function highlightFormula(formula) {
  if (!formula) {
    return ''
  }
  let result = escapeHtml(formula)
  const placeholders = []
  function stash(cls, value) {
    const token = '@@TLSP_' + placeholders.length + '@@'
    placeholders.push({ token, html: '<span class="' + cls + '">' + value + '</span>' })
    return token
  }

  // Protect, in editor precedence, the spans whose contents must NOT be re-tokenised:
  // block comments, line comments, string literals, then field references. (Keywords
  // like CASE inside [Case Type] or a // comment must stay a single colour.)
  // Match strings in their escaped form (escapeHtml has already run): "…" is &quot;…&quot;
  // and '…' is &#39;…&#39;. Stashing them here also protects the digits inside &#39;
  // from the numeric-literal pass below.
  result = result.replace(/\/\*[\s\S]*?\*\//g, function (m) { return stash('cmt', m) })
  result = result.replace(/\/\/[^\r\n]*/g, function (m) { return stash('cmt', m) })
  result = result.replace(/&quot;[^<]*?&quot;|&#39;[^<]*?&#39;/g, function (m) { return stash('str', m) })
  result = result.replace(/\[[^\]]+\]/g, function (m) { return stash('fld', m) })

  // Keywords (blue), functions (yellow), numeric literals (green). The lookbehind keeps
  // digits that belong to a word or an HTML entity (e.g. the 39 in &#39;) from matching.
  result = result.replace(TLSP_KEYWORDS, '<span class="kw">$1</span>')
  result = result.replace(TLSP_FUNCTIONS, '<span class="fn">$1</span>')
  result = result.replace(/(?<![\w#])\d+(?:\.\d+)?\b/g, '<span class="num">$&</span>')

  // Expand placeholders; loop so comment/string spans that contain other tokens resolve.
  let guard = 0
  while (result.indexOf('@@TLSP_') !== -1 && guard++ < 100) {
    placeholders.forEach(function (entry) {
      result = result.split(entry.token).join(entry.html)
    })
  }
  return result
}

let _renderedFilePath = null

function renderWorkbookData(data) {
  const fileCard = document.getElementById('workbook-file-card')
  const emptyState = document.getElementById('workbook-empty-state')
  const extractWrap = document.getElementById('extract-calcs-wrap')

  const workbookSbEl2 = document.getElementById('workbook-sb')
  if (!data) {
    if (fileCard) {
      fileCard.style.display = 'none'
      fileCard.innerHTML = ''
    }
    if (emptyState) {
      emptyState.textContent =
        'Open a\u202f.twb or .twbx file to inspect its contents.'
      emptyState.style.display = ''
    }
    if (extractWrap) {
      extractWrap.style.display = 'none'
    }
    ;[
      'wb-datasources-content',
      'wb-calcs-content',
      'wb-fields-content',
      'wb-sheets-content',
      'wb-palettes-content',
    ].forEach((id) => {
      const el = document.getElementById(id)
      if (el) {
        el.innerHTML = ''
      }
    })
    updateWbBadge('wb-datasources-badge', 0)
    updateWbBadge('wb-calcs-badge', 0)
    updateWbBadge('wb-fields-badge', 0)
    updateWbBadge('wb-sheets-badge', 0)
    updateWbBadge('wb-palettes-badge', 0)
    // Collapse any expanded workbook sub-sections when data is cleared
    if (workbookSbEl2) {
      workbookSbEl2.querySelectorAll('.ssh:not(.c)').forEach(function (h) {
        tSS(h)
      })
    }
    _renderedFilePath = null
    renderCalculationEditor(null)
    return
  }

  if (emptyState) {
    emptyState.style.display = 'none'
  }
  if (fileCard) {
    fileCard.style.display = ''
    renderFileCard(data)
  }
  if (extractWrap) {
    extractWrap.style.display = ''
  }

  renderDatasources(data.datasources || [])
  renderCalcFields(data.calculations || [])
  renderCalculationEditor(data)
  renderFields(data.fields || [])
  renderWorksheets(data.worksheets || [])
  renderWorkbookPaletteList(data.palettes || [])

  updateWbBadge('wb-datasources-badge', (data.datasources || []).length)
  updateWbBadge('wb-calcs-badge', (data.calculations || []).length)
  updateWbBadge('wb-fields-badge', (data.fields || []).length)
  updateWbBadge('wb-sheets-badge', (data.worksheets || []).length)
  updateWbBadge('wb-palettes-badge', (data.palettes || []).length)

  // Expand sub-sections only when a new workbook file is loaded, not on re-parses,
  // so the user's manually collapsed sections are preserved.
  if (workbookSbEl2 && data.filePath !== _renderedFilePath) {
    workbookSbEl2.querySelectorAll('.ssh.c:not([data-preserve-collapsed="true"])').forEach(function (h) {
      tSS(h)
    })
  }
  _renderedFilePath = data.filePath
}

function updateWbBadge(id, count) {
  const el = document.getElementById(id)
  if (el) {
    el.textContent = String(count)
  }
}

function renderFileCard(data) {
  const el = document.getElementById('workbook-file-card')
  if (!el) {
    return
  }
  const fileName = escapeHtml(data.fileName || 'Workbook')
  const versionPart = data.tableauVersion
    ? 'Tableau\u00A0' + escapeHtml(data.tableauVersion) + '\u00A0\u00B7\u00A0'
    : ''
  const ds = data.datasourceCount || 0
  const cl = data.calcCount || 0
  const sh = data.sheetCount || 0
  const meta =
    versionPart +
    ds +
    '\u00A0datasource' +
    (ds !== 1 ? 's' : '') +
    '\u00A0\u00B7\u00A0' +
    cl +
    '\u00A0calc' +
    (cl !== 1 ? 's' : '') +
    '\u00A0\u00B7\u00A0' +
    sh +
    '\u00A0sheet' +
    (sh !== 1 ? 's' : '')
  const safePath = escapeHtml(data.filePath || '')
  el.innerHTML =
    '<svg class="ic"><use href="#i-twb"/></svg>' +
    '<div class="wb-file-info">' +
    '<div class="wb-file-name" title="' +
    safePath +
    '">' +
    fileName +
    '</div>' +
    '<div class="wb-file-meta">' +
    meta +
    '</div>' +
    '</div>' +
    '<button class="ib" id="reveal-file-btn" title="Open in Explorer"><svg class="ic"><use href="#i-load"/></svg></button>'
  const revealBtn = document.getElementById('reveal-file-btn')
  if (revealBtn && data.filePath) {
    const fp = data.filePath
    revealBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'revealFile', path: fp })
    })
  }
}

var WB_LIST_LIMIT = 6
// Render the first WB_LIST_LIMIT items, hiding the rest behind a "Show more"
// toggle so long Calculated Fields / Fields lists don't flood the sidebar.
function joinWithShowMore(htmlItems) {
  if (htmlItems.length <= WB_LIST_LIMIT) {
    return htmlItems.join('')
  }
  var remaining = htmlItems.length - WB_LIST_LIMIT
  return (
    htmlItems.slice(0, WB_LIST_LIMIT).join('') +
    '<div class="wb-more-hidden" hidden>' +
    htmlItems.slice(WB_LIST_LIMIT).join('') +
    '</div>' +
    '<div class="tree-more" data-action="toggle-more" data-remaining="' +
    remaining +
    '" role="button" tabindex="0">' +
    '<span class="tree-more-chev"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>' +
    '<span class="tree-more-label">Show ' +
    remaining +
    ' more</span>' +
    '</div>'
  )
}

function renderDatasources(datasources) {
  const el = document.getElementById('wb-datasources-content')
  if (!el) {
    return
  }
  if (!datasources.length) {
    el.innerHTML = '<div class="sub-empty">No datasources found.</div>'
    return
  }
  el.innerHTML = joinWithShowMore(
    datasources.map((ds, idx) => {
      const caption = escapeHtml(ds.caption || 'Unknown')
      const cls = ds.connectionClass || 'unknown'
      const label = CONNECTION_LABELS[cls] || escapeHtml(cls)
      const dsFields = ds.fields || []
      const fieldRows = dsFields.length
        ? dsFields
            .map(
              (f, fi) =>
                '<div class="tree-item" data-action="copy-field" data-ds="' +
                idx +
                '" data-field="' +
                fi +
                '" title="Copy [' +
                escapeHtml(f.name) +
                ']">' +
                '<span class="ti-icon"><svg class="ic"><use href="#i-field"/></svg></span>' +
                '<span class="ti-label">' +
                escapeHtml(f.name) +
                '</span>' +
                (f.datatype
                  ? '<span class="ti-type">' + escapeHtml(f.datatype) + '</span>'
                  : '') +
                '</div>',
            )
            .join('')
        : '<div class="sub-empty">No plain fields in this datasource.</div>'
      return (
        '<div class="tree-item ti-ds" data-action="toggle-ds-fields" data-index="' +
        idx +
        '" title="Show fields">' +
        '<span class="ds-cv"><svg class="ic" style="width:9px;height:9px"><use href="#i-chev-d"/></svg></span>' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-db"/></svg></span>' +
        '<span class="ti-label">' +
        caption +
        '</span>' +
        '<span class="ti-type">' +
        label +
        '</span>' +
        '<div class="ti-actions">' +
        '<button class="ib" data-action="copy-ds-fields" data-index="' +
        idx +
        '" title="Copy all field names"><svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg></button>' +
        '<button class="ib" data-action="generate-field-defs" data-index="' +
        idx +
        '" title="Create field definitions (fields.d.twbl)"><svg class="ic" aria-hidden="true"><use href="#i-field"/></svg></button>' +
        '</div>' +
        '</div>' +
        '<div class="ds-fields" id="ds-fields-' +
        idx +
        '" hidden>' +
        fieldRows +
        '</div>'
      )
    }),
  )
}

function renderCalcFields(calcs) {
  const el = document.getElementById('wb-calcs-content')
  if (!el) {
    return
  }
  if (!calcs.length) {
    el.innerHTML = '<div class="sub-empty">No calculated fields found.</div>'
    return
  }
  el.innerHTML = joinWithShowMore(
    calcs.map((calc, idx) => {
      const caption = escapeHtml(calc.caption || 'Unnamed')
      const formula = calc.formula || ''
      const firstLine = formula.split('\n')[0].slice(0, 120)
      const highlighted = highlightFormula(firstLine)
      const dtBadge = calc.datatype
        ? '<span class="ti-badge">' + escapeHtml(calc.datatype) + '</span>'
        : ''
      return (
        '<div class="tree-item tree-item-calc" data-action="copy-calc" data-index="' +
        idx +
        '">' +
        '<button class="ib ib-preview ti-preview" data-action="preview-formula" data-index="' +
        idx +
        '" data-preview-calc-index="' +
        idx +
        '" title="Preview Formula"><svg class="ic" style="width:14px;height:14px" aria-hidden="true"><use href="#i-info"/></svg></button>' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-fx"/></svg></span>' +
        '<span class="ti-label">' +
        caption +
        '</span>' +
        dtBadge +
        '<div class="ti-actions">' +
        '<button class="ib" data-action="copy-formula" data-index="' +
        idx +
        '" title="Copy Formula"><svg class="ic"><use href="#i-files"/></svg></button>' +
        '<button class="ib" data-action="insert-formula" data-index="' +
        idx +
        '" title="Insert into Editor"><svg class="ic"><use href="#i-arrow"/></svg></button>' +
        '</div>' +
        '</div>' +
        '<div class="tree-formula">' +
        highlighted +
        '</div>'
      )
    }),
  )
}

function renderCalculationEditor(data) {
  const select = document.getElementById('wb-calc-datasource')
  const button = document.getElementById('wb-add-calc-btn')
  if (!(select instanceof HTMLSelectElement) || !(button instanceof HTMLButtonElement)) {
    return
  }
  const isPlainWorkbook = Boolean(data && typeof data.filePath === 'string' && data.filePath.toLowerCase().endsWith('.twb'))
  const datasources = isPlainWorkbook && Array.isArray(data.datasources)
    ? data.datasources.filter(function (item) {
        const caption = item && typeof item.caption === 'string' ? item.caption : ''
        return caption && caption.toLowerCase() !== 'parameters'
      })
    : []
  select.innerHTML = datasources.map(function (item) {
    const caption = item.caption
    return '<option value="' + escapeHtml(caption) + '">' + escapeHtml(caption) + '</option>'
  }).join('')
  select.disabled = datasources.length === 0
  button.disabled = datasources.length === 0
  if (!isPlainWorkbook && data) {
    setCalculationMutationStatus('Calculation writes currently require an unpackaged .twb file.', 'info')
  } else if (!data) {
    setCalculationMutationStatus('', 'info')
  }
}

function setCalculationMutationStatus(message, tone) {
  const el = document.getElementById('wb-add-calc-status')
  if (!el) { return }
  el.textContent = message || ''
  el.className = message ? 'fmt-status ' + (tone || 'info') : 'fmt-status hidden'
}

function selectedCommonCalculation() {
  const select = document.getElementById('wb-common-calc-select')
  if (!(select instanceof HTMLSelectElement) || select.value === '') {
    return null
  }
  const index = parseInt(select.value, 10)
  return Number.isInteger(index) ? state.commonCalculations[index] || null : null
}

function updateCommonCalculationActions() {
  const selected = Boolean(selectedCommonCalculation())
  const useButton = document.getElementById('wb-common-calc-use')
  const deleteButton = document.getElementById('wb-common-calc-delete')
  if (useButton instanceof HTMLButtonElement) { useButton.disabled = !selected }
  if (deleteButton instanceof HTMLButtonElement) { deleteButton.disabled = !selected }
}

function renderCommonCalculations(calculations, maximum, status, tone) {
  state.commonCalculations = Array.isArray(calculations) ? calculations : []
  const select = document.getElementById('wb-common-calc-select')
  const badge = document.getElementById('wb-common-calc-badge')
  const summary = document.getElementById('wb-common-calc-summary')
  if (badge) { badge.textContent = state.commonCalculations.length + ' / ' + maximum }
  if (summary) {
    summary.textContent = state.commonCalculations.length + ' saved'
  }
  if (select instanceof HTMLSelectElement) {
    select.innerHTML = '<option value="">Choose a saved calculation…</option>' +
      state.commonCalculations.map(function (calculation, index) {
        return '<option value="' + index + '">' + escapeHtml(calculation.name) + '</option>'
      }).join('')
  }
  updateCommonCalculationActions()
  if (status) {
    setCommonCalculationStatus(status, tone || 'info')
  }
}

function setCommonCalculationStatus(message, tone) {
  const el = document.getElementById('wb-common-calc-status')
  if (!el) { return }
  el.textContent = message || ''
  el.className = message ? 'fmt-status ' + (tone || 'info') : 'fmt-status hidden'
}

function renderFields(fields) {
  const el = document.getElementById('wb-fields-content')
  if (!el) {
    return
  }
  if (!fields.length) {
    el.innerHTML = '<div class="sub-empty">No fields found.</div>'
    return
  }
  el.innerHTML = joinWithShowMore(
    fields.map((field) => {
      const name = escapeHtml(field.name || '')
      const dt = field.datatype ? escapeHtml(field.datatype) : ''
      return (
        '<div class="tree-item">' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-field"/></svg></span>' +
        '<span class="ti-label">' +
        name +
        '</span>' +
        (dt ? '<span class="ti-type">' + dt + '</span>' : '') +
        '</div>'
      )
    }),
  )
}

function renderWorksheets(worksheets) {
  const el = document.getElementById('wb-sheets-content')
  if (!el) {
    return
  }
  if (!worksheets.length) {
    el.innerHTML = '<div class="sub-empty">No worksheets found.</div>'
    return
  }
  el.innerHTML = joinWithShowMore(
    worksheets.map((name) => {
      return (
        '<div class="tree-item">' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-grid"/></svg></span>' +
        '<span class="ti-label">' +
        escapeHtml(name) +
        '</span>' +
        '</div>'
      )
    }),
  )
}

function renderWorkbookPaletteList(palettes) {
  const el = document.getElementById('wb-palettes-content')
  if (!el) {
    return
  }
  if (!palettes.length) {
    el.innerHTML =
      '<div class="sub-empty">No custom palettes in this workbook.</div>'
    return
  }
  el.innerHTML = palettes
    .map((palette, index) => {
      const colors = normalizeColorList(palette.colors)
      const gradient = buildGradient(colors)
      const name = escapeHtml(palette.name)
      return (
        '<div class="ri">' +
        '<div class="cb" style="background:' +
        gradient +
        '"></div>' +
        '<span class="lb">' +
        name +
        '</span>' +
        '<span class="mt">' +
        colors.length +
        '</span>' +
        '<div class="ra">' +
        '<button class="ib" data-action="import-workbook" data-index="' +
        index +
        '" title="Import to library"><svg class="ic"><use href="#i-import"/></svg></button>' +
        '</div>' +
        '</div>'
      )
    })
    .join('')
}

function updateSourceLabel(label, path) {
  const sourceEl = document.getElementById('palette-source')
  if (!sourceEl) {
    return
  }
  sourceEl.textContent = label ? 'Source: ' + label : 'Source: not available'
  sourceEl.title = path || ''
}

function setFormatStripStatus(message, tone) {
  const el = document.getElementById('format-strip-status')
  const textEl = document.getElementById('format-strip-status-text')
  if (!el || !textEl) {
    return
  }
  if (!message) {
    el.style.display = 'none'
    textEl.textContent = ''
    return
  }
  textEl.textContent = message
  el.style.display = ''
  const iconUse = el.querySelector('use')
  if (iconUse) {
    if (tone === 'error') {
      iconUse.setAttribute('href', '#i-info')
      el.style.background = 'rgba(241,76,76,0.08)'
      el.style.borderColor = 'rgba(241,76,76,0.4)'
    } else if (tone === 'success') {
      iconUse.setAttribute('href', '#i-check-c')
      el.style.background = 'rgba(0,120,212,0.08)'
      el.style.borderColor = 'rgba(0,120,212,0.25)'
    } else {
      iconUse.setAttribute('href', '#i-info')
      el.style.background = 'rgba(0,120,212,0.08)'
      el.style.borderColor = 'rgba(0,120,212,0.25)'
    }
  }
}

function updateStripLabels(result) {
  const ids = ['strip-borders-info', 'strip-bold-info', 'strip-font-size-info', 'strip-font-color-info']
  if (!result) {
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) {
        el.textContent = ''
      }
    }
    return
  }
  setStripLabelInfo('strip-borders-info', result.borders)
  setStripLabelInfo('strip-bold-info', result.bold)
  setStripLabelInfo('strip-font-size-info', result.fontSize)
  setStripLabelInfo('strip-font-color-info', result.fontColor)
}

function setStripLabelInfo(id, scan) {
  const el = document.getElementById(id)
  if (!el || !scan) {
    return
  }
  const count = scan.count || 0
  const values = scan.values || []
  if (count === 0) {
    el.textContent = '(0)'
    return
  }
  const shown = values.slice(0, 4)
  const extra = values.length - shown.length
  const valStr = shown.join(', ') + (extra > 0 ? ' … +' + extra + ' more' : '')
  el.textContent = '(' + count + ') ' + valStr
}

function setStatus(message, tone) {
  const statusEl = document.getElementById('palette-status')
  const statusText = document.getElementById('palette-status-text')
  if (!statusEl || !statusText) {
    return
  }
  if (!message) {
    statusEl.style.display = 'none'
    statusText.textContent = ''
    return
  }
  statusText.textContent = message
  statusEl.style.display = ''
  const iconUse = statusEl.querySelector('use')
  if (iconUse) {
    if (tone === 'error') {
      iconUse.setAttribute('href', '#i-info')
      statusEl.style.background = 'rgba(241,76,76,0.08)'
      statusEl.style.borderColor = 'rgba(241,76,76,0.4)'
    } else if (tone === 'success') {
      iconUse.setAttribute('href', '#i-check-c')
      statusEl.style.background = 'rgba(0,120,212,0.08)'
      statusEl.style.borderColor = 'rgba(0,120,212,0.25)'
    } else {
      iconUse.setAttribute('href', '#i-info')
      statusEl.style.background = 'rgba(0,120,212,0.08)'
      statusEl.style.borderColor = 'rgba(0,120,212,0.25)'
    }
  }
}

function normalizeHex(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  const hex = trimmed.startsWith('#') ? trimmed : '#' + trimmed
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return ''
  }
  return hex.toUpperCase()
}

function sanitizeColor(value) {
  return normalizeHex(value) || '#000000'
}

function normalizeSteps(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return clampNumber(parsed, 3, 15)
}

function normalizeColorList(colors) {
  if (!Array.isArray(colors)) {
    return []
  }
  return colors.map((color) => normalizeHex(color)).filter(Boolean)
}

function coercePaletteList(value) {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set()
  const palettes = []

  value.forEach((entry) => {
    if (!entry || typeof entry.name !== 'string') {
      return
    }
    const name = entry.name.trim()
    if (!name) {
      return
    }
    const key = name.toLowerCase()
    if (seen.has(key)) {
      return
    }
    seen.add(key)

    const type = normalizePaletteType(entry.type)
    const colors = normalizeColorList(entry.colors)

    palettes.push({
      name,
      type,
      colors,
    })
  })

  return palettes
}

function normalizePaletteType(value) {
  if (
    value === 'ordered-sequential' ||
    value === 'ordered-diverging' ||
    value === 'regular'
  ) {
    return value
  }
  return 'regular'
}

function upsertPalette(palette) {
  const key = palette.name.toLowerCase()
  const existingIndex = state.palettes.findIndex(
    (item) => item.name.toLowerCase() === key,
  )
  if (existingIndex >= 0) {
    state.palettes[existingIndex] = palette
    return
  }
  state.palettes.push(palette)
}

function ensureUniqueName(baseName) {
  const seed =
    typeof baseName === 'string' && baseName.trim()
      ? baseName.trim()
      : 'Untitled Palette'
  let candidate = seed
  let index = 2
  while (
    state.palettes.some(
      (palette) => palette.name.toLowerCase() === candidate.toLowerCase(),
    )
  ) {
    candidate = seed + ' ' + index
    index += 1
  }
  return candidate
}

function buildGradient(colors) {
  if (!Array.isArray(colors) || colors.length === 0) {
    return 'linear-gradient(90deg, #2F3843 0%, #4E5C6C 100%)'
  }
  const safeColors = colors.map(sanitizeColor)
  if (safeColors.length === 1) {
    return (
      'linear-gradient(90deg, ' +
      safeColors[0] +
      ' 0%, ' +
      safeColors[0] +
      ' 100%)'
    )
  }
  const stops = safeColors
    .map((color, index) => {
      const percent = Math.round((index / (safeColors.length - 1)) * 100)
      return color + ' ' + percent + '%'
    })
    .join(', ')
  return 'linear-gradient(90deg, ' + stops + ')'
}

function generateScaleColors(baseHex, steps, easingType) {
  const normalized = normalizeHex(baseHex)
  if (!normalized) {
    return []
  }
  const rgb = hexToRgb(normalized)
  if (!rgb) {
    return []
  }

  // Convert to LAB for perceptually uniform scaling
  const baseLab = rgbToLab(rgb)
  const count = Math.max(2, steps)
  const colors = []

  // Create lighter and darker versions
  const lightLab = {
    l: Math.min(baseLab.l + 40, 95),
    a: baseLab.a,
    b: baseLab.b,
  }
  const darkLab = {
    l: Math.max(baseLab.l - 40, 10),
    a: baseLab.a,
    b: baseLab.b,
  }

  for (let i = 0; i < count; i += 1) {
    let t = count === 1 ? 0 : i / (count - 1)
    t = applyEasing(t, easingType)

    const l = lightLab.l + (darkLab.l - lightLab.l) * t
    const a = lightLab.a + (darkLab.a - lightLab.a) * t
    const b = lightLab.b + (darkLab.b - lightLab.b) * t

    const stepRgb = labToRgb({ l, a, b })
    colors.push(rgbToHex(stepRgb))
  }

  return colors
}

function generateBlendColors(startHex, endHex, steps, easingType, colorspace) {
  const startRgb = hexToRgb(startHex)
  const endRgb = hexToRgb(endHex)
  if (!startRgb || !endRgb) {
    return []
  }

  const count = Math.max(2, steps)
  const colors = []

  if (colorspace === 'lab') {
    // LAB interpolation (perceptually uniform)
    const startLab = rgbToLab(startRgb)
    const endLab = rgbToLab(endRgb)

    for (let i = 0; i < count; i += 1) {
      let t = count === 1 ? 0 : i / (count - 1)
      t = applyEasing(t, easingType)

      const l = startLab.l + (endLab.l - startLab.l) * t
      const a = startLab.a + (endLab.a - startLab.a) * t
      const b = startLab.b + (endLab.b - startLab.b) * t

      const rgb = labToRgb({ l, a, b })
      colors.push(rgbToHex(rgb))
    }
  } else if (colorspace === 'hsl') {
    // HSL interpolation (hue-based)
    const startHsl = rgbToHsl(startRgb)
    const endHsl = rgbToHsl(endRgb)

    for (let i = 0; i < count; i += 1) {
      let t = count === 1 ? 0 : i / (count - 1)
      t = applyEasing(t, easingType)

      const h = startHsl.h + (endHsl.h - startHsl.h) * t
      const s = startHsl.s + (endHsl.s - startHsl.s) * t
      const l = startHsl.l + (endHsl.l - startHsl.l) * t

      const rgb = hslToRgb({ h, s, l })
      colors.push(rgbToHex(rgb))
    }
  } else {
    // RGB interpolation (direct)
    for (let i = 0; i < count; i += 1) {
      let t = count === 1 ? 0 : i / (count - 1)
      t = applyEasing(t, easingType)

      const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * t)
      const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * t)
      const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * t)
      colors.push(rgbToHex({ r, g, b }))
    }
  }

  return colors
}

function applyEasing(t, type) {
  switch (type) {
    case 'easeIn':
      return t * t * t
    case 'easeOut':
      return 1 - Math.pow(1 - t, 3)
    case 'easeInOut':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    default:
      return t
  }
}

function hexToRgb(value) {
  const normalized = normalizeHex(value)
  if (!normalized) {
    return null
  }
  const hex = normalized.slice(1)
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null
  }
  return { r, g, b }
}

function rgbToHex(rgb) {
  const r = clampNumber(Math.round(rgb.r), 0, 255)
  const g = clampNumber(Math.round(rgb.g), 0, 255)
  const b = clampNumber(Math.round(rgb.b), 0, 255)
  const hex =
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  return hex.toUpperCase()
}

function rgbToHsl(rgb) {
  const r = clampNumber(rgb.r, 0, 255) / 255
  const g = clampNumber(rgb.g, 0, 255) / 255
  const b = clampNumber(rgb.b, 0, 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  }
}

function hslToRgb(hsl) {
  const h = (((hsl.h % 360) + 360) % 360) / 360
  const s = clampNumber(hsl.s, 0, 100) / 100
  const l = clampNumber(hsl.l, 0, 100) / 100

  if (s === 0) {
    const gray = Math.round(l * 255)
    return { r: gray, g: gray, b: gray }
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  const r = hueToRgb(p, q, h + 1 / 3)
  const g = hueToRgb(p, q, h)
  const b = hueToRgb(p, q, h - 1 / 3)

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

function hueToRgb(p, q, t) {
  let value = t
  if (value < 0) {
    value += 1
  }
  if (value > 1) {
    value -= 1
  }
  if (value < 1 / 6) {
    return p + (q - p) * 6 * value
  }
  if (value < 1 / 2) {
    return q
  }
  if (value < 2 / 3) {
    return p + (q - p) * (2 / 3 - value) * 6
  }
  return p
}

function rgbToLab(rgb) {
  // RGB to XYZ
  let r = rgb.r / 255
  let g = rgb.g / 255
  let b = rgb.b / 255

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92

  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100

  // XYZ to LAB
  x = x / 95.047
  y = y / 100.0
  z = z / 108.883

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116

  return {
    l: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  }
}

function labToRgb(lab) {
  // LAB to XYZ
  let y = (lab.l + 16) / 116
  let x = lab.a / 500 + y
  let z = y - lab.b / 200

  x = Math.pow(x, 3) > 0.008856 ? Math.pow(x, 3) : (x - 16 / 116) / 7.787
  y = Math.pow(y, 3) > 0.008856 ? Math.pow(y, 3) : (y - 16 / 116) / 7.787
  z = Math.pow(z, 3) > 0.008856 ? Math.pow(z, 3) : (z - 16 / 116) / 7.787

  x = x * 95.047
  y = y * 100.0
  z = z * 108.883

  // XYZ to RGB
  x = x / 100
  y = y / 100
  z = z / 100

  let r = x * 3.2406 + y * -1.5372 + z * -0.4986
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415
  let b = x * 0.0557 + y * -0.204 + z * 1.057

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b

  return {
    r: clampNumber(Math.round(r * 255), 0, 255),
    g: clampNumber(Math.round(g * 255), 0, 255),
    b: clampNumber(Math.round(b * 255), 0, 255),
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, value))
}

function escapeHtml(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
