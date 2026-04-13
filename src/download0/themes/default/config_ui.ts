import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { fn, mem, BigInt } from 'download0/types'

if (typeof libc_addr === 'undefined') include('userland.js')
if (typeof lang === 'undefined') include('languages.js')

;(function () {
  log('Loading config UI...')

  // ── Config state ──────────────────────────────────────────────────────────
  interface Cfg {
    autolapse: boolean; autopoop: boolean; autoclose: boolean
    autoclose_delay: number; music: boolean; jb_behavior: number; theme: string
    exp_core: number; exp_grooms: number; exp_races: number; exp_timeout: number
  }
  const C: Cfg = {
    autolapse: false, autopoop: false, autoclose: false, autoclose_delay: 0,
    music: true, jb_behavior: 0, theme: 'default',
    exp_core: 4, exp_grooms: 512, exp_races: 100, exp_timeout: 8
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
      try { fn.register(0x05,  'dcfg_open',     ['bigint','bigint','bigint'], 'bigint') } catch (_e) { /* registered */ }
      try { fn.register(0x06,  'dcfg_close',    ['bigint'],                   'bigint') } catch (_e) { /* registered */ }
      try { fn.register(0x110, 'dcfg_getdents', ['bigint','bigint','bigint'], 'bigint') } catch (_e) { /* registered */ }
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

  // ── Options ───────────────────────────────────────────────────────────────
  const opts = [
    { key: 'autolapse',   label: lang.autoLapse,       imgKey: 'autoLapse',  type: 'toggle' },
    { key: 'autopoop',    label: lang.autoPoop,         imgKey: 'autoPoop',   type: 'toggle' },
    { key: 'autoclose',   label: lang.autoClose,        imgKey: 'autoClose',  type: 'toggle' },
    { key: 'music',       label: lang.music,            imgKey: 'music',      type: 'toggle' },
    { key: 'jb_behavior', label: lang.jbBehavior,       imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'theme',       label: lang.theme || 'Theme', imgKey: 'theme',      type: 'cycle'  },
    { key: 'exp_core',    label: 'CPU Core (0-5)',      imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_grooms',  label: 'Heap Grooms',         imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_races',   label: 'Race Attempts',       imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_timeout', label: 'Timeout (s)',         imgKey: 'jbBehavior', type: 'cycle'  },
  ]
  const TOTAL = opts.length

  // ── Layout ────────────────────────────────────────────────────────────────
  // 10 options × 106px = 1060px  →  need scroll.  VISIBLE=8 × 106 = 848 → 192..1040 ✓
  const VISIBLE = 8
  const CX      = 960
  const BTN_W   = 560
  const BTN_H   = 72
  const BTN_L   = CX - BTN_W / 2
  const GAP     = 102
  const START_Y = 196
  const VAL_X   = BTN_L + Math.floor(BTN_W * 0.56)
  const BTN_URL = 'file:///../download0/img/NeonBtn.png'
  const BG_URL  = 'file:///../download0/img/multiview_bg_VAF.png'
  const SFX_CUR = 'file:///../download0/sfx/cursor.wav'
  const SFX_OK  = 'file:///../download0/sfx/confirm.wav'
  const SFX_BCK = 'file:///../download0/sfx/cancel.wav'

  function sfx (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const cl = new jsmaf.AudioClip(); cl.volume = 1.0; cl.open(url) } catch (_e) { /* no audio */ }
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  new Style({ name: 'white',  color: 'rgb(255,255,255)',        size: 21 })
  new Style({ name: 'title',  color: 'rgb(255,255,255)',        size: 28 })
  new Style({ name: 'muted',  color: 'rgba(255,255,255,0.48)',  size: 19 })
  new Style({ name: 'dim',    color: 'rgba(255,255,255,0.26)',  size: 16 })
  new Style({ name: 'val',    color: 'rgb(120,210,255)',        size: 19 })
  new Style({ name: 'selval', color: 'rgb(80,230,255)',         size: 19 })
  new Style({ name: 'scroll', color: 'rgba(120,200,255,0.65)', size: 17 })
  new Style({ name: 'footer', color: 'rgba(255,255,255,0.28)', size: 15 })

  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: 1920, height: 1080 }))
  jsmaf.root.children.push(new Image({ url: 'file:///../download0/img/logo.png', x: 1630, y: 12, width: 270, height: 152 }))

  if (useImageText) {
    jsmaf.root.children.push(new Image({ url: textImageBase + 'config.png', x: CX - 100, y: 70, width: 200, height: 56 }))
  } else {
    const ttl = new jsmaf.Text(); ttl.text = lang.config || 'SETTINGS'; ttl.x = CX - 68; ttl.y = 82; ttl.style = 'title'
    jsmaf.root.children.push(ttl)
  }
  const divL = new Image({ url: BTN_URL, x: BTN_L - 20, y: 160, width: BTN_W + 40, height: 1, alpha: 0.28 })
  divL.borderColor = 'rgba(255,255,255,0.4)'; divL.borderWidth = 0
  jsmaf.root.children.push(divL)

  // Column headers
  const hL = new jsmaf.Text(); hL.text = 'OPTION'; hL.x = BTN_L + 14; hL.y = 167; hL.style = 'dim'
  const hV = new jsmaf.Text(); hV.text = 'VALUE';  hV.x = VAL_X;       hV.y = 167; hV.style = 'dim'
  jsmaf.root.children.push(hL); jsmaf.root.children.push(hV)

  // ── Slot widgets ──────────────────────────────────────────────────────────
  const slotBgs:    Image[]                = []
  const slotBars:   Image[]                = []
  const slotLabels: (Image | jsmaf.Text)[] = []
  const slotValues: jsmaf.Text[]           = []

  for (let s = 0; s < VISIBLE; s++) {
    const bY = START_Y + s * GAP

    const bg = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.10 })
    bg.borderColor = 'rgba(255,255,255,0.14)'; bg.borderWidth = 1
    slotBgs.push(bg); jsmaf.root.children.push(bg)

    const bar = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: 3, height: BTN_H, alpha: 0.28 })
    bar.borderColor = 'rgb(120,200,255)'; bar.borderWidth = 0
    slotBars.push(bar); jsmaf.root.children.push(bar)

    let lbl: Image | jsmaf.Text
    if (useImageText) {
      lbl = new Image({ url: '', x: BTN_L + 16, y: bY + 11, width: 200, height: 44 })
    } else {
      const t = new jsmaf.Text(); t.text = ''; t.x = BTN_L + 14; t.y = bY + 26; t.style = 'muted'
      lbl = t
    }
    slotLabels.push(lbl); jsmaf.root.children.push(lbl)

    const vt = new jsmaf.Text(); vt.text = ''; vt.x = VAL_X; vt.y = bY + 26; vt.style = 'val'
    slotValues.push(vt); jsmaf.root.children.push(vt)
  }

  // Scroll arrows
  const arrowUp = new jsmaf.Text(); arrowUp.text = '▲'
  arrowUp.x = CX - 9; arrowUp.y = 162; arrowUp.style = 'scroll'; arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)
  const arrowDn = new jsmaf.Text(); arrowDn.text = '▼'
  arrowDn.x = CX - 9; arrowDn.y = START_Y + VISIBLE * GAP + 4; arrowDn.style = 'scroll'
  jsmaf.root.children.push(arrowDn)

  // Footer
  const footBg = new Image({ url: BTN_URL, x: 0, y: 1046, width: 1920, height: 34, alpha: 0.35 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)
  if (useImageText) {
    jsmaf.root.children.push(new Image({ url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack' : 'oToGoBack') + '.png', x: CX - 75, y: 1052, width: 150, height: 32 }))
  } else {
    const fh = new jsmaf.Text()
    fh.text = '↑↓  Navigate    X  Change    ' + (jsmaf.circleIsAdvanceButton ? 'Square' : 'O') + '  Save & Back'
    fh.x = CX - 230; fh.y = 1055; fh.style = 'footer'
    jsmaf.root.children.push(fh)
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let cur = 0; let scrollOff = 0

  function getVal (idx: number): string {
    const o = opts[idx]!; const k = o.key as keyof Cfg
    if (o.type === 'toggle') return C[k] ? '✔  ON' : '✘  OFF'
    if (k === 'jb_behavior') return jbLabels[C.jb_behavior] || jbLabels[0]!
    if (k === 'theme') { const ti = availableThemes.indexOf(C.theme); return themeLabels[ti >= 0 ? ti : 0]! }
    if (k === 'exp_core')    return 'Core ' + C.exp_core
    if (k === 'exp_grooms')  return '' + C.exp_grooms
    if (k === 'exp_races')   return '' + C.exp_races
    if (k === 'exp_timeout') return C.exp_timeout + 's'
    return ''
  }

  function renderRows () {
    for (let s = 0; s < VISIBLE; s++) {
      const idx = scrollOff + s; const vis = idx < TOTAL
      slotBgs[s]!.visible = slotBars[s]!.visible = slotLabels[s]!.visible = slotValues[s]!.visible = vis
      if (!vis) continue
      const o = opts[idx]!; const sel = idx === cur
      slotBgs[s]!.alpha       = sel ? 0.22 : 0.10
      slotBgs[s]!.borderColor = sel ? 'rgba(120,200,255,0.76)' : 'rgba(255,255,255,0.14)'
      slotBgs[s]!.borderWidth = sel ? 2 : 1
      slotBars[s]!.alpha      = sel ? 1.0 : 0.28
      if (useImageText) { (slotLabels[s] as Image).url = textImageBase + o.imgKey + '.png' }
      else { (slotLabels[s] as jsmaf.Text).text = o.label; (slotLabels[s] as jsmaf.Text).style = sel ? 'white' : 'muted' }
      slotValues[s]!.text  = getVal(idx)
      slotValues[s]!.style = sel ? 'selval' : 'val'
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
        autolapse: C.autolapse, autopoop: C.autopoop, autoclose: C.autoclose,
        autoclose_delay: C.autoclose_delay, music: C.music,
        jb_behavior: C.jb_behavior, theme: C.theme,
        exploit: { core: C.exp_core, rtprio: 256, grooms: C.exp_grooms, races: C.exp_races, alias: 100, sds: 64, workers: 2, timeout_s: C.exp_timeout }
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
      if (err) { log('Load error: ' + err.message); configLoaded = true; return }
      try {
        const d = JSON.parse(data || '{}')
        if (d.config) {
          const G = d.config
          C.autolapse       = G.autolapse       || false
          C.autopoop        = G.autopoop        || false
          C.autoclose       = G.autoclose       || false
          C.autoclose_delay = G.autoclose_delay || 0
          C.music           = G.music           !== false
          C.jb_behavior     = G.jb_behavior     || 0
          C.theme = (G.theme && availableThemes.includes(G.theme)) ? G.theme : 'default'
          if (d.payloads && Array.isArray(d.payloads)) userPayloads = d.payloads.slice()
          if (G.exploit) {
            const ex = G.exploit
            if (ex.core      !== undefined) C.exp_core    = ex.core
            if (ex.grooms    !== undefined) C.exp_grooms  = ex.grooms
            if (ex.races     !== undefined) C.exp_races   = ex.races
            if (ex.timeout_s !== undefined) C.exp_timeout = ex.timeout_s
          }
          configLoaded = true; renderRows()
          if (C.music) startBgmIfEnabled(); else stopBgm()
          log('Config loaded')
        }
      } catch (e) { log('Parse error: ' + (e as Error).message); configLoaded = true }
    })
  }

  // ── Press ─────────────────────────────────────────────────────────────────
  function onPress () {
    const o = opts[cur]; if (!o) return
    const k = o.key as keyof Cfg
    if (o.type === 'cycle') {
      if (k === 'jb_behavior') { C.jb_behavior = (C.jb_behavior + 1) % jbLabels.length }
      else if (k === 'theme') { const ti = availableThemes.indexOf(C.theme); C.theme = availableThemes[(ti + 1) % availableThemes.length]! }
      else if (k === 'exp_core')    { C.exp_core = (C.exp_core + 1) % 6 }
      else if (k === 'exp_grooms')  { const v = [128,256,512,768,1024,1280]; const i = v.indexOf(C.exp_grooms);  C.exp_grooms  = v[(i+1)%v.length]! }
      else if (k === 'exp_races')   { const v = [50,75,100,150,200,300];     const i = v.indexOf(C.exp_races);   C.exp_races   = v[(i+1)%v.length]! }
      else if (k === 'exp_timeout') { const v = [5,8,10,15,20];              const i = v.indexOf(C.exp_timeout); C.exp_timeout = v[(i+1)%v.length]! }
    } else {
      if (k === 'autolapse' || k === 'autopoop' || k === 'autoclose' || k === 'music') {
        C[k] = !C[k]
        if (k === 'music') {
          if (typeof CONFIG !== 'undefined') CONFIG.music = C.music
          C.music ? startBgmIfEnabled() : stopBgm()
        }
        if (k === 'autolapse' && C.autolapse) C.autopoop = false
        if (k === 'autopoop'  && C.autopoop)  C.autolapse = false
      }
    }
    renderRows(); saveConfig()
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey    = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (kc: number) {
    if (kc === 6 || kc === 5)      { cur = (cur + 1) % TOTAL;         sfx(SFX_CUR); clamp(); renderRows() }
    else if (kc === 4 || kc === 7) { cur = (cur - 1 + TOTAL) % TOTAL; sfx(SFX_CUR); clamp(); renderRows() }
    else if (kc === confirmKey)    { sfx(SFX_OK);  onPress() }
    else if (kc === backKey)       { sfx(SFX_BCK); saveConfig(function () { debugging.restart() }) }
  }

  renderRows(); loadConfig()
  log('Config UI loaded — ' + TOTAL + ' options, ' + VISIBLE + ' visible.')
})()
