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

  const extractCalcsHeaderBtn = document.getElementById(
    'extract-calcs-header-btn',
  )
  if (extractCalcsHeaderBtn) {
    extractCalcsHeaderBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'extractCalculations' })
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
      if (!(target instanceof HTMLElement)) {
        return
      }
      const button = target.closest('[data-action]')
      if (!button || !(button instanceof HTMLElement)) {
        return
      }
      const action = button.dataset.action
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
      }
    })
  }

  renderAll()
  vscode.postMessage({ type: 'requestPalettes' })
}

// Message handler and workbook/context init are intentionally OUTSIDE the
// palette-editor guard so they always run even if a builder element is null.
window.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') {
    return
  }
  console.error('[WBI v6] received type=' + message.type)
  vscode.postMessage({
    type: 'webviewDiag',
    message: '[v6] handler fired, type=' + message.type,
  })
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
      vscode.postMessage({
        type: 'webviewDiag',
        message: '[v6] workbookParsed branch hit, fileName=' + message.fileName,
      })
      const _emptyDbg = document.getElementById('workbook-empty-state')
      if (_emptyDbg) {
        _emptyDbg.textContent = '[v6] workbookParsed received — rendering\u2026'
        _emptyDbg.style.display = ''
      }
      try {
        renderWorkbookData(message)
        vscode.postMessage({
          type: 'webviewDiag',
          message: '[v6] renderWorkbookData completed without throw',
        })
      } catch (renderErr) {
        console.error('[WBI v6] renderWorkbookData threw:', renderErr)
        vscode.postMessage({
          type: 'webviewDiag',
          message: '[v6] renderWorkbookData THREW: ' + String(renderErr),
        })
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
  } catch (handlerErr) {
    console.error('[WBI v6] message handler threw:', handlerErr)
    vscode.postMessage({
      type: 'webviewDiag',
      message: '[v6] OUTER handler threw: ' + String(handlerErr),
    })
  }
})

vscode.postMessage({ type: 'requestContext' })
vscode.postMessage({ type: 'parseWorkbook' })

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

function highlightFormula(formula) {
  if (!formula) {
    return ''
  }
  let result = escapeHtml(formula)
  // Control flow keywords (blue)
  result = result.replace(
    /\b(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT|TRUE|FALSE|NULL)\b/gi,
    '<span class="kw">$1</span>',
  )
  // Function names (yellow)
  result = result.replace(
    /\b(SUM|AVG|COUNT|COUNTD|MIN|MAX|ATTR|CONTAINS|STARTSWITH|ENDSWITH|LEN|LEFT|RIGHT|TRIM|REPLACE|SPLIT|MID|FIND|UPPER|LOWER|FLOOR|CEILING|ROUND|ABS|ZN|ISNULL|ISDATE|DATE|DATEPART|DATEDIFF|DATEADD|TODAY|NOW|STR|INT|FLOAT|IFNULL|IIF|LOOKUP|WINDOW_SUM|WINDOW_AVG|WINDOW_COUNT|WINDOW_MIN|WINDOW_MAX|FIRST|LAST|SIZE|INDEX|RANK|PERCENTILE|STDEV|VAR|COLLECT|FIXED|INCLUDE|EXCLUDE)\b/gi,
    '<span class="fn">$1</span>',
  )
  // Field references (light blue)
  result = result.replace(/(\[[^\]]+\])/g, '<span class="fld">$1</span>')
  // String literals (&quot; after escapeHtml)
  result = result.replace(
    /(&quot;[^<]*?&quot;)/g,
    '<span class="str">$1</span>',
  )
  return result
}

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
  renderFields(data.fields || [])
  renderWorksheets(data.worksheets || [])
  renderWorkbookPaletteList(data.palettes || [])

  updateWbBadge('wb-datasources-badge', (data.datasources || []).length)
  updateWbBadge('wb-calcs-badge', (data.calculations || []).length)
  updateWbBadge('wb-fields-badge', (data.fields || []).length)
  updateWbBadge('wb-sheets-badge', (data.worksheets || []).length)
  updateWbBadge('wb-palettes-badge', (data.palettes || []).length)

  // Expand any still-collapsed workbook sub-sections so the data is visible
  if (workbookSbEl2) {
    workbookSbEl2.querySelectorAll('.ssh.c').forEach(function (h) {
      tSS(h)
    })
  }
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

function renderDatasources(datasources) {
  const el = document.getElementById('wb-datasources-content')
  if (!el) {
    return
  }
  if (!datasources.length) {
    el.innerHTML = '<div class="sub-empty">No datasources found.</div>'
    return
  }
  el.innerHTML = datasources
    .map((ds) => {
      const caption = escapeHtml(ds.caption || 'Unknown')
      const cls = ds.connectionClass || 'unknown'
      const label = CONNECTION_LABELS[cls] || escapeHtml(cls)
      return (
        '<div class="tree-item">' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-db"/></svg></span>' +
        '<span class="ti-label">' +
        caption +
        '</span>' +
        '<span class="ti-type">' +
        label +
        '</span>' +
        '</div>'
      )
    })
    .join('')
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
  el.innerHTML = calcs
    .map((calc, idx) => {
      const caption = escapeHtml(calc.caption || 'Unnamed')
      const formula = calc.formula || ''
      const firstLine = formula.split('\n')[0].slice(0, 120)
      const highlighted = highlightFormula(firstLine)
      const dtBadge = calc.datatype
        ? '<span class="ti-badge">' + escapeHtml(calc.datatype) + '</span>'
        : ''
      return (
        '<div class="tree-item" data-action="copy-calc" data-index="' +
        idx +
        '" title="Copy formula with field name">' +
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
    })
    .join('')
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
  el.innerHTML = fields
    .map((field) => {
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
    })
    .join('')
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
  el.innerHTML = worksheets
    .map((name) => {
      return (
        '<div class="tree-item">' +
        '<span class="ti-icon"><svg class="ic"><use href="#i-grid"/></svg></span>' +
        '<span class="ti-label">' +
        escapeHtml(name) +
        '</span>' +
        '</div>'
      )
    })
    .join('')
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
