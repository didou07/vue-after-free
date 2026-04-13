import { fn, mem, BigInt } from 'download0/types'
import { binloader_init } from 'download0/binloader'
import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { checkJailbroken } from 'download0/check-jailbroken'

;(function () {
  if (typeof libc_addr === 'undefined') include('userland.js')
  include('check-jailbroken.js')
  if (typeof startBgmIfEnabled === 'function') startBgmIfEnabled()

  // ── Constants ─────────────────────────────────────────────────────────────
  const SW       = 1920
  const SH       = 1080
  const PAD_X    = 60
  const COL_GAP  = 28
  const COL_W    = (SW - PAD_X * 2 - COL_GAP) / 2
  const COL_R    = PAD_X + COL_W + COL_GAP
  const HEADER_H = 160
  const FOOTER_H = 44
  const AVAIL_H  = SH - HEADER_H - FOOTER_H - 16
  const BTN_H    = 88
  const BTN_GAP  = 10
  const MAX_ROWS = Math.floor(AVAIL_H / (BTN_H + BTN_GAP))
  const MAX_PL   = MAX_ROWS * 2
  const START_Y  = HEADER_H + 8

  const BG_URL   = 'file:///../download0/img/multiview_bg_VAF.png'
  const BTN_URL  = 'file:///../download0/img/NeonBtn.png'
  const SFX_CUR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_OK   = 'file:///../download0/sfx/confirm.wav'
  const SFX_BACK = 'file:///../download0/sfx/cancel.wav'

  function sfx (url: string) {
    if (typeof CONFIG !== 'undefined' && CONFIG.music === false) return
    try { const c = new jsmaf.AudioClip(); c.volume = 1.0; c.open(url) } catch (_e) { /* no audio */ }
  }

  is_jailbroken = checkJailbroken()

  // ── Scan payloads ─────────────────────────────────────────────────────────
  try { fn.register(0x05,  'ph_open',    ['bigint','bigint','bigint'], 'bigint') } catch (_e) { /* already registered */ }
  try { fn.register(0x06,  'ph_close',   ['bigint'],                   'bigint') } catch (_e) { /* already registered */ }
  try { fn.register(0x110, 'ph_getdnts', ['bigint','bigint','bigint'], 'bigint') } catch (_e) { /* already registered */ }
  try { fn.register(0x03,  'ph_read',    ['bigint','bigint','bigint'], 'bigint') } catch (_e) { /* already registered */ }

  type FEntry = { name: string; path: string }
  const fileList: FEntry[] = []

  const scanPaths = ['/download0/payloads']
  if (is_jailbroken) scanPaths.push('/data/payloads')

  const paddr = mem.malloc(256); const dbuf = mem.malloc(4096)
  for (const sp of scanPaths) {
    for (let i = 0; i < sp.length; i++) mem.view(paddr).setUint8(i, sp.charCodeAt(i))
    mem.view(paddr).setUint8(sp.length, 0)
    const fd = fn.ph_open(paddr, new BigInt(0, 0), new BigInt(0, 0))
    if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
      const cnt = fn.ph_getdnts(fd, dbuf, new BigInt(0, 4096))
      if (!cnt.eq(new BigInt(0xffffffff, 0xffffffff)) && cnt.lo > 0) {
        let off = 0
        while (off < cnt.lo) {
          const rl = mem.view(dbuf.add(new BigInt(0, off + 4))).getUint16(0, true)
          const dt = mem.view(dbuf.add(new BigInt(0, off + 6))).getUint8(0)
          const nl = mem.view(dbuf.add(new BigInt(0, off + 7))).getUint8(0)
          let name = ''
          for (let i = 0; i < nl; i++) name += String.fromCharCode(mem.view(dbuf.add(new BigInt(0, off + 8 + i))).getUint8(0))
          if (dt === 8 && name !== '.' && name !== '..') {
            const low = name.toLowerCase()
            if (low.endsWith('.elf') || low.endsWith('.bin') || low.endsWith('.js'))
              fileList.push({ name, path: sp + '/' + name })
          }
          off += rl
        }
      }
      fn.ph_close(fd)
    }
  }
  log('Payloads found: ' + fileList.length)

  // ── Scene ─────────────────────────────────────────────────────────────────
  jsmaf.root.children.length = 0

  new Style({ name: 'white',    color: 'rgb(255,255,255)',        size: 22 })
  new Style({ name: 'title',    color: 'rgb(255,255,255)',        size: 32 })
  new Style({ name: 'muted',    color: 'rgba(255,255,255,0.50)', size: 20 })
  new Style({ name: 'dim',      color: 'rgba(255,255,255,0.28)', size: 16 })
  new Style({ name: 'badge',    color: 'rgba(120,210,255,0.85)', size: 14 })
  new Style({ name: 'bsel',     color: 'rgb(80,220,255)',         size: 14 })
  new Style({ name: 'back',     color: 'rgba(255,120,120,0.80)', size: 20 })
  new Style({ name: 'scroll',   color: 'rgba(120,200,255,0.70)', size: 18 })
  new Style({ name: 'footer',   color: 'rgba(255,255,255,0.28)', size: 16 })
  new Style({ name: 'count',    color: 'rgba(120,210,255,0.60)', size: 16 })
  new Style({ name: 'empty',    color: 'rgba(255,255,255,0.45)', size: 24 })
  new Style({ name: 'emptysub', color: 'rgba(255,255,255,0.25)', size: 17 })
  new Style({ name: 'lnum',     color: 'rgba(255,255,255,0.22)', size: 14 })
  new Style({ name: 'lnumsel', color: 'rgba(120,210,255,0.80)',  size: 14 })

  // Background
  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: SW, height: SH }))

  // Header strip
  const hdr = new Image({ url: BTN_URL, x: 0, y: 0, width: SW, height: HEADER_H, alpha: 0.18 })
  hdr.borderColor = 'rgba(120,200,255,0.15)'; hdr.borderWidth = 0
  jsmaf.root.children.push(hdr)

  // Left accent bar on header
  const hdrAccent = new Image({ url: BTN_URL, x: 0, y: 0, width: 5, height: HEADER_H, alpha: 1.0 })
  hdrAccent.borderColor = 'rgb(80,200,255)'; hdrAccent.borderWidth = 0
  jsmaf.root.children.push(hdrAccent)

  // Logo (top-right)
  jsmaf.root.children.push(new Image({
    url: 'file:///../download0/img/logo.png',
    x: SW - 220, y: 12, width: 200, height: 112
  }))

  // Title
  if (useImageText) {
    jsmaf.root.children.push(new Image({
      url: textImageBase + 'payloadMenu.png',
      x: PAD_X, y: 38, width: 300, height: 72
    }))
  } else {
    const ttl = new jsmaf.Text()
    ttl.text = (lang.payloadMenu || 'PAYLOADS').toUpperCase()
    ttl.x = PAD_X; ttl.y = 52; ttl.style = 'title'
    jsmaf.root.children.push(ttl)
  }

  // Payload count
  const countTxt = new jsmaf.Text()
  countTxt.text = fileList.length + ' file' + (fileList.length !== 1 ? 's' : '') + ' found'
  countTxt.x = PAD_X; countTxt.y = 110; countTxt.style = 'count'
  jsmaf.root.children.push(countTxt)

  // Header divider
  const divH = new Image({
    url: BTN_URL, x: PAD_X, y: HEADER_H - 2,
    width: SW - PAD_X * 2, height: 2, alpha: 0.35
  })
  divH.borderColor = 'rgba(120,200,255,0.5)'; divH.borderWidth = 0
  jsmaf.root.children.push(divH)

  // Column separator
  const colDiv = new Image({
    url: BTN_URL,
    x: PAD_X + COL_W + COL_GAP / 2 - 1, y: HEADER_H + 4,
    width: 1, height: AVAIL_H, alpha: 0.18
  })
  colDiv.borderColor = 'rgba(255,255,255,0.3)'; colDiv.borderWidth = 0
  jsmaf.root.children.push(colDiv)

  // ── Empty state ───────────────────────────────────────────────────────────
  if (fileList.length === 0) {
    const em = new jsmaf.Text()
    em.text = 'No payloads found'
    em.x = SW / 2 - 140; em.y = SH / 2 - 60; em.style = 'empty'
    jsmaf.root.children.push(em)

    const eh = new jsmaf.Text()
    eh.text = 'Place  .elf / .bin / .js  files in  /download0/payloads/'
    eh.x = SW / 2 - 300; eh.y = SH / 2; eh.style = 'emptysub'
    jsmaf.root.children.push(eh)

    if (is_jailbroken) {
      const eh2 = new jsmaf.Text()
      eh2.text = 'or in  /data/payloads/'
      eh2.x = SW / 2 - 120; eh2.y = SH / 2 + 38; eh2.style = 'emptysub'
      jsmaf.root.children.push(eh2)
    }
  }

  // ── Slot widgets (2-column, full-width) ───────────────────────────────────
  const slotBtns:   Image[]      = []
  const slotBars:   Image[]      = []
  const slotNums:   jsmaf.Text[] = []
  const slotBadges: jsmaf.Text[] = []
  const slotLabels: jsmaf.Text[] = []
  const slotPaths:  jsmaf.Text[] = []

  for (let s = 0; s < MAX_PL; s++) {
    const col  = s % 2
    const row  = Math.floor(s / 2)
    const bX   = col === 0 ? PAD_X : COL_R
    const bY   = START_Y + row * (BTN_H + BTN_GAP)

    const btn = new Image({ url: BTN_URL, x: bX, y: bY, width: COL_W, height: BTN_H, alpha: 0.10 })
    btn.borderColor = 'rgba(255,255,255,0.14)'; btn.borderWidth = 1
    slotBtns.push(btn); jsmaf.root.children.push(btn)

    const bar = new Image({ url: BTN_URL, x: bX, y: bY, width: 5, height: BTN_H, alpha: 0.30 })
    bar.borderColor = 'rgb(120,200,255)'; bar.borderWidth = 0
    slotBars.push(bar); jsmaf.root.children.push(bar)

    const num = new jsmaf.Text()
    num.text = '--'; num.x = bX + 14; num.y = bY + 38; num.style = 'lnum'
    slotNums.push(num); jsmaf.root.children.push(num)

    const bdg = new jsmaf.Text()
    bdg.text = '---'; bdg.x = bX + 50; bdg.y = bY + 14; bdg.style = 'badge'
    slotBadges.push(bdg); jsmaf.root.children.push(bdg)

    const lbl = new jsmaf.Text()
    lbl.text = ''; lbl.x = bX + 50; lbl.y = bY + 36; lbl.style = 'muted'
    slotLabels.push(lbl); jsmaf.root.children.push(lbl)

    const pth = new jsmaf.Text()
    pth.text = ''; pth.x = bX + 50; pth.y = bY + 62; pth.style = 'dim'
    slotPaths.push(pth); jsmaf.root.children.push(pth)
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const navY = SH - FOOTER_H - 52

  const arrowUp = new jsmaf.Text(); arrowUp.text = '▲  Scroll up'
  arrowUp.x = SW / 2 - 70; arrowUp.y = navY; arrowUp.style = 'scroll'
  arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)

  const arrowDn = new jsmaf.Text(); arrowDn.text = '▼  More below'
  arrowDn.x = SW / 2 - 70; arrowDn.y = navY + 24; arrowDn.style = 'scroll'
  arrowDn.visible = false
  jsmaf.root.children.push(arrowDn)

  if (useImageText) {
    jsmaf.root.children.push(new Image({
      url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack' : 'oToGoBack') + '.png',
      x: PAD_X, y: navY + 4, width: 160, height: 38
    }))
  } else {
    const bt = new jsmaf.Text()
    bt.text = '← ' + (jsmaf.circleIsAdvanceButton ? lang.xToGoBack : lang.oToGoBack)
    bt.x = PAD_X; bt.y = navY + 10; bt.style = 'back'
    jsmaf.root.children.push(bt)
  }

  // ── Footer bar ─────────────────────────────────────────────────────────────
  const footBg = new Image({ url: BTN_URL, x: 0, y: SH - FOOTER_H, width: SW, height: FOOTER_H, alpha: 0.40 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)

  const fh = new jsmaf.Text()
  fh.text = '↑↓ ←→  Navigate    X  Launch payload    O  Back to menu'
  fh.x = SW / 2 - 280; fh.y = SH - FOOTER_H + 14; fh.style = 'footer'
  jsmaf.root.children.push(fh)

  // ── State ─────────────────────────────────────────────────────────────────
  let cur = 0; let scrollOff = 0
  const TOTAL = fileList.length

  function renderRows () {
    for (let s = 0; s < MAX_PL; s++) {
      const idx = scrollOff + s
      const vis = idx < TOTAL
      slotBtns[s]!.visible   = vis
      slotBars[s]!.visible   = vis
      slotNums[s]!.visible   = vis
      slotBadges[s]!.visible = vis
      slotLabels[s]!.visible = vis
      slotPaths[s]!.visible  = vis
      if (!vis) continue

      const f   = fileList[idx]!
      const sel = idx === cur
      const ext = f.name.split('.').pop()!.toUpperCase()
      let   disp = f.name.replace(/\.(elf|bin|js)$/i, '')
      if (disp.length > 36) disp = disp.slice(0, 34) + '..'
      const pathHint = f.path.startsWith('/data/') ? '/data/payloads' : '/download0/payloads'

      slotBtns[s]!.alpha       = sel ? 0.26 : 0.10
      slotBtns[s]!.borderColor = sel ? 'rgba(80,200,255,0.85)' : 'rgba(255,255,255,0.14)'
      slotBtns[s]!.borderWidth = sel ? 2 : 1
      slotBars[s]!.alpha       = sel ? 1.0 : 0.28
      slotBars[s]!.borderColor = sel ? 'rgb(80,220,255)' : 'rgb(120,200,255)'

      slotNums[s]!.text    = String(idx + 1).padStart(2, '0')
      slotNums[s]!.style   = sel ? 'lnumsel' : 'lnum'
      slotBadges[s]!.text  = ext
      slotBadges[s]!.style = sel ? 'bsel' : 'badge'
      slotLabels[s]!.text  = disp
      slotLabels[s]!.style = sel ? 'white' : 'muted'
      slotPaths[s]!.text   = pathHint
    }

    arrowUp.visible = scrollOff > 0
    arrowDn.visible = TOTAL > 0 && (scrollOff + MAX_PL) < TOTAL
  }

  function clamp () {
    if (cur < scrollOff) scrollOff = cur
    else if (cur >= scrollOff + MAX_PL) scrollOff = cur - MAX_PL + 1
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey    = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (kc: number) {
    if (kc === 6 || kc === 5) {
      if (TOTAL > 0) { cur = (cur + 1) % TOTAL; sfx(SFX_CUR); clamp(); renderRows() }
    } else if (kc === 4 || kc === 7) {
      if (TOTAL > 0) { cur = (cur - 1 + TOTAL) % TOTAL; sfx(SFX_CUR); clamp(); renderRows() }
    } else if (kc === confirmKey) {
      sfx(SFX_OK); launchPayload()
    } else if (kc === backKey) {
      sfx(SFX_BACK)
      try {
        include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'default') + '/main.js')
      } catch (e) { log('Error: ' + (e as Error).message) }
    }
  }

  function launchPayload () {
    if (TOTAL === 0) return
    const entry = fileList[cur]; if (!entry) return
    log('Launching: ' + entry.name)
    try {
      if (entry.name.toLowerCase().endsWith('.js')) {
        if (entry.path.startsWith('/download0/')) {
          include('payloads/' + entry.name)
        } else {
          const pa = mem.malloc(256)
          for (let i = 0; i < entry.path.length; i++) mem.view(pa).setUint8(i, entry.path.charCodeAt(i))
          mem.view(pa).setUint8(entry.path.length, 0)
          const fd = fn.ph_open(pa, new BigInt(0, 0), new BigInt(0, 0))
          if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
            const b = mem.malloc(0x100000)
            const rlen = fn.ph_read(fd, b, new BigInt(0, 0x100000)); fn.ph_close(fd)
            let code = ''
            const len = (rlen instanceof BigInt) ? rlen.lo : rlen
            for (let i = 0; i < len; i++) code += String.fromCharCode(mem.view(b).getUint8(i))
            jsmaf.eval(code)
          }
        }
      } else {
        include('binloader.js')
        const { bl_load_from_file } = binloader_init()
        bl_load_from_file(entry.path)
      }
    } catch (e) { log('Error: ' + (e as Error).message) }
  }

  renderRows()
  log('Payload host loaded. Files: ' + fileList.length + ' | MAX_PL: ' + MAX_PL)
})()
