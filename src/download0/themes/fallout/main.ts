;(function () {
  include('languages.js')
  log('Loading Fallout terminal menu...')

  let currentButton = 0
  let prevButton    = -1
  const buttons:      Image[]             = []
  const buttonTexts:  (Image | jsmaf.Text)[] = []
  const buttonMarkers: jsmaf.Text[]       = []
  const buttonOrigPos: { x: number; y: number }[] = []
  const textOrigPos:   { x: number; y: number }[] = []

  // ── Reset Scene ──────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  // ── Fallout 4 Terminal Styles ─────────────────────────────────────────────
  new Style({ name: 'terminal',        color: 'rgb(0,220,0)',   size: 26 })
  new Style({ name: 'terminal_shadow', color: 'rgb(0,0,0)',     size: 26 })
  new Style({ name: 'selected',        color: 'rgb(0,255,0)',   size: 26 })
  new Style({ name: 'dim_text',        color: 'rgb(6,200,6)',   size: 20 })
  new Style({ name: 'prompt',          color: 'rgb(0,240,0)',   size: 22 })
  new Style({ name: 'help_text',       color: 'rgb(0,240,0)',   size: 18 })
  new Style({ name: 'white',           color: 'white',          size: 24 })

  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()

  // ── Background ────────────────────────────────────────────────────────────
  const bg = new Image({ url: 'file:///../download0/img/FalloutBG.png', x: 0, y: 0, width: 1920, height: 1080 })
  bg.alpha = 0.6
  jsmaf.root.children.push(bg)

  // ── Terminal Header ───────────────────────────────────────────────────────
  const headers = [
    '>PIP SET >D:TERMINAL',
    '>PIP SET >D:"FILE/PROTECTION=OWNER -R/W READY"',
    '>PIP SET >D:FrontEnd',
    '>PIP SET >D:DevMode',
    '>PIP SET >D:Fallout/Main.js',
  ]
  headers.forEach((text, i) => {
    const t = new jsmaf.Text()
    t.text  = text
    t.x     = 100
    t.y     = 85 + i * 20
    t.style = 'dim_text'
    jsmaf.root.children.push(t)
  })

  const credit = new jsmaf.Text()
  credit.text  = 'Vue after Free 2.0'
  credit.x     = 100
  credit.y     = 230
  credit.style = 'prompt'
  jsmaf.root.children.push(credit)

  const status = new jsmaf.Text()
  status.text  = '- VUE AFTER FREE READY -'
  status.x     = 100
  status.y     = 370
  status.style = 'terminal'
  jsmaf.root.children.push(status)

  const divider = new jsmaf.Text()
  divider.text  = '___________________________________________________________________________________'
  divider.x     = 100
  divider.y     = 400
  divider.style = 'terminal'
  jsmaf.root.children.push(divider)

  // ── Menu Options ─────────────────────────────────────────────────────────
  const menuOptions = [
    { label: lang.jailbreak,   script: 'loader.js',       imgKey: 'jailbreak'   },
    { label: lang.payloadMenu, script: 'payload_host.js', imgKey: 'payloadMenu' },
    { label: lang.config,      script: 'config_ui.js',    imgKey: 'config'      },
  ]

  const startY       = 470
  const buttonSpacing = 70
  const leftMargin   = 150
  const buttonImg    = 'file://../download0/img/Opt_BG.png'

  for (let i = 0; i < menuOptions.length; i++) {
    const yPos = startY + i * buttonSpacing

    // Background panel
    const bgPanel = new Image({ url: buttonImg, x: leftMargin - 20, y: yPos - 12, width: 700, height: 50 })
    bgPanel.alpha = 0.15
    jsmaf.root.children.push(bgPanel)

    // Invisible hit area
    const btn = new Image({ url: buttonImg, x: leftMargin - 50, y: yPos - 10, width: 1100, height: 60 })
    btn.alpha = 0
    buttons.push(btn)
    jsmaf.root.children.push(btn)

    // Cursor marker '>'
    const marker = new jsmaf.Text()
    marker.text    = '>'
    marker.x       = leftMargin - 30
    marker.y       = yPos
    marker.style   = 'selected'
    marker.visible = false
    buttonMarkers.push(marker)
    jsmaf.root.children.push(marker)

    // Shadow text
    const shadow = new jsmaf.Text()
    shadow.text  = '[' + (i + 1) + '] ' + menuOptions[i]!.label
    shadow.x     = leftMargin + 3
    shadow.y     = yPos + 3
    shadow.style = 'terminal_shadow'
    jsmaf.root.children.push(shadow)

    // Button text
    let btnText: Image | jsmaf.Text
    if (typeof useImageText !== 'undefined' && useImageText) {
      btnText = new Image({ url: textImageBase + menuOptions[i]!.imgKey + '.png', x: leftMargin + 20, y: yPos - 5, width: 300, height: 50 })
    } else {
      const t = new jsmaf.Text()
      t.text  = '[' + (i + 1) + '] ' + menuOptions[i]!.label
      t.x     = leftMargin
      t.y     = yPos
      t.style = 'terminal'
      btnText = t
    }
    buttonTexts.push(btnText)
    jsmaf.root.children.push(btnText)

    buttonOrigPos.push({ x: leftMargin - 50, y: yPos - 10 })
    textOrigPos.push({ x: btnText.x, y: btnText.y })
  }

  // ── Exit Button ───────────────────────────────────────────────────────────
  const exitY = startY + menuOptions.length * buttonSpacing + 40

  const exitBgPanel = new Image({ url: buttonImg, x: leftMargin - 20, y: exitY - 12, width: 700, height: 50 })
  exitBgPanel.alpha = 0.15
  jsmaf.root.children.push(exitBgPanel)

  const exitBtn = new Image({ url: buttonImg, x: leftMargin - 50, y: exitY - 10, width: 1100, height: 60 })
  exitBtn.alpha = 0
  buttons.push(exitBtn)
  jsmaf.root.children.push(exitBtn)

  const exitMarker = new jsmaf.Text()
  exitMarker.text    = '>'
  exitMarker.x       = leftMargin - 30
  exitMarker.y       = exitY
  exitMarker.style   = 'selected'
  exitMarker.visible = false
  buttonMarkers.push(exitMarker)
  jsmaf.root.children.push(exitMarker)

  const exitShadow = new jsmaf.Text()
  exitShadow.text  = '[0] ' + lang.exit
  exitShadow.x     = leftMargin + 3
  exitShadow.y     = exitY + 3
  exitShadow.style = 'terminal_shadow'
  jsmaf.root.children.push(exitShadow)

  let exitText: Image | jsmaf.Text
  if (typeof useImageText !== 'undefined' && useImageText) {
    exitText = new Image({ url: textImageBase + 'exit.png', x: leftMargin + 20, y: exitY - 5, width: 300, height: 50 })
  } else {
    const t = new jsmaf.Text()
    t.text  = '[0] ' + lang.exit
    t.x     = leftMargin
    t.y     = exitY
    t.style = 'terminal'
    exitText = t
  }
  buttonTexts.push(exitText)
  jsmaf.root.children.push(exitText)

  buttonOrigPos.push({ x: leftMargin - 50, y: exitY - 10 })
  textOrigPos.push({ x: exitText.x, y: exitText.y })

  // ── Right Info Box ────────────────────────────────────────────────────────
  const helpBoxX = 870
  const helpBoxY = 550
  const helpLines: string[] = [
    '________________________',
    'VUE MENU!',
    '________________________',
    'D-PAD UP/DOWN: Change Selection',
    ' X: Select Option',
    ' O: Go Back',
    '________________________',
  ]
  const helpStyles = ['terminal','terminal','terminal','help_text','help_text','help_text','terminal']
  helpLines.forEach((text, i) => {
    const t = new jsmaf.Text()
    t.text  = text
    t.x     = helpBoxX
    t.y     = helpBoxY + (i === 0 ? 0 : i <= 2 ? i * 27 + 3 : 55 + (i - 3) * 15)
    t.style = helpStyles[i]!
    jsmaf.root.children.push(t)
  })

  // ── Footer ────────────────────────────────────────────────────────────────
  const bottomLine = new jsmaf.Text()
  bottomLine.text  = '___________________________________________________________________________________'
  bottomLine.x     = 100
  bottomLine.y     = 880
  bottomLine.style = 'terminal'
  jsmaf.root.children.push(bottomLine)

  const statusLine = new jsmaf.Text()
  statusLine.text  = '>Vue after Free 2.0 compatible'
  statusLine.x     = 100
  statusLine.y     = 920
  statusLine.style = 'prompt'
  jsmaf.root.children.push(statusLine)

  const cursor = new jsmaf.Text()
  cursor.text  = String.fromCharCode(9608)
  cursor.x     = 320
  cursor.y     = 920
  cursor.style = 'terminal'
  jsmaf.root.children.push(cursor)

  // ── Highlight ─────────────────────────────────────────────────────────────
  function updateHighlight () {
    for (let i = 0; i < buttonMarkers.length; i++) {
      buttonMarkers[i]!.visible = false
      const t = buttonTexts[i]
      if (t && 'style' in t) (t as jsmaf.Text).style = 'terminal'
    }
    if (buttonMarkers[currentButton]) buttonMarkers[currentButton]!.visible = true
    const sel = buttonTexts[currentButton]
    if (sel && 'style' in sel) (sel as jsmaf.Text).style = 'selected'
    prevButton = currentButton
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function handleButtonPress () {
    if (currentButton === buttons.length - 1) {
      log('>> TERMINATING PROCESS...')
      try { include('includes/kill_vue.js') } catch (e) { log('Exit error: ' + (e as Error).message) }
      jsmaf.exit()
    } else {
      const opt = menuOptions[currentButton]
      if (!opt) return
      if (opt.script === 'loader.js') jsmaf.onKeyDown = function () {}
      log('>> LOADING MODULE: ' + opt.script)
      try {
        if (opt.script.includes('loader.js')) {
          include(opt.script)
        } else {
          include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'fallout') + '/' + opt.script)
        }
      } catch (e) { log('>> ERROR: ' + (e as Error).message) }
    }
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14

  jsmaf.onKeyDown = function (keyCode) {
    if (keyCode === 6 || keyCode === 5) {
      currentButton = (currentButton + 1) % buttons.length
      updateHighlight()
    } else if (keyCode === 4 || keyCode === 7) {
      currentButton = (currentButton - 1 + buttons.length) % buttons.length
      updateHighlight()
    } else if (keyCode === confirmKey) {
      handleButtonPress()
    }
  }

  updateHighlight()
  log('>> TERMINAL INTERFACE LOADED')
})()
