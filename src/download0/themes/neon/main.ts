import { lang, useImageText, textImageBase } from 'download0/languages'
import { libc_addr } from 'download0/userland'

;(function () {
  include('languages.js')
  log('Loading neon main menu...')

  // ── Palette ───────────────────────────────────────────────────────────────
  const C_CYAN   = 'rgb(0,255,224)'
  const C_DIM    = 'rgba(0,255,224,0.32)'
  const C_WHITE  = 'rgb(255,255,255)'
  const C_MUTED  = 'rgba(255,255,255,0.30)'
  const C_PURPLE = 'rgba(255,50,50,0.85)'
  const C_FOOTER = 'rgba(0,255,224,0.28)'

  // ── SFX ───────────────────────────────────────────────────────────────────
  const SFX_CURSOR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_CONFIRM = 'file:///../download0/sfx/confirm.wav'
  const SFX_CANCEL  = 'file:///../download0/sfx/cancel.wav'
  function playSound(url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) }
    catch(e) { log('SFX: ' + (e as Error).message) }
  }

  // ── Reset Scene ───────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  // ── Styles ────────────────────────────────────────────────────────────────
  new Style({ name: 'white',  color: C_WHITE,  size: 32 })
  new Style({ name: 'cyan',   color: C_CYAN,   size: 32 })
  new Style({ name: 'muted',  color: C_MUTED,  size: 30 })
  new Style({ name: 'dim',    color: C_DIM,    size: 20 })
  new Style({ name: 'purple', color: C_PURPLE, size: 28 })
  new Style({ name: 'footer',  color: C_FOOTER,          size: 18 })
  new Style({ name: 'exitdim', color: 'rgba(255,80,80,0.35)', size: 20 })
  new Style({ name: 'red',     color: 'rgb(255,80,80)',       size: 32 })

  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()

  // ── Background ────────────────────────────────────────────────────────────
  const BG  = 'file:///../download0/img/NeonBG.png'
  const BTN = 'file:///../download0/img/NeonBtn.png'

  const bg = new Image({ url: BG, x: 0, y: 0, width: 1920, height: 1080 })
  jsmaf.root.children.push(bg)

  // ── Corner brackets (top-left) ────────────────────────────────────────────
  const mkCorner = (x: number, y: number, w: number, h: number) => {
    const r = new Image({ url: BTN, x, y, width: w, height: h, alpha: 0.6 })
    r.borderColor = C_CYAN; r.borderWidth = 0
    jsmaf.root.children.push(r)
  }
  mkCorner(52, 24, 48, 2);  mkCorner(52, 24, 2, 48)   // TL
  mkCorner(1820, 24, 48, 2); mkCorner(1866, 24, 2, 48) // TR
  mkCorner(52, 1004, 48, 2); mkCorner(52, 956, 2, 48)  // BL
  mkCorner(1820, 1004, 48, 2); mkCorner(1866, 956, 2, 48) // BR

  // ── Layout ────────────────────────────────────────────────────────────────
  const CX      = 960
  const BTN_W   = 680
  const BTN_H   = 110
  const BTN_L   = CX - BTN_W / 2
  const START_Y = 390
  const GAP     = 130   // equal spacing between all buttons

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logo = new Image({ url: 'file:///../download0/img/logo.png', x: CX - 170, y: 80, width: 340, height: 192 })
  jsmaf.root.children.push(logo)

  // ── Subtitle ──────────────────────────────────────────────────────────────
  const sub = new jsmaf.Text()
  sub.text = 'PS4  JAILBREAK  SYSTEM'; sub.x = CX - 175; sub.y = 286; sub.style = 'dim'
  jsmaf.root.children.push(sub)

  // ── Divider ───────────────────────────────────────────────────────────────
  const div = new Image({ url: BTN, x: BTN_L, y: 334, width: BTN_W, height: 1, alpha: 0.5 })
  div.borderColor = C_CYAN; div.borderWidth = 0
  jsmaf.root.children.push(div)

  // ── Menu Buttons ─────────────────────────────────────────────────────────
  const menuOptions = [
    { label: lang.jailbreak,   script: 'loader.js',       imgKey: 'jailbreak',   num: '01' },
    { label: lang.payloadMenu, script: 'payload_host.js', imgKey: 'payloadMenu', num: '02' },
    { label: lang.config,      script: 'config_ui.js',    imgKey: 'config',      num: '03' },
  ]

  const buttons:     Image[]                 = []
  const buttonTexts: (Image | jsmaf.Text)[]  = []
  const barsLeft:    Image[]                 = []
  const buttonOrigPos: { x: number; y: number }[] = []
  const textOrigPos:   { x: number; y: number }[] = []

  for (let i = 0; i < menuOptions.length; i++) {
    const opt  = menuOptions[i]!
    const bX   = BTN_L
    const bY   = START_Y + i * GAP

    // Button background
    const btn = new Image({ url: BTN, x: bX, y: bY, width: BTN_W, height: BTN_H, alpha: 0.08 })
    btn.borderColor = 'rgba(0,255,224,0.20)'; btn.borderWidth = 1
    buttons.push(btn); jsmaf.root.children.push(btn)

    // Left accent bar (3px)
    const bar = new Image({ url: BTN, x: bX, y: bY, width: 3, height: BTN_H, alpha: 0.30 })
    bar.borderColor = C_CYAN; bar.borderWidth = 0
    barsLeft.push(bar); jsmaf.root.children.push(bar)

    // Number
    const num = new jsmaf.Text()
    num.text = opt.num; num.x = bX + 30; num.y = bY + 34; num.style = 'dim'
    jsmaf.root.children.push(num)

    // Label
    let btnText: Image | jsmaf.Text
    if (typeof useImageText !== 'undefined' && useImageText) {
      btnText = new Image({ url: textImageBase + opt.imgKey + '.png', x: bX + 90, y: bY + 20, width: 320, height: 68 })
    } else {
      const t = new jsmaf.Text()
      t.text = opt.label.toUpperCase(); t.x = bX + 90; t.y = bY + 34; t.style = 'muted'
      btnText = t
    }
    buttonTexts.push(btnText); jsmaf.root.children.push(btnText)

    // Arrow
    const arr = new jsmaf.Text()
    arr.text = '>'; arr.x = bX + BTN_W - 55; arr.y = bY + 34; arr.style = 'dim'
    jsmaf.root.children.push(arr)

    buttonOrigPos.push({ x: bX, y: bY })
    textOrigPos.push({ x: btnText.x, y: btnText.y })
  }

  // ── Exit Button (equal spacing below last menu btn) ───────────────────────
  const exitY = START_Y + menuOptions.length * GAP
  const exitBtn = new Image({ url: BTN, x: BTN_L, y: exitY, width: BTN_W, height: BTN_H, alpha: 0.08 })
  exitBtn.borderColor = 'rgba(255,50,50,0.22)'; exitBtn.borderWidth = 1
  buttons.push(exitBtn); jsmaf.root.children.push(exitBtn)

  const exitBar = new Image({ url: BTN, x: BTN_L, y: exitY, width: 3, height: BTN_H, alpha: 0.35 })
  exitBar.borderColor = C_PURPLE; exitBar.borderWidth = 0
  barsLeft.push(exitBar); jsmaf.root.children.push(exitBar)

  // Exit number label
  const exitNum = new jsmaf.Text()
  exitNum.text = '04'; exitNum.x = BTN_L + 30; exitNum.y = exitY + 34; exitNum.style = 'exitdim'
  jsmaf.root.children.push(exitNum)

  let exitText: Image | jsmaf.Text
  if (typeof useImageText !== 'undefined' && useImageText) {
    exitText = new Image({ url: textImageBase + 'exit.png', x: BTN_L + 90, y: exitY + 20, width: 220, height: 68 })
  } else {
    const t = new jsmaf.Text()
    t.text = lang.exit.toUpperCase(); t.x = BTN_L + 90; t.y = exitY + 34; t.style = 'red'
    exitText = t
  }
  buttonTexts.push(exitText); jsmaf.root.children.push(exitText)
  buttonOrigPos.push({ x: BTN_L, y: exitY })
  textOrigPos.push({ x: exitText.x, y: exitText.y })

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerBg = new Image({ url: BTN, x: 0, y: 1040, width: 1920, height: 40, alpha: 0.40 })
  footerBg.borderColor = 'transparent'; footerBg.borderWidth = 0
  jsmaf.root.children.push(footerBg)

  const footerLine = new Image({ url: BTN, x: 0, y: 1040, width: 1920, height: 1, alpha: 0.35 })
  footerLine.borderColor = C_CYAN; footerLine.borderWidth = 0
  jsmaf.root.children.push(footerLine)

  const fKeys   = ['\u2191\u2193', 'X', 'O']
  const fLabels = ['  Navigate', '  Select', '  Back']
  let fx = CX - 300
  for (let i = 0; i < 3; i++) {
    const k = new jsmaf.Text(); k.text = fKeys[i]!;   k.x = fx;    k.y = 1052; k.style = 'footer'
    const h = new jsmaf.Text(); h.text = fLabels[i]!; h.x = fx+24; h.y = 1052; h.style = 'footer'
    jsmaf.root.children.push(k); jsmaf.root.children.push(h)
    fx += 210
  }

  // ── Highlight ─────────────────────────────────────────────────────────────
  let prevButton = -1

  function updateHighlight() {
    // Restore previous
    const prev = buttons[prevButton]
    if (prev && prevButton !== currentButton) {
      prev.alpha = 0.08; prev.borderColor = 'rgba(0,255,224,0.20)'
      const pb = barsLeft[prevButton]; if (pb) pb.alpha = 0.30
      const pt = buttonTexts[prevButton]
      if (pt && 'style' in pt) (pt as jsmaf.Text).style = prevButton === buttons.length - 1 ? 'red' : 'muted'
    }
    // Highlight current
    const cur = buttons[currentButton]
    const isExit = currentButton === buttons.length - 1
    if (cur) { cur.alpha = 0.18; cur.borderColor = isExit ? 'rgba(255,50,50,0.65)' : 'rgba(0,255,224,0.70)' }
    const cb = barsLeft[currentButton]; if (cb) { cb.alpha = 1.0; cb.borderColor = isExit ? 'rgb(255,50,50)' : C_CYAN }
    const ct = buttonTexts[currentButton]
    if (ct && 'style' in ct) (ct as jsmaf.Text).style = currentButton === buttons.length - 1 ? 'red' : 'white'
    prevButton = currentButton
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  let currentButton = 0

  function handleButtonPress() {
    if (currentButton === buttons.length - 1) {
      playSound(SFX_CANCEL)
      try { include('includes/kill_vue.js') } catch(e) {}
      jsmaf.exit()
    } else {
      const opt = menuOptions[currentButton]; if (!opt) return
      playSound(SFX_CONFIRM)
      if (opt.script === 'loader.js') jsmaf.onKeyDown = function() {}
      log('Loading ' + opt.script)
      try {
        if (opt.script.includes('loader.js')) {
          include(opt.script)
        } else {
          include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'neon') + '/' + opt.script)
        }
      } catch(e) { log('ERROR: ' + (e as Error).message) }
    }
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14

  jsmaf.onKeyDown = function(keyCode) {
    if (keyCode === 6 || keyCode === 5) {
      currentButton = (currentButton + 1) % buttons.length
      playSound(SFX_CURSOR); updateHighlight()
    } else if (keyCode === 4 || keyCode === 7) {
      currentButton = (currentButton - 1 + buttons.length) % buttons.length
      playSound(SFX_CURSOR); updateHighlight()
    } else if (keyCode === confirmKey) {
      handleButtonPress()
    }
  }

  updateHighlight()
  log('Neon main menu loaded.')
})()
