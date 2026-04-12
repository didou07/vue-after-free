import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { fn, mem, BigInt } from 'download0/types'

if (typeof libc_addr === 'undefined') {
  include('userland.js')
}
if (typeof lang === 'undefined') {
  include('languages.js')
}

;(function () {
  log('Loading config UI...')

  const fs = {
    write: function (filename: string, content: string, callback: (error: Error | null) => void) {
      const xhr = new jsmaf.XMLHttpRequest()
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && callback)
          callback(xhr.status === 0 || xhr.status === 200 ? null : new Error('failed'))
      }
      xhr.open('POST', 'file://../download0/' + filename, true)
      xhr.send(content)
    },
    read: function (filename: string, callback: (error: Error | null, data?: string) => void) {
      const xhr = new jsmaf.XMLHttpRequest()
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && callback)
          callback(xhr.status === 0 || xhr.status === 200 ? null : new Error('failed'), xhr.responseText)
      }
      xhr.open('GET', 'file://../download0/' + filename, true)
      xhr.send()
    }
  }

  const currentConfig = {
    autolapse:       false,
    autopoop:        false,
    autoclose:       false,
    autoclose_delay: 0,
    music:           true,
    log_to_usb:      true,
    jb_behavior:     0,
    theme:           'default',
    exp_core:        4,
    exp_grooms:      512,
    exp_races:       100,
    exp_timeout:     8
  }

  let userPayloads: string[] = []
  let configLoaded = false

  const jbBehaviorLabels  = [lang.jbBehaviorAuto, lang.jbBehaviorNetctrl, lang.jbBehaviorLapse]

  function scanThemes (): string[] {
    const themes: string[] = []
    try {
      fn.register(0x05, 'open_sys',  ['bigint', 'bigint', 'bigint'], 'bigint')
      fn.register(0x06, 'close_sys', ['bigint'],                     'bigint')
      fn.register(0x110,'getdents',  ['bigint', 'bigint', 'bigint'], 'bigint')
      const dir  = '/download0/themes'
      const pa   = mem.malloc(256)
      const buf  = mem.malloc(4096)
      for (let i = 0; i < dir.length; i++) mem.view(pa).setUint8(i, dir.charCodeAt(i))
      mem.view(pa).setUint8(dir.length, 0)
      const fd = fn.open_sys(pa, new BigInt(0,0), new BigInt(0,0))
      if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
        const cnt = fn.getdents(fd, buf, new BigInt(0, 4096))
        if (!cnt.eq(new BigInt(0xffffffff, 0xffffffff)) && cnt.lo > 0) {
          let off = 0
          while (off < cnt.lo) {
            const rl = mem.view(buf.add(new BigInt(0, off+4))).getUint16(0, true)
            const dt = mem.view(buf.add(new BigInt(0, off+6))).getUint8(0)
            const nl = mem.view(buf.add(new BigInt(0, off+7))).getUint8(0)
            let name = ''
            for (let i = 0; i < nl; i++) name += String.fromCharCode(mem.view(buf.add(new BigInt(0, off+8+i))).getUint8(0))
            if (dt === 4 && name !== '.' && name !== '..') themes.push(name)
            off += rl
          }
        }
        fn.close_sys(fd)
      }
    } catch (e) { log('Theme scan failed: ' + (e as Error).message) }
    const idx = themes.indexOf('default')
    if (idx > 0) { themes.splice(idx,1); themes.unshift('default') }
    else if (idx < 0) themes.unshift('default')
    return themes
  }

  const availableThemes = scanThemes()
  const themeLabels = availableThemes.map((t: string) => t.charAt(0).toUpperCase() + t.slice(1))

  // ── Layout ────────────────────────────────────────────────────────────────
  //   Screen: 1920×1080, footer at y=1040
  //   Header area: 0..265
  //   Scroll area: 270..(270 + 8×90) = 270..990
  //   Arrows + divider: 990..1040
  const VISIBLE = 8
  const CX      = 960
  const BTN_W   = 840
  const BTN_H   = 74
  const BTN_L   = CX - BTN_W / 2
  const START_Y = 270
  const ROW_GAP = 90
  const VAL_X   = BTN_L + Math.floor(BTN_W * 0.56)

  const IMG_BTN = 'file:///../download0/img/NeonBtn.png'
  const IMG_BG  = 'file:///../download0/img/NeonBG.png'

  // ── SFX ───────────────────────────────────────────────────────────────────
  function playSound (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) } catch (_) {}
  }
  const SFX_CURSOR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_CONFIRM = 'file:///../download0/sfx/confirm.wav'
  const SFX_CANCEL  = 'file:///../download0/sfx/cancel.wav'

  jsmaf.root.children.length = 0

  // ── Styles ────────────────────────────────────────────────────────────────
  new Style({ name: 'white',  color: 'rgb(255,255,255)',        size: 24 })
  new Style({ name: 'cyan',   color: 'rgb(0,255,224)',          size: 24 })
  new Style({ name: 'muted',  color: 'rgba(255,255,255,0.40)',  size: 22 })
  new Style({ name: 'dim',    color: 'rgba(0,255,224,0.38)',    size: 20 })
  new Style({ name: 'subdim', color: 'rgba(0,255,224,0.28)',    size: 16 })
  new Style({ name: 'value',  color: 'rgb(0,255,224)',          size: 22 })
  new Style({ name: 'title',  color: 'rgb(0,255,224)',          size: 34 })
  new Style({ name: 'footer', color: 'rgba(0,255,224,0.28)',    size: 17 })
  new Style({ name: 'scroll', color: 'rgba(0,255,224,0.55)',    size: 22 })

  // ── Background ────────────────────────────────────────────────────────────
  jsmaf.root.children.push(new Image({ url: IMG_BG, x: 0, y: 0, width: 1920, height: 1080 }))

  // ── Logo ──────────────────────────────────────────────────────────────────
  jsmaf.root.children.push(new Image({ url: 'file:///../download0/img/logo.png', x: 68, y: 46, width: 200, height: 112 }))

  // ── Title ─────────────────────────────────────────────────────────────────
  const ttl = new jsmaf.Text(); ttl.text = 'SETTINGS'; ttl.x = CX - 88; ttl.y = 68; ttl.style = 'title'
  jsmaf.root.children.push(ttl)

  // ── Divider ───────────────────────────────────────────────────────────────
  const divTop = new Image({ url: IMG_BTN, x: BTN_L, y: 224, width: BTN_W, height: 1, alpha: 0.35 })
  divTop.borderColor = 'rgb(0,255,224)'; divTop.borderWidth = 0
  jsmaf.root.children.push(divTop)

  const hdrLbl = new jsmaf.Text(); hdrLbl.text = 'OPTION'; hdrLbl.x = BTN_L + 72; hdrLbl.y = 241; hdrLbl.style = 'subdim'
  const hdrVal = new jsmaf.Text(); hdrVal.text = 'VALUE';  hdrVal.x = VAL_X;      hdrVal.y = 241; hdrVal.style = 'subdim'
  jsmaf.root.children.push(hdrLbl); jsmaf.root.children.push(hdrVal)

  // ── Config options ────────────────────────────────────────────────────────
  const configOptions = [
    { key: 'autolapse',   label: lang.autoLapse,       type: 'toggle' },
    { key: 'autopoop',    label: lang.autoPoop,         type: 'toggle' },
    { key: 'autoclose',   label: lang.autoClose,        type: 'toggle' },
    { key: 'music',       label: lang.music,            type: 'toggle' },
    { key: 'log_to_usb',  label: 'Log to USB',          type: 'toggle' },
    { key: 'jb_behavior', label: lang.jbBehavior,       type: 'cycle'  },
    { key: 'theme',       label: lang.theme || 'Theme', type: 'cycle'  },
    { key: 'exp_core',    label: 'CPU Core (0-5)',      type: 'cycle'  },
    { key: 'exp_grooms',  label: 'Heap Grooms',         type: 'cycle'  },
    { key: 'exp_races',   label: 'Race Attempts',       type: 'cycle'  },
    { key: 'exp_timeout', label: 'Timeout (s)',         type: 'cycle'  },
  ]
  const TOTAL = configOptions.length

  // ── Build VISIBLE slot widgets (recycled on scroll) ───────────────────────
  const slotBgs:    Image[]        = []
  const slotBars:   Image[]        = []
  const slotNums:   jsmaf.Text[]   = []
  const slotLabels: jsmaf.Text[]   = []
  const slotValues: jsmaf.Text[]   = []

  for (let s = 0; s < VISIBLE; s++) {
    const bY = START_Y + s * ROW_GAP

    const rowBg = new Image({ url: IMG_BTN, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.08 })
    rowBg.borderColor = 'rgba(0,255,224,0.18)'; rowBg.borderWidth = 1
    jsmaf.root.children.push(rowBg); slotBgs.push(rowBg)

    const bar = new Image({ url: IMG_BTN, x: BTN_L, y: bY, width: 3, height: BTN_H, alpha: 0.28 })
    bar.borderColor = 'rgb(0,255,224)'; bar.borderWidth = 0
    jsmaf.root.children.push(bar); slotBars.push(bar)

    const num = new jsmaf.Text(); num.text = '--'; num.x = BTN_L + 18; num.y = bY + 25; num.style = 'dim'
    jsmaf.root.children.push(num); slotNums.push(num)

    const lbl = new jsmaf.Text(); lbl.text = ''; lbl.x = BTN_L + 72; lbl.y = bY + 25; lbl.style = 'muted'
    jsmaf.root.children.push(lbl); slotLabels.push(lbl)

    const val = new jsmaf.Text(); val.text = ''; val.x = VAL_X; val.y = bY + 25; val.style = 'value'
    jsmaf.root.children.push(val); slotValues.push(val)
  }

  // ── Scroll arrows ─────────────────────────────────────────────────────────
  const arrowUp = new jsmaf.Text()
  arrowUp.text = '▲'; arrowUp.x = CX - 12; arrowUp.y = 244; arrowUp.style = 'scroll'
  arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)

  const arrowDn = new jsmaf.Text()
  arrowDn.text = '▼'; arrowDn.x = CX - 12; arrowDn.y = START_Y + VISIBLE * ROW_GAP + 8; arrowDn.style = 'scroll'
  jsmaf.root.children.push(arrowDn)

  // ── Footer ────────────────────────────────────────────────────────────────
  const footBg = new Image({ url: IMG_BTN, x: 0, y: 1040, width: 1920, height: 40, alpha: 0.40 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)
  const footLine = new Image({ url: IMG_BTN, x: 0, y: 1040, width: 1920, height: 1, alpha: 0.35 })
  footLine.borderColor = 'rgb(0,255,224)'; footLine.borderWidth = 0
  jsmaf.root.children.push(footLine)

  const fKeys   = ['\u2191\u2193', 'X', 'O']
  const fLabels = ['  Navigate', '  Change Value', '  Back & Save']
  let fx = CX - 360
  for (let i = 0; i < 3; i++) {
    const k = new jsmaf.Text(); k.text = fKeys[i]!;   k.x = fx;    k.y = 1052; k.style = 'footer'
    const h = new jsmaf.Text(); h.text = fLabels[i]!; h.x = fx+24; h.y = 1052; h.style = 'footer'
    jsmaf.root.children.push(k); jsmaf.root.children.push(h)
    fx += 270
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let currentButton = 0
  let scrollOffset  = 0

  function getValueText (idx: number): string {
    const opt = configOptions[idx]!
    const key = opt.key
    if (opt.type === 'toggle')
      return (currentConfig as any)[key] ? '\u2714  ON' : '\u2718  OFF'
    if (key === 'jb_behavior') return jbBehaviorLabels[currentConfig.jb_behavior] || jbBehaviorLabels[0]!
    if (key === 'theme') {
      const ti = availableThemes.indexOf(currentConfig.theme)
      return themeLabels[ti >= 0 ? ti : 0]!
    }
    if (key === 'exp_core')    return 'Core ' + currentConfig.exp_core
    if (key === 'exp_grooms')  return '' + currentConfig.exp_grooms
    if (key === 'exp_races')   return '' + currentConfig.exp_races
    if (key === 'exp_timeout') return currentConfig.exp_timeout + 's'
    return ''
  }

  function renderRows () {
    for (let s = 0; s < VISIBLE; s++) {
      const optIdx = scrollOffset + s
      const visible = optIdx < TOTAL

      slotBgs[s]!.visible    = visible
      slotBars[s]!.visible   = visible
      slotNums[s]!.visible   = visible
      slotLabels[s]!.visible = visible
      slotValues[s]!.visible = visible

      if (!visible) continue

      const opt = configOptions[optIdx]!
      const cur = optIdx === currentButton

      slotNums[s]!.text   = String(optIdx + 1).padStart(2, '0')
      slotLabels[s]!.text = opt.label
      slotValues[s]!.text = getValueText(optIdx)

      slotBgs[s]!.alpha       = cur ? 0.20 : 0.08
      slotBgs[s]!.borderColor = cur ? 'rgba(0,255,224,0.72)' : 'rgba(0,255,224,0.18)'
      slotBgs[s]!.borderWidth = cur ? 2 : 1
      slotBars[s]!.alpha      = cur ? 1.0 : 0.28
      slotLabels[s]!.style    = cur ? 'white' : 'muted'
      slotValues[s]!.style    = cur ? 'cyan'  : 'value'
    }
    arrowUp.visible = scrollOffset > 0
    arrowDn.visible = (scrollOffset + VISIBLE) < TOTAL
  }

  function ensureVisible () {
    if (currentButton < scrollOffset)
      scrollOffset = currentButton
    else if (currentButton >= scrollOffset + VISIBLE)
      scrollOffset = currentButton - VISIBLE + 1
  }

  function saveConfig (onDone?: () => void) {
    if (!configLoaded) { if (onDone) onDone(); return }
    const out = {
      config: {
        autolapse:      currentConfig.autolapse,
        autopoop:       currentConfig.autopoop,
        autoclose:      currentConfig.autoclose,
        autoclose_delay:currentConfig.autoclose_delay,
        music:          currentConfig.music,
        jb_behavior:    currentConfig.jb_behavior,
        theme:          currentConfig.theme,
        exploit: {
          core:       currentConfig.exp_core,
          rtprio:     256,
          grooms:     currentConfig.exp_grooms,
          races:      currentConfig.exp_races,
          alias:      100,
          sds:        64,
          workers:    2,
          timeout_s:  currentConfig.exp_timeout,
          log_to_usb: currentConfig.log_to_usb
        }
      },
      payloads: userPayloads
    }
    fs.write('config.json', JSON.stringify(out, null, 2), function (err) {
      if (err) log('ERROR: Failed to save config: ' + err.message)
      else     log('Config saved')
      if (onDone) onDone()
    })
  }

  function loadConfig () {
    fs.read('config.json', function (err: Error | null, data?: string) {
      if (err) { log('ERROR: Cannot read config: ' + err.message); configLoaded = true; return }
      try {
        const d = JSON.parse(data || '{}')
        if (d.config) {
          const C = d.config
          currentConfig.autolapse       = C.autolapse       || false
          currentConfig.autopoop        = C.autopoop        || false
          currentConfig.autoclose       = C.autoclose       || false
          currentConfig.autoclose_delay = C.autoclose_delay || 0
          currentConfig.music           = C.music           !== false
          currentConfig.jb_behavior     = C.jb_behavior     || 0
          currentConfig.theme           = (C.theme && availableThemes.includes(C.theme)) ? C.theme : (availableThemes[0] || 'neon')
          if (d.payloads && Array.isArray(d.payloads)) userPayloads = d.payloads.slice()
          if (C.log_to_usb !== undefined) currentConfig.log_to_usb = C.log_to_usb
          if (C.exploit) {
            const ex = C.exploit
            if (ex.core      !== undefined) currentConfig.exp_core    = ex.core
            if (ex.grooms    !== undefined) currentConfig.exp_grooms  = ex.grooms
            if (ex.races     !== undefined) currentConfig.exp_races   = ex.races
            if (ex.timeout_s !== undefined) currentConfig.exp_timeout = ex.timeout_s
            if (ex.log_to_usb!== undefined) currentConfig.log_to_usb = ex.log_to_usb
          }
          configLoaded = true
          renderRows()
          log('Config loaded')
        }
      } catch (e) {
        log('ERROR parse: ' + (e as Error).message)
        configLoaded = true
      }
    })
  }

  function handlePress () {
    const opt = configOptions[currentButton]
    if (!opt) return
    const key = opt.key
    if (opt.type === 'cycle') {
      if (key === 'jb_behavior') {
        currentConfig.jb_behavior = (currentConfig.jb_behavior + 1) % jbBehaviorLabels.length
      } else if (key === 'theme') {
        const ti = availableThemes.indexOf(currentConfig.theme)
        currentConfig.theme = availableThemes[(ti + 1) % availableThemes.length]!
      } else if (key === 'exp_core') {
        currentConfig.exp_core = (currentConfig.exp_core + 1) % 6
      } else if (key === 'exp_grooms') {
        const v = [128,256,512,768,1024,1280]; const i = v.indexOf(currentConfig.exp_grooms)
        currentConfig.exp_grooms = v[(i+1)%v.length]!
      } else if (key === 'exp_races') {
        const v = [50,75,100,150,200,300]; const i = v.indexOf(currentConfig.exp_races)
        currentConfig.exp_races = v[(i+1)%v.length]!
      } else if (key === 'exp_timeout') {
        const v = [5,8,10,15,20]; const i = v.indexOf(currentConfig.exp_timeout)
        currentConfig.exp_timeout = v[(i+1)%v.length]!
      }
    } else {
      const bk = key as any
      ;(currentConfig as any)[bk] = !(currentConfig as any)[bk]
      if (key === 'music') {
        if (typeof CONFIG !== 'undefined') CONFIG.music = currentConfig.music
        currentConfig.music ? startBgmIfEnabled() : stopBgm()
      }
      if (key === 'autolapse' && currentConfig.autolapse) currentConfig.autopoop = false
      if (key === 'autopoop'  && currentConfig.autopoop)  currentConfig.autolapse = false
    }
    log(key + ' = ' + getValueText(currentButton))
    renderRows()
    saveConfig()
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey    = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (keyCode) {
    if (keyCode === 6 || keyCode === 5) {
      currentButton = (currentButton + 1) % TOTAL
      playSound(SFX_CURSOR); ensureVisible(); renderRows()
    } else if (keyCode === 4 || keyCode === 7) {
      currentButton = (currentButton - 1 + TOTAL) % TOTAL
      playSound(SFX_CURSOR); ensureVisible(); renderRows()
    } else if (keyCode === confirmKey) {
      playSound(SFX_CONFIRM); handlePress()
    } else if (keyCode === backKey) {
      playSound(SFX_CANCEL)
      saveConfig(function () { debugging.restart() })
    }
  }

  renderRows()
  loadConfig()
  log('Config UI loaded. ' + TOTAL + ' options, ' + VISIBLE + ' visible at a time.')
})()
