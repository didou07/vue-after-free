import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { fn, mem, BigInt } from 'download0/types'

if (typeof libc_addr === 'undefined') include('userland.js')
if (typeof lang === 'undefined') include('languages.js')

;(function () {
  log('Loading config UI...')

  // ── Config state ──────────────────────────────────────────────────────────
  interface Cfg {
    autolapse: boolean;
    autopoop: boolean;
    autoclose: boolean
    autoclose_delay: number;
    music: boolean;
    jb_behavior: number;
    theme: string
    exp_core: number;
    exp_grooms: number;
    exp_races: number;
    exp_timeout: number
  }
  const C: Cfg = {
    autolapse: false,
    autopoop: false,
    autoclose: false,
    autoclose_delay: 0,
    music: true,
    jb_behavior: 0,
    theme: 'default',
    exp_core: 4,
    exp_grooms: 512,
    exp_races: 100,
    exp_timeout: 8
  }
  let userPayloads: string[] = []
  let configLoaded = false

  const jbLabels = [lang.jbBehaviorAuto, lang.jbBehaviorNetctrl, lang.jbBehaviorLapse]

  // ── File I/O ──────────────────────────────────────────────────────────────
  const fs = {
    write (f: string, d: string, cb: (e: Error | null) => void) {
      const x = new jsmaf.XMLHttpRequest()
      x.onreadystatechange = function () {
        if (x.readyState === 4 && cb) cb(x.status === 0 || x.status === 200 ? null : new Error('xhr'))
      }
      x.open('POST', 'file://../download0/' + f, true); x.send(d)
    },
    read (f: string, cb: (e: Error | null, d?: string) => void) {
      const x = new jsmaf.XMLHttpRequest()
      x.onreadystatechange = function () {
        if (x.readyState === 4 && cb) cb(x.status === 0 || x.status === 200 ? null : new Error('xhr'), x.responseText)
      }
      x.open('GET', 'file://../download0/' + f, true); x.send()
    }
  }

  // ── Theme scan ────────────────────────────────────────────────────────────
  function scanThemes (): string[] {
    const themes: string[] = []
    try {
      try { fn.register(0x05, 'dcfg_open', ['bigint', 'bigint', 'bigint'], 'bigint') } catch (_e) { /* registered */ }
      try { fn.register(0x06, 'dcfg_close', ['bigint'], 'bigint') } catch (_e) { /* registered */ }
      try { fn.register(0x110, 'dcfg_getdents', ['bigint', 'bigint', 'bigint'], 'bigint') } catch (_e) { /* registered */ }
      const dir = '/download0/themes'
      const pa = mem.malloc(256); const buf = mem.malloc(4096)
      for (let i = 0; i < dir.length; i++) mem.view(pa).setUint8(i, dir.charCodeAt(i))
      mem.view(pa).setUint8(dir.length, 0)
      const fd = fn.dcfg_open(pa, new BigInt(0, 0), new BigInt(0, 0))
      if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
        const cnt = fn.dcfg_getdents(fd, buf, new BigInt(0, 4096))
        if (!cnt.eq(new BigInt(0xffffffff, 0xffffffff)) && cnt.lo > 0) {
          let off = 0
          while (off < cnt.lo) {
            const rl = mem.view(buf.add(new BigInt(0, off + 4))).getUint16(0, true)
            const dt = mem.view(buf.add(new BigInt(0, off + 6))).getUint8(0)
            const nl = mem.view(buf.add(new BigInt(0, off + 7))).getUint8(0)
            let name = ''
            for (let i = 0; i < nl; i++) name += String.fromCharCode(mem.view(buf.add(new BigInt(0, off + 8 + i))).getUint8(0))
            if (dt === 4 && name !== '.' && name !== '..') themes.push(name)
            off += rl
          }
        }
        fn.dcfg_close(fd)
      }
    } catch (e) { log('Theme scan: ' + (e as Error).message) }
    if (!themes.includes('default')) themes.unshift('default')
    return themes
  }

  const availableThemes = scanThemes()
  const themeLabels = availableThemes.map((t: string) => t.charAt(0).toUpperCase() + t.slice(1))

  // ── Option definitions ────────────────────────────────────────────────────
  // section: 'general' | 'exploit' — used for visual grouping
  type OptType = 'toggle' | 'cycle'
  interface Opt { key: string; label: string; imgKey: string; type: OptType; section: string; hint: string }
  const opts: Opt[] = [
    { key: 'music', label: lang.music, imgKey: 'music', type: 'toggle', section: 'general', hint: 'Background music on/off' },
    { key: 'autolapse', label: lang.autoLapse, imgKey: 'autoLapse', type: 'toggle', section: 'general', hint: 'Auto-run Lapse on success' },
    { key: 'autopoop', label: lang.autoPoop, imgKey: 'autoPoop', type: 'toggle', section: 'general', hint: 'Auto-deploy payload on success' },
    { key: 'autoclose', label: lang.autoClose, imgKey: 'autoClose', type: 'toggle', section: 'general', hint: 'Close browser after jailbreak' },
    { key: 'jb_behavior', label: lang.jbBehavior, imgKey: 'jbBehavior', type: 'cycle', section: 'general', hint: 'Post-exploit behavior mode' },
    { key: 'theme', label: lang.theme || 'Theme', imgKey: 'theme', type: 'cycle', section: 'general', hint: 'UI theme selection' },
    { key: 'exp_core', label: 'CPU Core', imgKey: 'jbBehavior', type: 'cycle', section: 'exploit', hint: 'CPU core used for exploit (0-5)' },
    { key: 'exp_grooms', label: 'Heap Grooms', imgKey: 'jbBehavior', type: 'cycle', section: 'exploit', hint: 'Heap grooming iterations' },
    { key: 'exp_races', label: 'Race Attempts', imgKey: 'jbBehavior', type: 'cycle', section: 'exploit', hint: 'Race condition attempt count' },
    { key: 'exp_timeout', label: 'Timeout', imgKey: 'jbBehavior', type: 'cycle', section: 'exploit', hint: 'Exploit timeout in seconds' },
  ]
  const TOTAL = opts.length

  // ── Layout constants ──────────────────────────────────────────────────────
  const SW = 1920
  const SH = 1080
  const PAD_X = 60
  const HEADER_H = 160
  const FOOTER_H = 44
  const AVAIL_H = SH - HEADER_H - FOOTER_H - 16
  const BTN_H = 78
  const BTN_GAP = 8
  const VISIBLE = Math.min(TOTAL, Math.floor(AVAIL_H / (BTN_H + BTN_GAP)))

  // Left panel: option name (~55%); right panel: value detail (~45%)
  const ROW_W = SW - PAD_X * 2        // 1800px
  const START_Y = HEADER_H + 8
  // Value column starts at 60% of row width
  const VAL_OFF = Math.floor(ROW_W * 0.60)
  const VAL_X = PAD_X + VAL_OFF
  // Detail hint column
  const HINT_X = VAL_X + 260

  const BG_URL = 'file:///../download0/img/multiview_bg_VAF.png'
  const BTN_URL = 'file:///../download0/img/NeonBtn.png'
  const SFX_CUR = 'file:///../download0/sfx/cursor.wav'
  const SFX_OK = 'file:///../download0/sfx/confirm.wav'
  const SFX_BCK = 'file:///../download0/sfx/cancel.wav'

  function sfx (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const cl = new jsmaf.AudioClip(); cl.volume = 1.0; cl.open(url) } catch (_e) { /* no audio */ }
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  new Style({ name: 'white', color: 'rgb(255,255,255)', size: 22 })
  new Style({ name: 'title', color: 'rgb(255,255,255)', size: 32 })
  new Style({ name: 'muted', color: 'rgba(255,255,255,0.50)', size: 20 })
  new Style({ name: 'dim', color: 'rgba(255,255,255,0.28)', size: 15 })
  new Style({ name: 'sec', color: 'rgba(120,210,255,0.50)', size: 13 })
  new Style({ name: 'val', color: 'rgb(120,210,255)', size: 20 })
  new Style({ name: 'selval', color: 'rgb(80,230,255)', size: 20 })
  new Style({ name: 'toggle_on', color: 'rgb(80,230,150)', size: 20 })
  new Style({ name: 'toggle_off', color: 'rgba(255,100,100,0.80)', size: 20 })
  new Style({ name: 'scroll', color: 'rgba(120,200,255,0.70)', size: 18 })
  new Style({ name: 'footer', color: 'rgba(255,255,255,0.28)', size: 16 })
  new Style({ name: 'hint', color: 'rgba(255,255,255,0.22)', size: 15 })
  new Style({ name: 'colhdr', color: 'rgba(120,210,255,0.40)', size: 13 })

  // Background
  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: SW, height: SH }))

  // ── Header ────────────────────────────────────────────────────────────────
  const hdr = new Image({ url: BTN_URL, x: 0, y: 0, width: SW, height: HEADER_H, alpha: 0.18 })
  hdr.borderColor = 'rgba(120,200,255,0.15)'; hdr.borderWidth = 0
  jsmaf.root.children.push(hdr)

  const hdrAccent = new Image({ url: BTN_URL, x: 0, y: 0, width: 5, height: HEADER_H, alpha: 1.0 })
  hdrAccent.borderColor = 'rgb(80,200,255)'; hdrAccent.borderWidth = 0
  jsmaf.root.children.push(hdrAccent)

  jsmaf.root.children.push(new Image({
    url: 'file:///../download0/img/logo.png',
    x: SW - 220,
    y: 12,
    width: 200,
    height: 112
  }))

  if (useImageText) {
    jsmaf.root.children.push(new Image({
      url: textImageBase + 'config.png',
      x: PAD_X,
      y: 38,
      width: 300,
      height: 72
    }))
  } else {
    const ttl = new jsmaf.Text()
    ttl.text = (lang.config || 'SETTINGS').toUpperCase()
    ttl.x = PAD_X; ttl.y = 52; ttl.style = 'title'
    jsmaf.root.children.push(ttl)
  }

  // Sub-title: item count
  const subTxt = new jsmaf.Text()
  subTxt.text = TOTAL + ' settings'
  subTxt.x = PAD_X; subTxt.y = 110; subTxt.style = 'sec'
  jsmaf.root.children.push(subTxt)

  // Header divider
  const divH = new Image({
    url: BTN_URL,
    x: PAD_X,
    y: HEADER_H - 2,
    width: SW - PAD_X * 2,
    height: 2,
    alpha: 0.35
  })
  divH.borderColor = 'rgba(120,200,255,0.5)'; divH.borderWidth = 0
  jsmaf.root.children.push(divH)

  // Column header labels
  const hdrOpt = new jsmaf.Text()
  hdrOpt.text = 'OPTION'; hdrOpt.x = PAD_X + 22; hdrOpt.y = HEADER_H + 2; hdrOpt.style = 'colhdr'
  jsmaf.root.children.push(hdrOpt)

  const hdrVal = new jsmaf.Text()
  hdrVal.text = 'VALUE'; hdrVal.x = VAL_X; hdrVal.y = HEADER_H + 2; hdrVal.style = 'colhdr'
  jsmaf.root.children.push(hdrVal)

  const hdrHnt = new jsmaf.Text()
  hdrHnt.text = 'DESCRIPTION'; hdrHnt.x = HINT_X; hdrHnt.y = HEADER_H + 2; hdrHnt.style = 'colhdr'
  jsmaf.root.children.push(hdrHnt)

  // Vertical separators between columns
  const sep1 = new Image({ url: BTN_URL, x: VAL_X - 16, y: START_Y, width: 1, height: AVAIL_H, alpha: 0.15 })
  sep1.borderColor = 'rgba(255,255,255,0.2)'; sep1.borderWidth = 0
  jsmaf.root.children.push(sep1)

  const sep2 = new Image({ url: BTN_URL, x: HINT_X - 16, y: START_Y, width: 1, height: AVAIL_H, alpha: 0.10 })
  sep2.borderColor = 'rgba(255,255,255,0.2)'; sep2.borderWidth = 0
  jsmaf.root.children.push(sep2)

  // ── Slot widgets ──────────────────────────────────────────────────────────
  const slotBgs: Image[] = []
  const slotBars: Image[] = []
  const slotSections: jsmaf.Text[] = []
  const slotLabels: (Image | jsmaf.Text)[] = []
  const slotArrows: jsmaf.Text[] = []
  const slotValues: jsmaf.Text[] = []
  const slotHints: jsmaf.Text[] = []

  for (let s = 0; s < VISIBLE; s++) {
    const bY = START_Y + s * (BTN_H + BTN_GAP)

    const bg = new Image({ url: BTN_URL, x: PAD_X, y: bY, width: ROW_W, height: BTN_H, alpha: 0.10 })
    bg.borderColor = 'rgba(255,255,255,0.14)'; bg.borderWidth = 1
    slotBgs.push(bg); jsmaf.root.children.push(bg)

    const bar = new Image({ url: BTN_URL, x: PAD_X, y: bY, width: 5, height: BTN_H, alpha: 0.28 })
    bar.borderColor = 'rgb(120,200,255)'; bar.borderWidth = 0
    slotBars.push(bar); jsmaf.root.children.push(bar)

    // Section badge (GENERAL / EXPLOIT)
    const sec = new jsmaf.Text(); sec.text = ''; sec.x = PAD_X + 14; sec.y = bY + 12; sec.style = 'sec'
    slotSections.push(sec); jsmaf.root.children.push(sec)

    // Option label
    let lbl: Image | jsmaf.Text
    if (useImageText) {
      lbl = new Image({ url: '', x: PAD_X + 14, y: bY + 18, width: 200, height: 44 })
    } else {
      const t = new jsmaf.Text(); t.text = ''; t.x = PAD_X + 14; t.y = bY + 32; t.style = 'muted'
      lbl = t
    }
    slotLabels.push(lbl); jsmaf.root.children.push(lbl)

    // Cycle arrow indicator (‹ › for cycle opts)
    const arr = new jsmaf.Text(); arr.text = ''; arr.x = VAL_X - 32; arr.y = bY + 30; arr.style = 'dim'
    slotArrows.push(arr); jsmaf.root.children.push(arr)

    // Value
    const vt = new jsmaf.Text(); vt.text = ''; vt.x = VAL_X; vt.y = bY + 30; vt.style = 'val'
    slotValues.push(vt); jsmaf.root.children.push(vt)

    // Hint (description)
    const ht = new jsmaf.Text(); ht.text = ''; ht.x = HINT_X; ht.y = bY + 30; ht.style = 'hint'
    slotHints.push(ht); jsmaf.root.children.push(ht)
  }

  // Scroll indicators
  const arrowUp = new jsmaf.Text(); arrowUp.text = '▲  Scroll up'
  arrowUp.x = SW / 2 - 70
  arrowUp.y = HEADER_H + 2; arrowUp.style = 'scroll'; arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)

  const arrowDn = new jsmaf.Text(); arrowDn.text = '▼  More below'
  arrowDn.x = SW / 2 - 70
  arrowDn.y = START_Y + VISIBLE * (BTN_H + BTN_GAP) + 4; arrowDn.style = 'scroll'; arrowDn.visible = false
  jsmaf.root.children.push(arrowDn)

  // ── Footer bar ────────────────────────────────────────────────────────────
  const footBg = new Image({ url: BTN_URL, x: 0, y: SH - FOOTER_H, width: SW, height: FOOTER_H, alpha: 0.40 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)

  const backLabel = jsmaf.circleIsAdvanceButton ? 'X' : 'O'
  const confirmLabel = jsmaf.circleIsAdvanceButton ? 'O' : 'X'
  if (useImageText) {
    jsmaf.root.children.push(new Image({
      url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack' : 'oToGoBack') + '.png',
      x: PAD_X,
      y: SH - FOOTER_H + 6,
      width: 160,
      height: 32
    }))
  } else {
    const fh = new jsmaf.Text()
    fh.text = '↑↓  Navigate    ' + confirmLabel + '  Change value    ' + backLabel + '  Save & back'
    fh.x = SW / 2 - 260; fh.y = SH - FOOTER_H + 14; fh.style = 'footer'
    jsmaf.root.children.push(fh)
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let cur = 0; let scrollOff = 0

  function getVal (idx: number): string {
    const o = opts[idx]!; const k = o.key as keyof Cfg
    if (o.type === 'toggle') {
      // Returned as separate style marker — returned value used by renderRows
      return C[k] ? 'ON' : 'OFF'
    }
    if (k === 'jb_behavior') return jbLabels[C.jb_behavior] || jbLabels[0]!
    if (k === 'theme') { const ti = availableThemes.indexOf(C.theme); return themeLabels[ti >= 0 ? ti : 0]! }
    if (k === 'exp_core') return 'Core ' + C.exp_core
    if (k === 'exp_grooms') return '' + C.exp_grooms
    if (k === 'exp_races') return '' + C.exp_races
    if (k === 'exp_timeout') return C.exp_timeout + 's'
    return ''
  }

  function renderRows () {
    for (let s = 0; s < VISIBLE; s++) {
      const idx = scrollOff + s; const vis = idx < TOTAL
      slotBgs[s]!.visible = vis
      slotBars[s]!.visible = vis
      slotSections[s]!.visible = vis
      slotLabels[s]!.visible = vis
      slotArrows[s]!.visible = vis
      slotValues[s]!.visible = vis
      slotHints[s]!.visible = vis
      if (!vis) continue

      const o = opts[idx]!
      const sel = idx === cur
      const val = getVal(idx)
      const isCycle = o.type === 'cycle'
      const isToggle = o.type === 'toggle'
      const isOn = isToggle && val === 'ON'

      // Row background
      slotBgs[s]!.alpha = sel ? 0.24 : 0.10
      slotBgs[s]!.borderColor = sel ? 'rgba(80,200,255,0.85)' : 'rgba(255,255,255,0.14)'
      slotBgs[s]!.borderWidth = sel ? 2 : 1
      slotBars[s]!.alpha = sel ? 1.0 : 0.28
      slotBars[s]!.borderColor = sel
        ? (isToggle ? (isOn ? 'rgb(80,230,150)' : 'rgb(255,100,100)') : 'rgb(80,200,255)')
        : 'rgb(120,200,255)'

      // Section badge — show only when first of section or section changes
      const prevSection = idx > 0 ? opts[idx - 1]!.section : ''
      slotSections[s]!.text = (o.section !== prevSection) ? o.section.toUpperCase() : ''

      // Label
      if (useImageText) {
        (slotLabels[s] as Image).url = textImageBase + o.imgKey + '.png'
      } else {
        ;(slotLabels[s] as jsmaf.Text).text = o.label
        ;(slotLabels[s] as jsmaf.Text).style = sel ? 'white' : 'muted'
      }

      // Cycle arrow
      slotArrows[s]!.text = isCycle ? '›' : ''
      slotArrows[s]!.style = sel ? 'val' : 'dim'

      // Value
      slotValues[s]!.text = val
      if (isToggle) slotValues[s]!.style = sel ? (isOn ? 'toggle_on' : 'toggle_off') : (isOn ? 'toggle_on' : 'toggle_off')
      else if (isCycle) slotValues[s]!.style = sel ? 'selval' : 'val'

      // Hint
      slotHints[s]!.text = o.hint
    }

    arrowUp.visible = scrollOff > 0
    arrowDn.visible = (scrollOff + VISIBLE) < TOTAL
  }

  function clamp () {
    if (cur < scrollOff) scrollOff = cur
    else if (cur >= scrollOff + VISIBLE) scrollOff = cur - VISIBLE + 1
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  function saveConfig (done?: () => void) {
    if (!configLoaded) { if (done) done(); return }
    const out = {
      config: {
        autolapse: C.autolapse,
        autopoop: C.autopoop,
        autoclose: C.autoclose,
        autoclose_delay: C.autoclose_delay,
        music: C.music,
        jb_behavior: C.jb_behavior,
        theme: C.theme,
        exploit: {
          core: C.exp_core,
          rtprio: 256,
          grooms: C.exp_grooms,
          races: C.exp_races,
          alias: 100,
          sds: 64,
          workers: 2,
          timeout_s: C.exp_timeout
        }
      },
      payloads: userPayloads
    }
    fs.write('config.json', JSON.stringify(out, null, 2), function (err) {
      if (err) log('Save error: ' + err.message); else log('Config saved')
      if (done) done()
    })
  }

  function loadConfig () {
    fs.read('config.json', function (err: Error | null, data?: string) {
      if (err) { log('Load error: ' + err.message); configLoaded = true; renderRows(); return }
      try {
        const d = JSON.parse(data || '{}')
        if (d.config) {
          const G = d.config
          C.autolapse = G.autolapse || false
          C.autopoop = G.autopoop || false
          C.autoclose = G.autoclose || false
          C.autoclose_delay = G.autoclose_delay || 0
          C.music = G.music !== false
          C.jb_behavior = G.jb_behavior || 0
          C.theme = (G.theme && availableThemes.includes(G.theme)) ? G.theme : 'default'
          if (d.payloads && Array.isArray(d.payloads)) userPayloads = d.payloads.slice()
          if (G.exploit) {
            const ex = G.exploit
            if (ex.core !== undefined) C.exp_core = ex.core
            if (ex.grooms !== undefined) C.exp_grooms = ex.grooms
            if (ex.races !== undefined) C.exp_races = ex.races
            if (ex.timeout_s !== undefined) C.exp_timeout = ex.timeout_s
          }
        }
        configLoaded = true; renderRows()
        if (C.music) { if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled() } else { if (typeof stopBgm === 'function') stopBgm() }
        log('Config loaded')
      } catch (e) { log('Parse error: ' + (e as Error).message); configLoaded = true; renderRows() }
    })
  }

  // ── Cycle/Toggle value ────────────────────────────────────────────────────
  function onPress () {
    const o = opts[cur]; if (!o) return
    const k = o.key as keyof Cfg
    if (o.type === 'cycle') {
      if (k === 'jb_behavior') { C.jb_behavior = (C.jb_behavior + 1) % jbLabels.length } else if (k === 'theme') { const ti = availableThemes.indexOf(C.theme); C.theme = availableThemes[(ti + 1) % availableThemes.length]! } else if (k === 'exp_core') { C.exp_core = (C.exp_core + 1) % 6 } else if (k === 'exp_grooms') { const v = [128, 256, 512, 768, 1024, 1280]; const i = v.indexOf(C.exp_grooms); C.exp_grooms = v[(i + 1) % v.length]! } else if (k === 'exp_races') { const v = [50, 75, 100, 150, 200, 300]; const i = v.indexOf(C.exp_races); C.exp_races = v[(i + 1) % v.length]! } else if (k === 'exp_timeout') { const v = [5, 8, 10, 15, 20]; const i = v.indexOf(C.exp_timeout); C.exp_timeout = v[(i + 1) % v.length]! }
    } else {
      if (k === 'autolapse' || k === 'autopoop' || k === 'autoclose' || k === 'music') {
        C[k] = !C[k]
        if (k === 'music') {
          if (typeof CONFIG !== 'undefined') CONFIG.music = C.music
          if (C.music) { if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled() } else { if (typeof stopBgm === 'function') stopBgm() }
        }
        // autolapse and autopoop are mutually exclusive
        if (k === 'autolapse' && C.autolapse) C.autopoop = false
        if (k === 'autopoop' && C.autopoop) C.autolapse = false
      }
    }
    renderRows(); saveConfig()
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (kc: number) {
    if (kc === 6 || kc === 5) {
      cur = (cur + 1) % TOTAL; sfx(SFX_CUR); clamp(); renderRows()
    } else if (kc === 4 || kc === 7) {
      cur = (cur - 1 + TOTAL) % TOTAL; sfx(SFX_CUR); clamp(); renderRows()
    } else if (kc === confirmKey) {
      sfx(SFX_OK); onPress()
    } else if (kc === backKey) {
      sfx(SFX_BCK)
      saveConfig(function () {
        try {
          include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'default') + '/main.js')
        } catch (e) { log('Back error: ' + (e as Error).message) }
      })
    }
  }

  renderRows(); loadConfig()
  log('Config UI loaded — ' + TOTAL + ' options, ' + VISIBLE + ' visible per page.')
  ;((_a) => {})(libc_addr) // suppress unused import
})()
