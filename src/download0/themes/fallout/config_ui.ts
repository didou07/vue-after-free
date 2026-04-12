import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { fn, mem, BigInt } from 'download0/types'

if (typeof libc_addr === 'undefined') { include('userland.js') }
if (typeof lang === 'undefined')      { include('languages.js') }

;(function () {
  log('Loading fallout config UI...')

  const fs = {
    write: function (f: string, c: string, cb: (e: Error | null) => void) {
      const x = new jsmaf.XMLHttpRequest()
      x.onreadystatechange = function () {
        if (x.readyState === 4 && cb)
          cb(x.status === 0 || x.status === 200 ? null : new Error('write failed'))
      }
      x.open('POST', 'file://../download0/' + f, true); x.send(c)
    },
    read: function (f: string, cb: (e: Error | null, d?: string) => void) {
      const x = new jsmaf.XMLHttpRequest()
      x.onreadystatechange = function () {
        if (x.readyState === 4 && cb)
          cb(x.status === 0 || x.status === 200 ? null : new Error('read failed'), x.responseText)
      }
      x.open('GET', 'file://../download0/' + f, true); x.send()
    }
  }

  // ── Config state ──────────────────────────────────────────────────────────
  const C: {
    autolapse: boolean; autopoop: boolean; autoclose: boolean
    autoclose_delay: number; music: boolean; log_to_usb: boolean
    jb_behavior: number; theme: string
    exp_core: number; exp_grooms: number; exp_races: number; exp_timeout: number
  } = {
    autolapse: false, autopoop: false, autoclose: false,
    autoclose_delay: 0, music: true, log_to_usb: true,
    jb_behavior: 0, theme: 'fallout',
    exp_core: 4, exp_grooms: 512, exp_races: 100, exp_timeout: 8
  }

  let userPayloads: string[] = []
  let configLoaded = false

  const jbLabels  = [lang.jbBehaviorAuto, lang.jbBehaviorNetctrl, lang.jbBehaviorLapse]
  const jbImgKeys = ['jbBehaviorAuto', 'jbBehaviorNetctrl', 'jbBehaviorLapse']

  // ── Theme scanner (safe register) ─────────────────────────────────────────
  function scanThemes (): string[] {
    const themes: string[] = []
    try {
      try { fn.register(0x05,  'fcfg_open',     ['bigint', 'bigint', 'bigint'], 'bigint') } catch (_) {}
      try { fn.register(0x06,  'fcfg_close',    ['bigint'],                     'bigint') } catch (_) {}
      try { fn.register(0x110, 'fcfg_getdents', ['bigint', 'bigint', 'bigint'], 'bigint') } catch (_) {}

      const dir = '/download0/themes'
      const pa  = mem.malloc(256); const buf = mem.malloc(4096)
      for (let i = 0; i < dir.length; i++) mem.view(pa).setUint8(i, dir.charCodeAt(i))
      mem.view(pa).setUint8(dir.length, 0)

      const fd = fn.fcfg_open(pa, new BigInt(0, 0), new BigInt(0, 0))
      if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
        const cnt = fn.fcfg_getdents(fd, buf, new BigInt(0, 4096))
        if (!cnt.eq(new BigInt(0xffffffff, 0xffffffff)) && cnt.lo > 0) {
          let off = 0
          while (off < cnt.lo) {
            const rl = mem.view(buf.add(new BigInt(0, off + 4))).getUint16(0, true)
            const dt = mem.view(buf.add(new BigInt(0, off + 6))).getUint8(0)
            const nl = mem.view(buf.add(new BigInt(0, off + 7))).getUint8(0)
            let name = ''
            for (let i = 0; i < nl; i++)
              name += String.fromCharCode(mem.view(buf.add(new BigInt(0, off + 8 + i))).getUint8(0))
            if (dt === 4 && name !== '.' && name !== '..') themes.push(name)
            off += rl
          }
        }
        fn.fcfg_close(fd)
      }
    } catch (e) { log('Theme scan error: ' + (e as Error).message) }

    const idx = themes.indexOf('default')
    if (idx > 0) { themes.splice(idx, 1); themes.unshift('default') }
    else if (idx < 0) themes.unshift('default')
    return themes
  }

  const availableThemes = scanThemes()
  const themeLabels = availableThemes.map((t: string) => t.charAt(0).toUpperCase() + t.slice(1))

  // ── Layout — scrollable list ───────────────────────────────────────────────
  // Screen 1920×1080. Header ~180. Footer @1040.
  // 7 visible × 110 = 770 → rows 190..960 ✓
  const VISIBLE = 7
  const CX      = 960
  const BTN_W   = 650
  const BTN_H   = 80
  const BTN_L   = CX - BTN_W / 2
  const START_Y = 190
  const ROW_GAP = 110
  const VAL_X   = BTN_L + Math.floor(BTN_W * 0.53)

  const BG_URL  = 'file:///../download0/img/FalloutBG.png'
  const BTN_URL = 'file:///assets/img/button_over_9.png'

  function playSound (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) } catch (_) {}
  }
  const SFX_CURSOR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_CONFIRM = 'file:///../download0/sfx/confirm.wav'
  const SFX_CANCEL  = 'file:///../download0/sfx/cancel.wav'

  // ── Scene ─────────────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  new Style({ name: 'white',  color: 'rgb(255,255,255)',       size: 24 })
  new Style({ name: 'title',  color: 'rgb(220,180,80)',        size: 30 })
  new Style({ name: 'muted',  color: 'rgba(255,255,255,0.50)', size: 22 })
  new Style({ name: 'dim',    color: 'rgba(220,180,80,0.50)',  size: 18 })
  new Style({ name: 'value',  color: 'rgb(220,180,80)',        size: 22 })
  new Style({ name: 'sel',    color: 'rgb(255,255,255)',       size: 22 })
  new Style({ name: 'selval', color: 'rgb(255,210,60)',        size: 22 })
  new Style({ name: 'footer', color: 'rgba(255,255,255,0.30)', size: 17 })
  new Style({ name: 'scroll', color: 'rgba(220,180,80,0.80)',  size: 20 })

  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: 1920, height: 1080 }))
  jsmaf.root.children.push(new Image({ url: 'file:///../download0/img/logo.png', x: 1620, y: 0, width: 300, height: 169 }))

  // Title
  if (useImageText) {
    jsmaf.root.children.push(new Image({ url: textImageBase + 'config.png', x: 860, y: 100, width: 200, height: 60 }))
  } else {
    const ttl = new jsmaf.Text(); ttl.text = lang.config; ttl.x = 900; ttl.y = 110; ttl.style = 'title'
    jsmaf.root.children.push(ttl)
  }

  // Column headers
  const hdrLbl = new jsmaf.Text(); hdrLbl.text = 'OPTION'; hdrLbl.x = BTN_L + 20; hdrLbl.y = START_Y - 28; hdrLbl.style = 'dim'
  const hdrVal = new jsmaf.Text(); hdrVal.text = 'VALUE';  hdrVal.x = VAL_X;       hdrVal.y = START_Y - 28; hdrVal.style = 'dim'
  jsmaf.root.children.push(hdrLbl); jsmaf.root.children.push(hdrVal)

  // ── Options list ──────────────────────────────────────────────────────────
  const opts = [
    { key: 'autolapse',   label: lang.autoLapse,       imgKey: 'autoLapse',  type: 'toggle' },
    { key: 'autopoop',    label: lang.autoPoop,         imgKey: 'autoPoop',   type: 'toggle' },
    { key: 'autoclose',   label: lang.autoClose,        imgKey: 'autoClose',  type: 'toggle' },
    { key: 'music',       label: lang.music,            imgKey: 'music',      type: 'toggle' },
    { key: 'log_to_usb',  label: 'Log to USB',          imgKey: 'music',      type: 'toggle' },
    { key: 'jb_behavior', label: lang.jbBehavior,       imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'theme',       label: lang.theme || 'Theme', imgKey: 'theme',      type: 'cycle'  },
    { key: 'exp_core',    label: 'CPU Core (0-5)',       imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_grooms',  label: 'Heap Grooms',          imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_races',   label: 'Race Attempts',        imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_timeout', label: 'Timeout (s)',          imgKey: 'jbBehavior', type: 'cycle'  },
  ]
  const TOTAL = opts.length

  // ── Slot widgets ──────────────────────────────────────────────────────────
  const slotBgs:    Image[]      = []
  const slotLabels: jsmaf.Text[] = []
  const slotValues: jsmaf.Text[] = []

  for (let s = 0; s < VISIBLE; s++) {
    const bY = START_Y + s * ROW_GAP

    const bg = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.70 })
    bg.borderColor = 'rgba(220,180,80,0.20)'; bg.borderWidth = 1
    jsmaf.root.children.push(bg); slotBgs.push(bg)

    const lbl = new jsmaf.Text(); lbl.text = ''; lbl.x = BTN_L + 28; lbl.y = bY + 26; lbl.style = 'muted'
    jsmaf.root.children.push(lbl); slotLabels.push(lbl)

    const val = new jsmaf.Text(); val.text = ''; val.x = VAL_X; val.y = bY + 26; val.style = 'value'
    jsmaf.root.children.push(val); slotValues.push(val)
  }

  // ── Scroll arrows ─────────────────────────────────────────────────────────
  const arrowUp = new jsmaf.Text()
  arrowUp.text = '▲'; arrowUp.x = CX - 12; arrowUp.y = START_Y - 26; arrowUp.style = 'scroll'; arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)

  const arrowDn = new jsmaf.Text()
  arrowDn.text = '▼'; arrowDn.x = CX - 12; arrowDn.y = START_Y + VISIBLE * ROW_GAP + 6; arrowDn.style = 'scroll'
  jsmaf.root.children.push(arrowDn)

  // ── Back hint ─────────────────────────────────────────────────────────────
  if (useImageText) {
    jsmaf.root.children.push(new Image({
      url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack.png' : 'oToGoBack.png'),
      x: CX - 60, y: 1000, width: 150, height: 40
    }))
  } else {
    const bh = new jsmaf.Text()
    bh.text = jsmaf.circleIsAdvanceButton ? lang.xToGoBack : lang.oToGoBack
    bh.x = CX - 60; bh.y = 1000; bh.style = 'dim'
    jsmaf.root.children.push(bh)
  }

  // ── State & helpers ───────────────────────────────────────────────────────
  let cur = 0; let scrollOff = 0

  function valText (idx: number): string {
    const o = opts[idx]!; const k = o.key
    if (o.type === 'toggle') return (C as any)[k] ? '✔  ON' : '✘  OFF'
    if (k === 'jb_behavior') {
      if (useImageText) return ''   // image-based display
      return jbLabels[C.jb_behavior] || jbLabels[0]!
    }
    if (k === 'theme') { const i = availableThemes.indexOf(C.theme); return themeLabels[i >= 0 ? i : 0]! }
    if (k === 'exp_core')    return 'Core ' + C.exp_core
    if (k === 'exp_grooms')  return '' + C.exp_grooms
    if (k === 'exp_races')   return '' + C.exp_races
    if (k === 'exp_timeout') return C.exp_timeout + 's'
    return ''
  }

  function renderRows () {
    for (let s = 0; s < VISIBLE; s++) {
      const idx = scrollOff + s; const vis = idx < TOTAL
      slotBgs[s]!.visible = slotLabels[s]!.visible = slotValues[s]!.visible = vis
      if (!vis) continue
      const o = opts[idx]!; const sel = idx === cur
      slotLabels[s]!.text = o.label
      slotValues[s]!.text = valText(idx)
      slotBgs[s]!.alpha       = sel ? 1.0 : 0.70
      slotBgs[s]!.borderColor = sel ? 'rgba(220,180,80,0.90)' : 'rgba(220,180,80,0.20)'
      slotBgs[s]!.borderWidth = sel ? 2 : 1
      slotLabels[s]!.style    = sel ? 'sel'    : 'muted'
      slotValues[s]!.style    = sel ? 'selval' : 'value'
    }
    arrowUp.visible = scrollOff > 0
    arrowDn.visible = (scrollOff + VISIBLE) < TOTAL
  }

  function clamp () {
    if (cur < scrollOff) scrollOff = cur
    else if (cur >= scrollOff + VISIBLE) scrollOff = cur - VISIBLE + 1
  }

  // ── Save / Load ───────────────────────────────────────────────────────────
  function saveConfig (onDone?: () => void) {
    if (!configLoaded) { if (onDone) onDone(); return }
    const out = {
      config: {
        autolapse: C.autolapse, autopoop: C.autopoop, autoclose: C.autoclose,
        autoclose_delay: C.autoclose_delay, music: C.music,
        jb_behavior: C.jb_behavior, theme: C.theme,
        exploit: {
          core: C.exp_core, rtprio: 256, grooms: C.exp_grooms,
          races: C.exp_races, alias: 100, sds: 64, workers: 2,
          timeout_s: C.exp_timeout, log_to_usb: C.log_to_usb
        }
      },
      payloads: userPayloads
    }
    fs.write('config.json', JSON.stringify(out, null, 2), function (err) {
      if (err) log('Save error: ' + err.message)
      else     log('Config saved')
      if (onDone) onDone()
    })
  }

  function loadConfig () {
    fs.read('config.json', function (err: Error | null, data?: string) {
      if (err) { log('Read error: ' + err.message); configLoaded = true; return }
      try {
        const d = JSON.parse(data || '{}')
        if (d.config) {
          const cf = d.config
          C.autolapse       = cf.autolapse       || false
          C.autopoop        = cf.autopoop         || false
          C.autoclose       = cf.autoclose        || false
          C.autoclose_delay = cf.autoclose_delay  || 0
          C.music           = cf.music            !== false
          C.jb_behavior     = cf.jb_behavior      || 0
          C.theme           = (cf.theme && availableThemes.includes(cf.theme)) ? cf.theme : (availableThemes[0] || 'fallout')
          if (d.payloads && Array.isArray(d.payloads)) userPayloads = d.payloads.slice()
          if (cf.log_to_usb !== undefined) C.log_to_usb = cf.log_to_usb
          if (cf.exploit) {
            const ex = cf.exploit
            if (ex.core      !== undefined) C.exp_core    = ex.core
            if (ex.grooms    !== undefined) C.exp_grooms  = ex.grooms
            if (ex.races     !== undefined) C.exp_races   = ex.races
            if (ex.timeout_s !== undefined) C.exp_timeout = ex.timeout_s
            if (ex.log_to_usb !== undefined) C.log_to_usb = ex.log_to_usb
          }
          if (C.music) startBgmIfEnabled(); else stopBgm()
          configLoaded = true
          renderRows()
          log('Config loaded')
        }
      } catch (e) { log('Parse error: ' + (e as Error).message); configLoaded = true }
    })
  }

  // ── Press handler ─────────────────────────────────────────────────────────
  function onPress () {
    const o = opts[cur]; if (!o) return
    const k = o.key
    if (o.type === 'cycle') {
      if (k === 'jb_behavior') C.jb_behavior = (C.jb_behavior + 1) % jbLabels.length
      else if (k === 'theme') { const i = availableThemes.indexOf(C.theme); C.theme = availableThemes[(i + 1) % availableThemes.length]! }
      else if (k === 'exp_core')    C.exp_core = (C.exp_core + 1) % 6
      else if (k === 'exp_grooms')  { const v = [128,256,512,768,1024,1280]; C.exp_grooms  = v[(v.indexOf(C.exp_grooms)  + 1) % v.length]! }
      else if (k === 'exp_races')   { const v = [50,75,100,150,200,300];     C.exp_races   = v[(v.indexOf(C.exp_races)   + 1) % v.length]! }
      else if (k === 'exp_timeout') { const v = [5,8,10,15,20];             C.exp_timeout = v[(v.indexOf(C.exp_timeout) + 1) % v.length]! }
    } else {
      ;(C as any)[k] = !(C as any)[k]
      if (k === 'music') {
        if (typeof CONFIG !== 'undefined') CONFIG.music = C.music
        C.music ? startBgmIfEnabled() : stopBgm()
      }
      if (k === 'autolapse' && C.autolapse) C.autopoop = false
      if (k === 'autopoop'  && C.autopoop)  C.autolapse = false
    }
    renderRows(); saveConfig()
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey    = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (kc) {
    if (kc === 6 || kc === 5)      { cur = (cur + 1) % TOTAL;         playSound(SFX_CURSOR);  clamp(); renderRows() }
    else if (kc === 4 || kc === 7) { cur = (cur - 1 + TOTAL) % TOTAL; playSound(SFX_CURSOR);  clamp(); renderRows() }
    else if (kc === confirmKey)    { playSound(SFX_CONFIRM); onPress() }
    else if (kc === backKey)       { playSound(SFX_CANCEL);  saveConfig(function () { debugging.restart() }) }
  }

  renderRows()
  loadConfig()
  log('Fallout config UI loaded — ' + TOTAL + ' options, ' + VISIBLE + ' visible.')
})()
