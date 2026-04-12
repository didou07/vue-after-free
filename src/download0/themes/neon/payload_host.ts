import { lang } from 'download0/languages'
import { libc_addr } from 'download0/userland'
import { fn, mem, BigInt } from 'download0/types'

;(function () {
  if (typeof libc_addr === 'undefined') { include('userland.js') }
  include('check-jailbroken.js')
  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()
  const is_jailbroken = checkJailbroken()

  const C_CYAN   = 'rgb(0,255,224)'
  const C_DIM    = 'rgba(0,255,224,0.32)'
  const C_WHITE  = 'rgb(255,255,255)'
  const C_MUTED  = 'rgba(255,255,255,0.30)'
  const C_PURPLE = 'rgba(160,80,255,0.70)'
  const C_FOOTER = 'rgba(0,255,224,0.28)'

  function playSound(url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) } catch(_) {}
  }
  const SFX_CURSOR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_CONFIRM = 'file:///../download0/sfx/confirm.wav'
  const SFX_CANCEL  = 'file:///../download0/sfx/cancel.wav'

  jsmaf.root.children.length = 0

  new Style({ name: 'white',  color: C_WHITE,  size: 26 })
  new Style({ name: 'cyan',   color: C_CYAN,   size: 26 })
  new Style({ name: 'muted',  color: C_MUTED,  size: 24 })
  new Style({ name: 'dim',    color: C_DIM,    size: 18 })
  new Style({ name: 'purple', color: C_PURPLE, size: 24 })
  new Style({ name: 'title',  color: C_CYAN,   size: 36 })
  new Style({ name: 'footer', color: C_FOOTER, size: 18 })

  const BG  = 'file:///../download0/img/NeonBG.png'
  const BTN = 'file:///../download0/img/NeonBtn.png'

  jsmaf.root.children.push(new Image({ url: BG, x: 0, y: 0, width: 1920, height: 1080 }))

  // ── Header ────────────────────────────────────────────────────────────────
  const CX = 960
  const ttl = new jsmaf.Text(); ttl.text = 'PAYLOAD MENU'; ttl.x = CX - 190; ttl.y = 60; ttl.style = 'title'
  jsmaf.root.children.push(ttl)

  const sub = new jsmaf.Text(); sub.text = 'SELECT A PAYLOAD TO LAUNCH'; sub.x = CX - 195; sub.y = 114; sub.style = 'dim'
  jsmaf.root.children.push(sub)

  const divider = new Image({ url: BTN, x: 200, y: 144, width: 1520, height: 1, alpha: 0.40 })
  divider.borderColor = C_CYAN; divider.borderWidth = 0
  jsmaf.root.children.push(divider)

  // ── Scan paths ────────────────────────────────────────────────────────────
  fn.register(0x05, 'open_sys',  ['bigint','bigint','bigint'], 'bigint')
  fn.register(0x06, 'close_sys', ['bigint'],                   'bigint')
  fn.register(0x110,'getdents',  ['bigint','bigint','bigint'], 'bigint')
  fn.register(0x03, 'read_sys',  ['bigint','bigint','bigint'], 'bigint')

  const scanPaths: string[] = ['/download0/payloads']
  if (is_jailbroken) {
    scanPaths.push('/data/payloads')
    for (let i = 0; i <= 7; i++) scanPaths.push('/mnt/usb' + i + '/payloads')
  }

  const fileList: { name: string; path: string }[] = []
  const path_addr = mem.malloc(256)
  const buf       = mem.malloc(4096)

  for (const p of scanPaths) {
    for (let i = 0; i < p.length; i++) mem.view(path_addr).setUint8(i, p.charCodeAt(i))
    mem.view(path_addr).setUint8(p.length, 0)
    const fd = fn.open_sys(path_addr, new BigInt(0,0), new BigInt(0,0))
    if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
      const count = fn.getdents(fd, buf, new BigInt(0, 4096))
      if (!count.eq(new BigInt(0xffffffff, 0xffffffff)) && count.lo > 0) {
        let off = 0
        while (off < count.lo) {
          const reclen = mem.view(buf.add(new BigInt(0, off+4))).getUint16(0, true)
          const dtype  = mem.view(buf.add(new BigInt(0, off+6))).getUint8(0)
          const namlen = mem.view(buf.add(new BigInt(0, off+7))).getUint8(0)
          let name = ''
          for (let j = 0; j < namlen; j++) name += String.fromCharCode(mem.view(buf.add(new BigInt(0, off+8+j))).getUint8(0))
          if (dtype === 8 && name !== '.' && name !== '..') {
            const low = name.toLowerCase()
            if (low.endsWith('.elf') || low.endsWith('.bin') || low.endsWith('.js'))
              fileList.push({ name, path: p + '/' + name })
          }
          off += reclen
        }
      }
      fn.close_sys(fd)
    }
  }
  log('Total files: ' + fileList.length)

  // ── Layout ────────────────────────────────────────────────────────────────
  //   Screen 1920×1080, footer at y=1040
  //   Header ends ~150, footer starts 1040
  //   Available: 1040 - 164 = 876px
  //   With 6 payloads + 1 back: 7 rows
  //   GAP=112: 6×112=672 → backBtn at 164+6×112=836, bottom=836+90=926 ✓
  const MAX_PAY = 6       // max payload rows shown
  const BTN_W   = 700
  const BTN_H   = 90
  const BTN_L   = CX - BTN_W / 2
  const START_Y = 164
  const GAP     = 112

  const buttons:      Image[]      = []
  const buttonTexts:  jsmaf.Text[] = []
  const barsList:     Image[]      = []

  if (fileList.length === 0) {
    const empty = new jsmaf.Text(); empty.text = 'NO PAYLOADS FOUND'
    empty.x = CX - 168; empty.y = 500; empty.style = 'muted'
    jsmaf.root.children.push(empty)
    const hint = new jsmaf.Text(); hint.text = 'Place .elf / .bin files in /download0/payloads/'
    hint.x = CX - 270; hint.y = 550; hint.style = 'dim'
    jsmaf.root.children.push(hint)
  }

  const maxShow = Math.min(fileList.length, MAX_PAY)

  for (let i = 0; i < maxShow; i++) {
    const f  = fileList[i]!
    const bY = START_Y + i * GAP

    const btn = new Image({ url: BTN, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.08 })
    btn.borderColor = 'rgba(0,255,224,0.20)'; btn.borderWidth = 1
    buttons.push(btn); jsmaf.root.children.push(btn)

    const bar = new Image({ url: BTN, x: BTN_L, y: bY, width: 3, height: BTN_H, alpha: 0.30 })
    bar.borderColor = C_CYAN; bar.borderWidth = 0
    barsList.push(bar); jsmaf.root.children.push(bar)

    const num = new jsmaf.Text(); num.text = String(i+1).padStart(2,'0')
    num.x = BTN_L + 28; num.y = bY + 30; num.style = 'dim'
    jsmaf.root.children.push(num)

    const ext = f.name.split('.').pop()!.toUpperCase()
    const badgeBg = new Image({ url: BTN, x: BTN_L + 82, y: bY + 18, width: 72, height: 54, alpha: 0.35 })
    badgeBg.borderColor = ext === 'ELF' ? 'rgba(0,255,224,0.5)' : ext === 'BIN' ? 'rgba(160,80,255,0.5)' : 'rgba(255,200,0,0.5)'
    badgeBg.borderWidth = 1
    jsmaf.root.children.push(badgeBg)

    const badgeTxt = new jsmaf.Text(); badgeTxt.text = ext
    badgeTxt.x = BTN_L + 96; badgeTxt.y = bY + 30; badgeTxt.style = 'dim'
    jsmaf.root.children.push(badgeTxt)

    let disp = f.name.replace(/\.(elf|bin|js)$/i, '')
    if (disp.length > 30) disp = disp.substring(0, 28) + '..'
    const t = new jsmaf.Text(); t.text = disp.toUpperCase()
    t.x = BTN_L + 170; t.y = bY + 30; t.style = 'muted'
    buttonTexts.push(t); jsmaf.root.children.push(t)

    const arr = new jsmaf.Text(); arr.text = '>'
    arr.x = BTN_L + BTN_W - 50; arr.y = bY + 30; arr.style = 'dim'
    jsmaf.root.children.push(arr)
  }

  // ── Back button ───────────────────────────────────────────────────────────
  // Positioned one GAP below last payload row, well above the footer at 1040
  const backY   = START_Y + maxShow * GAP
  const backBtn = new Image({ url: BTN, x: BTN_L, y: backY, width: BTN_W, height: BTN_H, alpha: 0.0 })
  backBtn.borderColor = 'transparent'; backBtn.borderWidth = 0
  buttons.push(backBtn); jsmaf.root.children.push(backBtn)
  barsList.push(new Image({ url: BTN, x: 0, y: 0, width: 1, height: 1, alpha: 0 }))

  const backDash = new Image({ url: BTN, x: BTN_L + 170, y: backY + 44, width: 30, height: 1, alpha: 0.6 })
  backDash.borderColor = C_PURPLE; backDash.borderWidth = 0
  jsmaf.root.children.push(backDash)

  const backT = new jsmaf.Text(); backT.text = 'BACK'
  backT.x = BTN_L + 212; backT.y = backY + 30; backT.style = 'purple'
  buttonTexts.push(backT); jsmaf.root.children.push(backT)

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerBg = new Image({ url: BTN, x: 0, y: 1040, width: 1920, height: 40, alpha: 0.40 })
  footerBg.borderColor = 'transparent'; footerBg.borderWidth = 0
  jsmaf.root.children.push(footerBg)

  const footerLine = new Image({ url: BTN, x: 0, y: 1040, width: 1920, height: 1, alpha: 0.35 })
  footerLine.borderColor = C_CYAN; footerLine.borderWidth = 0
  jsmaf.root.children.push(footerLine)

  const fKeys   = ['\u2191\u2193', 'X', 'O']
  const fLabels = ['  Navigate', '  Launch', '  Back']
  let fx = CX - 300
  for (let i = 0; i < 3; i++) {
    const k = new jsmaf.Text(); k.text = fKeys[i]!;   k.x = fx;    k.y = 1052; k.style = 'footer'
    const h = new jsmaf.Text(); h.text = fLabels[i]!; h.x = fx+24; h.y = 1052; h.style = 'footer'
    jsmaf.root.children.push(k); jsmaf.root.children.push(h)
    fx += 210
  }

  // ── Highlight ─────────────────────────────────────────────────────────────
  let currentButton = 0; let prevButton = -1

  function updateHighlight() {
    const prev = buttons[prevButton]
    if (prev && prevButton !== currentButton) {
      prev.alpha = 0.08; prev.borderColor = 'rgba(0,255,224,0.20)'
      const pb = barsList[prevButton]; if (pb) pb.alpha = 0.30
      const pt = buttonTexts[prevButton]
      if (pt) pt.style = prevButton === buttons.length - 1 ? 'purple' : 'muted'
    }
    const cur = buttons[currentButton]
    if (cur) { cur.alpha = 0.18; cur.borderColor = 'rgba(0,255,224,0.70)' }
    const cb = barsList[currentButton]; if (cb) cb.alpha = 1.0
    const ct = buttonTexts[currentButton]
    if (ct) ct.style = currentButton === buttons.length - 1 ? 'cyan' : 'white'
    prevButton = currentButton
  }

  function handleButtonPress() {
    if (currentButton === buttons.length - 1) {
      playSound(SFX_CANCEL)
      try { include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'neon') + '/main.js') }
      catch(e) { log('ERROR: ' + (e as Error).message) }
      return
    }
    const entry = fileList[currentButton]; if (!entry) return
    playSound(SFX_CONFIRM); log('Loading: ' + entry.name)
    try {
      if (entry.name.toLowerCase().endsWith('.js')) {
        if (entry.path.startsWith('/download0/')) {
          include('payloads/' + entry.name)
        } else {
          const p = mem.malloc(256)
          for (let i = 0; i < entry.path.length; i++) mem.view(p).setUint8(i, entry.path.charCodeAt(i))
          mem.view(p).setUint8(entry.path.length, 0)
          const fd2 = fn.open_sys(p, new BigInt(0,0), new BigInt(0,0))
          if (!fd2.eq(new BigInt(0xffffffff, 0xffffffff))) {
            const b2 = mem.malloc(1024*1024)
            const rdlen = fn.read_sys(fd2, b2, new BigInt(0, 1024*1024)); fn.close_sys(fd2)
            let code = ''
            const len = (rdlen instanceof BigInt) ? rdlen.lo : (rdlen as number)
            for (let i = 0; i < len; i++) code += String.fromCharCode(mem.view(b2).getUint8(i))
            eval(code) // eslint-disable-line no-eval
          }
        }
      } else {
        include('binloader.js')
        const { bl_load_from_file } = binloader_init()
        bl_load_from_file(entry.path)
      }
    } catch(e) { log('ERROR: ' + (e as Error).message) }
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
  log('Neon payload host loaded. Files: ' + fileList.length + ' (showing max ' + MAX_PAY + ')')
})()
