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
  const CX       = 960
  const BTN_W    = 680
  const BTN_H    = 80
  const BTN_L    = CX - BTN_W / 2
  const START_Y  = 178
  const GAP      = 96
  const MAX_PL   = 8          // max payloads shown (8 × 96 = 768 → 178..946 ✓)
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

  new Style({ name: 'white',  color: 'rgb(255,255,255)',        size: 22 })
  new Style({ name: 'title',  color: 'rgb(255,255,255)',        size: 28 })
  new Style({ name: 'muted',  color: 'rgba(255,255,255,0.50)',  size: 20 })
  new Style({ name: 'dim',    color: 'rgba(255,255,255,0.28)',  size: 16 })
  new Style({ name: 'badge',  color: 'rgba(120,210,255,0.90)', size: 15 })
  new Style({ name: 'bsel',   color: 'rgb(80,220,255)',         size: 15 })
  new Style({ name: 'back',   color: 'rgba(255,120,120,0.80)', size: 20 })
  new Style({ name: 'scroll', color: 'rgba(120,200,255,0.60)', size: 18 })
  new Style({ name: 'footer', color: 'rgba(255,255,255,0.28)', size: 16 })

  jsmaf.root.children.push(new Image({ url: BG_URL, x: 0, y: 0, width: 1920, height: 1080 }))
  jsmaf.root.children.push(new Image({ url: 'file:///../download0/img/logo.png', x: 1630, y: 12, width: 270, height: 152 }))

  // Title + divider
  if (useImageText) {
    jsmaf.root.children.push(new Image({ url: textImageBase + 'payloadMenu.png', x: CX - 125, y: 60, width: 250, height: 60 }))
  } else {
    const ttl = new jsmaf.Text(); ttl.text = lang.payloadMenu || 'PAYLOADS'
    ttl.x = CX - 80; ttl.y = 72; ttl.style = 'title'
    jsmaf.root.children.push(ttl)
  }
  const divL = new Image({ url: BTN_URL, x: BTN_L, y: 148, width: BTN_W, height: 1, alpha: 0.30 })
  divL.borderColor = 'rgba(255,255,255,0.4)'; divL.borderWidth = 0
  jsmaf.root.children.push(divL)

  // Empty message
  if (fileList.length === 0) {
    const em = new jsmaf.Text(); em.text = 'No payloads found'
    em.x = CX - 110; em.y = 500; em.style = 'muted'
    jsmaf.root.children.push(em)
    const eh = new jsmaf.Text(); eh.text = 'Place .elf / .bin files in  /download0/payloads/'
    eh.x = CX - 240; eh.y = 544; eh.style = 'dim'
    jsmaf.root.children.push(eh)
  }

  // ── Slot widgets (scrollable) ─────────────────────────────────────────────
  const VISIBLE  = Math.min(fileList.length, MAX_PL)
  const slotBtns:   Image[]      = []
  const slotBars:   Image[]      = []
  const slotNums:   jsmaf.Text[] = []
  const slotBadges: jsmaf.Text[] = []
  const slotLabels: jsmaf.Text[] = []

  for (let s = 0; s < MAX_PL; s++) {
    const bY = START_Y + s * GAP

    const btn = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: BTN_W, height: BTN_H, alpha: 0.10 })
    btn.borderColor = 'rgba(255,255,255,0.14)'; btn.borderWidth = 1
    slotBtns.push(btn); jsmaf.root.children.push(btn)

    const bar = new Image({ url: BTN_URL, x: BTN_L, y: bY, width: 4, height: BTN_H, alpha: 0.30 })
    bar.borderColor = 'rgb(120,200,255)'; bar.borderWidth = 0
    slotBars.push(bar); jsmaf.root.children.push(bar)

    const num = new jsmaf.Text(); num.text = '--'; num.x = BTN_L + 12; num.y = bY + 30; num.style = 'dim'
    slotNums.push(num); jsmaf.root.children.push(num)

    // Type badge box
    const bdg = new jsmaf.Text(); bdg.text = '---'; bdg.x = BTN_L + 52; bdg.y = bY + 30; bdg.style = 'badge'
    slotBadges.push(bdg); jsmaf.root.children.push(bdg)

    const lbl = new jsmaf.Text(); lbl.text = ''; lbl.x = BTN_L + 110; lbl.y = bY + 30; lbl.style = 'muted'
    slotLabels.push(lbl); jsmaf.root.children.push(lbl)
  }

  // Back button (always at bottom, below payload rows)
  const backY   = START_Y + MAX_PL * GAP + 6
  const backBtn = new Image({ url: BTN_URL, x: BTN_L + 60, y: backY, width: 200, height: 52, alpha: 0.0 })
  backBtn.borderColor = 'transparent'; backBtn.borderWidth = 0
  jsmaf.root.children.push(backBtn)
  const backTxt = new jsmaf.Text()
  if (useImageText) {
    jsmaf.root.children.push(new Image({ url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack' : 'oToGoBack') + '.png', x: CX - 75, y: backY + 8, width: 150, height: 36 }))
  } else {
    backTxt.text = '← ' + (jsmaf.circleIsAdvanceButton ? lang.xToGoBack : lang.oToGoBack)
    backTxt.x = CX - 90; backTxt.y = backY + 16; backTxt.style = 'back'
    jsmaf.root.children.push(backTxt)
  }

  // Scroll arrows
  const arrowUp = new jsmaf.Text(); arrowUp.text = '▲'
  arrowUp.x = CX - 10; arrowUp.y = 150; arrowUp.style = 'scroll'; arrowUp.visible = false
  jsmaf.root.children.push(arrowUp)
  const arrowDn = new jsmaf.Text(); arrowDn.text = '▼'
  arrowDn.x = CX - 10; arrowDn.y = START_Y + MAX_PL * GAP + 4; arrowDn.style = 'scroll'
  jsmaf.root.children.push(arrowDn)

  // Footer
  const footBg = new Image({ url: BTN_URL, x: 0, y: 1046, width: 1920, height: 34, alpha: 0.35 })
  footBg.borderColor = 'transparent'; footBg.borderWidth = 0
  jsmaf.root.children.push(footBg)
  const fh = new jsmaf.Text()
  fh.text = '↑↓  Navigate    X  Launch    O  Back'
  fh.x = CX - 200; fh.y = 1055; fh.style = 'footer'
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
      if (!vis) continue

      const f   = fileList[idx]!
      const sel = idx === cur
      const ext = f.name.split('.').pop()!.toUpperCase()
      let   disp = f.name.replace(/\.(elf|bin|js)$/i, '')
      if (disp.length > 34) disp = disp.slice(0, 32) + '..'

      slotBtns[s]!.alpha       = sel ? 0.22 : 0.10
      slotBtns[s]!.borderColor = sel ? 'rgba(120,200,255,0.75)' : 'rgba(255,255,255,0.14)'
      slotBtns[s]!.borderWidth = sel ? 2 : 1
      slotBars[s]!.alpha       = sel ? 1.0 : 0.30

      slotNums[s]!.text    = String(idx + 1).padStart(2, '0')
      slotBadges[s]!.text  = ext
      slotBadges[s]!.style = sel ? 'bsel' : 'badge'
      slotLabels[s]!.text  = disp
      slotLabels[s]!.style = sel ? 'white' : 'muted'
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
      if (TOTAL > 0) cur = (cur + 1) % TOTAL; sfx(SFX_CUR); clamp(); renderRows()
    } else if (kc === 4 || kc === 7) {
      if (TOTAL > 0) cur = (cur - 1 + TOTAL) % TOTAL; sfx(SFX_CUR); clamp(); renderRows()
    } else if (kc === confirmKey) {
      sfx(SFX_OK); launchPayload()
    } else if (kc === backKey) {
      sfx(SFX_BACK)
      try { include('themes/' + (typeof CONFIG !== 'undefined' && CONFIG.theme ? CONFIG.theme : 'default') + '/main.js') }
      catch (e) { log('Error: ' + (e as Error).message) }
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
  log('Payload host loaded. Files: ' + fileList.length)
})()
