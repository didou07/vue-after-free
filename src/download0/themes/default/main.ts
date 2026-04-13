import { lang, useImageText, textImageBase } from 'download0/languages'
import { libc_addr } from 'download0/userland'

;(function () {
  include('languages.js')
  log('Loading main menu...')

  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()

  // ── Constants ─────────────────────────────────────────────────────────────
  const CX       = 960
  const BTN_W    = 560
  const BTN_H    = 84
  const BTN_L    = CX - BTN_W / 2
  const START_Y  = 390
  const GAP      = 112
  const BG_URL   = 'file:///../download0/img/multiview_bg_VAF.png'
  const BTN_URL  = 'file:///../download0/img/NeonBtn.png'
  const SFX_CUR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_OK   = 'file:///../download0/sfx/confirm.wav'
  const SFX_BACK = 'file:///../download0/sfx/cancel.wav'

  function sfx (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) } catch (_e) { /* no audio */ }
  }

  // ── Scene ─────────────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  new Style({ name: 'label',  color: 'rgb(255,255,255)',        size: 26 })
  new Style({ name: 'sel',    color: 'rgb(255,255,255)',        size: 26 })
  new Style({ name: 'num',    color: 'rgba(255,255,255,0.30)',  size: 17 })
  new Style({ name: 'numsel', color: 'rgba(120,210,255,0.90)', size: 17 })
  new Style({ name: 'footer', color: 'rgba(255,255,255,0.30)', size: 16 })
  new Style({ name: 'exit',   color: 'rgb(255,100,100)',        size: 26 })
  new Style({ name: 'exitd',  color: 'rgba(255,100,100,0.45)', size: 26 })

  // Background
  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: 1920, height: 1080 }))

  // Logo — centered, above buttons
  jsmaf.root.children.push(new Image({
    url: 'file:///../download0/img/logo.png',
    x: CX - 180, y: 60, width: 360, height: 204
  }))

  // Thin divider below logo
  const div = new Image({ url: BTN_URL, x: BTN_L - 40, y: 298, width: BTN_W + 80, height: 1, alpha: 0.25 })
  div.borderColor = 'rgba(255,255,255,0.4)'; div.borderWidth = 0
  jsmaf.root.children.push(div)

  // ── Menu options ──────────────────────────────────────────────────────────
  const menuOptions = [
    { label: lang.jailbreak,   script: 'loader.js',       imgKey: 'jailbreak',   num: '01' },
    { label: lang.payloadMenu, script: 'payload_host.js', imgKey: 'payloadMenu', num: '02' },
    { label: lang.config,      script: 'config_ui.js',    imgKey: 'config',      num: '03' },
  ]

  const btns:  Image[]                = []
  const bars:  Image[]                = []
  const texts: (Image | jsmaf.Text)[] = []
  const nums:  jsmaf.Text[]           = []
  const origB: { x: number; y: number }[] = []
  const origT: { x: number; y: number }[] = []

  for (let i = 0; i < menuOptions.length; i++) {
    const o  = menuOptions[i]!
    const bY = START_Y + i * GAP

    // Button bg
    const btn = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.10 })
    btn.borderColor = 'rgba(255,255,255,0.15)'; btn.borderWidth = 1
    btns.push(btn); jsmaf.root.children.push(btn)

    // Left accent bar
    const bar = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: 4, height: BTN_H, alpha: 0.30 })
    bar.borderColor = 'rgb(120,200,255)'; bar.borderWidth = 0
    bars.push(bar); jsmaf.root.children.push(bar)

    // Row number
    const num = new jsmaf.Text(); num.text = o.num
    num.x = BTN_L + 14; num.y = bY + 32; num.style = 'num'
    nums.push(num); jsmaf.root.children.push(num)

    // Label
    let txt: Image | jsmaf.Text
    if (useImageText) {
      txt = new Image({ url: textImageBase + o.imgKey + '.png', x: BTN_L + 56, y: bY + 16, width: 280, height: 52 })
    } else {
      const t = new jsmaf.Text(); t.text = o.label.toUpperCase()
      t.x = BTN_L + 56; t.y = bY + 29; t.style = 'label'
      txt = t
    }
    texts.push(txt); jsmaf.root.children.push(txt)

    // Arrow
    const arr = new jsmaf.Text(); arr.text = '›'
    arr.x = BTN_L + BTN_W - 38; arr.y = bY + 27; arr.style = 'num'
    jsmaf.root.children.push(arr)

    origB.push({ x: BTN_L, y: bY })
    origT.push({ x: txt.x, y: txt.y })
  }

  // ── Exit button ───────────────────────────────────────────────────────────
  const exitY = START_Y + menuOptions.length * GAP + 20
  const exitBtn = new Image({ url: BTN_URL, x: BTN_L, y: exitY, width: BTN_W, height: BTN_H, alpha: 0.08 })
  exitBtn.borderColor = 'rgba(255,90,90,0.18)'; exitBtn.borderWidth = 1
  btns.push(exitBtn); jsmaf.root.children.push(exitBtn)

  const exitBar = new Image({ url: BTN_URL, x: BTN_L, y: exitY, width: 4, height: BTN_H, alpha: 0.30 })
  exitBar.borderColor = 'rgb(255,100,100)'; exitBar.borderWidth = 0
  bars.push(exitBar); jsmaf.root.children.push(exitBar)

  const exitNum = new jsmaf.Text(); exitNum.text = '04'
  exitNum.x = BTN_L + 14; exitNum.y = exitY + 32; exitNum.style = 'num'
  nums.push(exitNum); jsmaf.root.children.push(exitNum)

  let exitTxt: Image | jsmaf.Text
  if (useImageText) {
    exitTxt = new Image({ url: textImageBase + 'exit.png', x: BTN_L + 56, y: exitY + 16, width: 220, height: 52 })
  } else {
    const t = new jsmaf.Text(); t.text = lang.exit.toUpperCase()
    t.x = BTN_L + 56; t.y = exitY + 29; t.style = 'exitd'
    exitTxt = t
  }
  texts.push(exitTxt); jsmaf.root.children.push(exitTxt)
  origB.push({ x: BTN_L, y: exitY })
  origT.push({ x: exitTxt.x, y: exitTxt.y })

  // ── Footer ────────────────────────────────────────────────────────────────
  const footBg = new Image({ url: BTN_URL, x: 0, y: 1046, width: 1920, height: 34, alpha: 0.35 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)
  const fh = new jsmaf.Text()
  fh.text = '↑↓  Navigate    X  Select    O  Back'
  fh.x = CX - 200; fh.y = 1055; fh.style = 'footer'
  jsmaf.root.children.push(fh)

  // ── Highlight ─────────────────────────────────────────────────────────────
  let cur = 0; let prev = -1

  function highlight () {
    const TOTAL = btns.length
    for (let i = 0; i < TOTAL; i++) {
      const isExit = i === TOTAL - 1
      const sel    = i === cur
      const b = btns[i]!; const bar = bars[i]!
      const t = texts[i]!; const n = nums[i]!

      b.alpha       = sel ? 0.24 : 0.10
      b.borderColor = sel ? (isExit ? 'rgba(255,90,90,0.70)' : 'rgba(120,200,255,0.70)') : (isExit ? 'rgba(255,90,90,0.18)' : 'rgba(255,255,255,0.15)')
      b.borderWidth = sel ? 2 : 1
      bar.alpha     = sel ? 1.0 : 0.30

      if ('style' in t) (t as jsmaf.Text).style = sel ? (isExit ? 'exit' : 'sel') : (isExit ? 'exitd' : 'label')
      n.style = sel ? 'numsel' : 'num'

      // Subtle scale on selected
      if (i !== prev || sel) {
        const sc = sel ? 1.04 : 1.0
        const dX = sel ? -(BTN_W * 0.04) / 2 : 0
        const dY = sel ? -(BTN_H * 0.04) / 2 : 0
        b.scaleX = sc; b.scaleY = sc
        b.x = origB[i]!.x + dX; b.y = origB[i]!.y + dY
        if ('scaleX' in t) { (t as jsmaf.Text).scaleX = sc; (t as jsmaf.Text).scaleY = sc }
        if ('x' in t) (t as jsmaf.Text).x = origT[i]!.x + dX
      }
    }
    prev = cur
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const TOTAL = btns.length
  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14

  jsmaf.onKeyDown = function (kc: number) {
    if (kc === 6 || kc === 5)      { cur = (cur + 1) % TOTAL;         sfx(SFX_CUR);  highlight() }
    else if (kc === 4 || kc === 7) { cur = (cur - 1 + TOTAL) % TOTAL; sfx(SFX_CUR);  highlight() }
    else if (kc === confirmKey) {
      sfx(SFX_OK)
      if (cur === TOTAL - 1) {
        try { include('includes/kill_vue.js') } catch (_e) { /* ignore */ }
      } else {
        const o = menuOptions[cur]; if (!o) return
        if (o.script === 'loader.js') jsmaf.onKeyDown = function () {}
        try {
          if (o.script === 'loader.js') include(o.script)
          else include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'default') + '/' + o.script)
        } catch (e) { log('Error: ' + (e as Error).message) }
      }
    }
  }
  // O/back: go back to same screen (no-op on main)
  highlight()
  log('Main menu loaded.')
  ;((_a, _b) => {})(libc_addr, SFX_BACK) // suppress unused import warnings
})()
