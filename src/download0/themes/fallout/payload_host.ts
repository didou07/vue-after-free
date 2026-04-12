;(function () {
  if (typeof libc_addr === 'undefined') {
    log('Loading userland.js...')
    include('userland.js')
  }
  include('check-jailbroken.js')
  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()

  const is_jailbroken = checkJailbroken()

  // ── Reset Scene ──────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  // ── Fallout Styles ────────────────────────────────────────────────────────
  new Style({ name: 'terminal',        color: 'rgb(0,220,0)',  size: 26 })
  new Style({ name: 'terminal_shadow', color: 'rgb(0,0,0)',    size: 26 })
  new Style({ name: 'selected',        color: 'rgb(0,255,0)',  size: 26 })
  new Style({ name: 'dim_text',        color: 'rgb(6,200,6)',  size: 20 })
  new Style({ name: 'prompt',          color: 'rgb(0,240,0)',  size: 22 })
  new Style({ name: 'help_text',       color: 'rgb(0,240,0)',  size: 18 })

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
    '>PIP SET >D:Fallout/Payload_host.js',
  ]
  headers.forEach((text, i) => {
    const t = new jsmaf.Text()
    t.text = text; t.x = 100; t.y = 85 + i * 20; t.style = 'dim_text'
    jsmaf.root.children.push(t)
  })

  const credit = new jsmaf.Text()
  credit.text = 'Vue after Free 2.0'; credit.x = 100; credit.y = 230; credit.style = 'prompt'
  jsmaf.root.children.push(credit)

  const status = new jsmaf.Text()
  status.text = '- VUE AFTER FREE READY -'; status.x = 100; status.y = 370; status.style = 'terminal'
  jsmaf.root.children.push(status)

  const divider = new jsmaf.Text()
  divider.text = '___________________________________________________________________________________'
  divider.x = 100; divider.y = 400; divider.style = 'terminal'
  jsmaf.root.children.push(divider)

  // ── Scan Paths ────────────────────────────────────────────────────────────
  fn.register(0x05,  'open_sys',  ['bigint', 'bigint', 'bigint'], 'bigint')
  fn.register(0x06,  'close_sys', ['bigint'],                     'bigint')
  fn.register(0x110, 'getdents',  ['bigint', 'bigint', 'bigint'], 'bigint')
  fn.register(0x03,  'read_sys',  ['bigint', 'bigint', 'bigint'], 'bigint')

  const scanPaths: string[] = ['/download0/payloads']
  if (is_jailbroken) {
    scanPaths.push('/data/payloads')
    for (let i = 0; i <= 7; i++) scanPaths.push('/mnt/usb' + i + '/payloads')
  }

  const fileList: { name: string; path: string }[] = []
  const path_addr = mem.malloc(256)
  const buf       = mem.malloc(4096)

  for (const currentPath of scanPaths) {
    log('Scanning ' + currentPath + '...')
    for (let i = 0; i < currentPath.length; i++) mem.view(path_addr).setUint8(i, currentPath.charCodeAt(i))
    mem.view(path_addr).setUint8(currentPath.length, 0)

    const fd = fn.open_sys(path_addr, new BigInt(0, 0), new BigInt(0, 0))
    if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
      const count = fn.getdents(fd, buf, new BigInt(0, 4096))
      if (!count.eq(new BigInt(0xffffffff, 0xffffffff)) && count.lo > 0) {
        let offset = 0
        while (offset < count.lo) {
          const d_reclen = mem.view(buf.add(new BigInt(0, offset + 4))).getUint16(0, true)
          const d_type   = mem.view(buf.add(new BigInt(0, offset + 6))).getUint8(0)
          const d_namlen = mem.view(buf.add(new BigInt(0, offset + 7))).getUint8(0)
          let name = ''
          for (let j = 0; j < d_namlen; j++) name += String.fromCharCode(mem.view(buf.add(new BigInt(0, offset + 8 + j))).getUint8(0))
          if (d_type === 8 && name !== '.' && name !== '..') {
            const lower = name.toLowerCase()
            if (lower.endsWith('.elf') || lower.endsWith('.bin') || lower.endsWith('.js')) {
              fileList.push({ name, path: currentPath + '/' + name })
              log('Added: ' + name)
            }
          }
          offset += d_reclen
        }
      }
      fn.close_sys(fd)
    } else {
      log('Failed to open ' + currentPath)
    }
  }
  log('Total files: ' + fileList.length)

  // ── File List UI (3-column grid) ─────────────────────────────────────────
  const buttons:       Image[]             = []
  const buttonTexts:   jsmaf.Text[]        = []
  const buttonMarkers: jsmaf.Text[]        = []
  const buttonOrigPos: { x: number; y: number }[] = []
  const textOrigPos:   { x: number; y: number }[] = []

  const gridStartY     = 470
  const rowSpacing     = 35
  const columnSpacing  = 350
  const leftMargin     = 100
  const buttonImg      = 'file://../download0/img/Opt_BG.png'
  let currentButton = 0

  for (let i = 0; i < fileList.length; i++) {
    const row  = Math.floor(i / 3)
    const col  = i % 3
    const yPos = gridStartY + row * rowSpacing
    const xOff = col * columnSpacing

    const bgPanel = new Image({ url: buttonImg, x: leftMargin - 20 + xOff, y: yPos - 12, width: 300, height: 32 })
    bgPanel.alpha = 0.15
    jsmaf.root.children.push(bgPanel)

    const btn = new Image({ url: buttonImg, x: leftMargin - 50 + xOff, y: yPos - 10, width: 400, height: 40 })
    btn.alpha = 0
    buttons.push(btn)
    jsmaf.root.children.push(btn)

    const marker = new jsmaf.Text()
    marker.text = '>'; marker.x = leftMargin - 30 + xOff; marker.y = yPos; marker.style = 'selected'; marker.visible = false
    buttonMarkers.push(marker)
    jsmaf.root.children.push(marker)

    const shadow = new jsmaf.Text()
    shadow.text = '[' + (i + 1) + '] ' + fileList[i]!.name
    shadow.x = leftMargin + 3 + xOff; shadow.y = yPos + 3; shadow.style = 'terminal_shadow'
    jsmaf.root.children.push(shadow)

    let displayName = fileList[i]!.name
    if (displayName.length > 30) displayName = displayName.substring(0, 27) + '...'

    const txt = new jsmaf.Text()
    txt.text = '[' + (i + 1) + '] ' + displayName
    txt.x = leftMargin + xOff; txt.y = yPos; txt.style = 'terminal'
    buttonTexts.push(txt)
    jsmaf.root.children.push(txt)

    buttonOrigPos.push({ x: leftMargin - 50 + xOff, y: yPos - 10 })
    textOrigPos.push({ x: txt.x, y: txt.y })
  }

  // ── Help Box (top-right) ──────────────────────────────────────────────────
  const helpBoxX = 800; const helpBoxY = 240
  const helpItems = [
    { text: '________________________', style: 'terminal', dy: 0  },
    { text: 'PAYLOAD MENU!',           style: 'terminal', dy: 30 },
    { text: '________________________', style: 'terminal', dy: 55 },
    { text: 'D-PAD: Navigate',         style: 'help_text', dy: 85 },
    { text: ' X: Select',              style: 'help_text', dy: 100 },
    { text: ' O: Back',                style: 'help_text', dy: 115 },
    { text: '________________________', style: 'terminal', dy: 125 },
  ]
  helpItems.forEach(({ text, style, dy }) => {
    const t = new jsmaf.Text()
    t.text = text; t.x = helpBoxX; t.y = helpBoxY + dy; t.style = style
    jsmaf.root.children.push(t)
  })

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerLine = new jsmaf.Text()
  footerLine.text = '___________________________________________________________________________________'
  footerLine.x = 100; footerLine.y = 880; footerLine.style = 'terminal'
  jsmaf.root.children.push(footerLine)

  const statusLine = new jsmaf.Text()
  statusLine.text = '>Vue after Free 2.0 compatible'
  statusLine.x = 100; statusLine.y = 920; statusLine.style = 'prompt'
  jsmaf.root.children.push(statusLine)

  const cursor = new jsmaf.Text()
  cursor.text = String.fromCharCode(9608)
  cursor.x = 320; cursor.y = 920; cursor.style = 'terminal'
  jsmaf.root.children.push(cursor)

  // ── Highlight & Input ────────────────────────────────────────────────────
  function updateHighlight () {
    for (let i = 0; i < buttonMarkers.length; i++) {
      buttonMarkers[i]!.visible = false
      if (buttonTexts[i]) buttonTexts[i]!.style = 'terminal'
    }
    if (buttonMarkers[currentButton]) buttonMarkers[currentButton]!.visible = true
    if (buttonTexts[currentButton])   buttonTexts[currentButton]!.style = 'selected'
  }

  function handleButtonPress () {
    const entry = fileList[currentButton]
    if (!entry) return
    log('Selected: ' + entry.name)
    try {
      if (entry.name.toLowerCase().endsWith('.js')) {
        if (entry.path.startsWith('/download0/')) {
          include('payloads/' + entry.name)
        } else {
          const p = mem.malloc(256)
          for (let i = 0; i < entry.path.length; i++) mem.view(p).setUint8(i, entry.path.charCodeAt(i))
          mem.view(p).setUint8(entry.path.length, 0)
          const fd2 = fn.open_sys(p, new BigInt(0, 0), new BigInt(0, 0))
          if (!fd2.eq(new BigInt(0xffffffff, 0xffffffff))) {
            const b2     = mem.malloc(1024 * 1024)
            const rdlen  = fn.read_sys(fd2, b2, new BigInt(0, 1024 * 1024))
            fn.close_sys(fd2)
            let code = ''
            const len = rdlen instanceof BigInt ? rdlen.lo : (rdlen as number)
            for (let i = 0; i < len; i++) code += String.fromCharCode(mem.view(b2).getUint8(i))
            eval(code) // eslint-disable-line no-eval
          }
        }
      } else {
        include('binloader.js')
        const { bl_load_from_file } = binloader_init()
        bl_load_from_file(entry.path)
      }
    } catch (e) { log('ERROR: ' + (e as Error).message) }
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey    = jsmaf.circleIsAdvanceButton ? 14 : 13
  const COLS = 3

  jsmaf.onKeyDown = function (keyCode) {
    if (keyCode === 6 || keyCode === 4) {
      // Down / Up — move by row
      const step = keyCode === 6 ? COLS : -COLS
      let next = currentButton + step
      if (next >= buttons.length) next -= COLS
      if (next < 0) next += COLS
      currentButton = Math.max(0, Math.min(next, buttons.length - 1))
      updateHighlight()
    } else if (keyCode === 5 || keyCode === 7) {
      // Right / Left — move within row
      const col = currentButton % COLS
      if (keyCode === 5 && col < COLS - 1 && currentButton + 1 < buttons.length) currentButton++
      else if (keyCode === 7 && col > 0) currentButton--
      updateHighlight()
    } else if (keyCode === confirmKey) {
      handleButtonPress()
    } else if (keyCode === backKey) {
      try {
        include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'fallout') + '/main.js')
      } catch (e) { log('ERROR going back: ' + (e as Error).message) }
    }
  }

  updateHighlight()
  log('Fallout payload browser loaded. Files: ' + fileList.length)
})()
