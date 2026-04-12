import { libc_addr } from 'download0/userland'
import { lang, useImageText, textImageBase } from 'download0/languages'
import { fn, mem, BigInt } from 'download0/types'

if (typeof libc_addr === 'undefined') {
  include('userland.js')
}

if (typeof lang === 'undefined') {
  include('languages.js')
}

(function () {
  log('Loading config UI...')

  const fs = {
    write: function (filename: string, content: string, callback: (error: Error | null) => void) {
      const xhr = new jsmaf.XMLHttpRequest()
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && callback) {
          callback(xhr.status === 0 || xhr.status === 200 ? null : new Error('failed'))
        }
      }
      xhr.open('POST', 'file://../download0/' + filename, true)
      xhr.send(content)
    },

    read: function (filename: string, callback: (error: Error | null, data?: string) => void) {
      const xhr = new jsmaf.XMLHttpRequest()
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && callback) {
          callback(xhr.status === 0 || xhr.status === 200 ? null : new Error('failed'), xhr.responseText)
        }
      }
      xhr.open('GET', 'file://../download0/' + filename, true)
      xhr.send()
    }
  }

  const currentConfig: {
    autolapse: boolean
    autopoop: boolean
    autoclose: boolean
    autoclose_delay: number
    music: boolean
    log_to_usb: boolean
    jb_behavior: number
    theme: string
    exp_core: number
    exp_grooms: number
    exp_races: number
    exp_timeout: number
  } = {
    autolapse: false,
    autopoop: false,
    autoclose: false,
    autoclose_delay: 0,
    music: true,
    log_to_usb: true,
    jb_behavior: 0,
    theme: 'default',
    exp_core: 4,
    exp_grooms: 512,
    exp_races: 100,
    exp_timeout: 8
  }

  // Store user's payloads so we don't overwrite them
  let userPayloads: string[] = []
  let configLoaded = false

  const jbBehaviorLabels = [lang.jbBehaviorAuto, lang.jbBehaviorNetctrl, lang.jbBehaviorLapse]
  const jbBehaviorImgKeys = ['jbBehaviorAuto', 'jbBehaviorNetctrl', 'jbBehaviorLapse']

  function scanThemes (): string[] {
    const themes: string[] = []
    try {
      fn.register(0x05, 'open_sys', ['bigint', 'bigint', 'bigint'], 'bigint')
      fn.register(0x06, 'close_sys', ['bigint'], 'bigint')
      fn.register(0x110, 'getdents', ['bigint', 'bigint', 'bigint'], 'bigint')

      const themesDir = '/download0/themes'
      const path_addr = mem.malloc(256)
      const buf = mem.malloc(4096)

      for (let i = 0; i < themesDir.length; i++) {
        mem.view(path_addr).setUint8(i, themesDir.charCodeAt(i))
      }
      mem.view(path_addr).setUint8(themesDir.length, 0)

      const fd = fn.open_sys(path_addr, new BigInt(0, 0), new BigInt(0, 0))
      if (!fd.eq(new BigInt(0xffffffff, 0xffffffff))) {
        const count = fn.getdents(fd, buf, new BigInt(0, 4096))
        if (!count.eq(new BigInt(0xffffffff, 0xffffffff)) && count.lo > 0) {
          let offset = 0
          while (offset < count.lo) {
            const d_reclen = mem.view(buf.add(new BigInt(0, offset + 4))).getUint16(0, true)
            const d_type = mem.view(buf.add(new BigInt(0, offset + 6))).getUint8(0)
            const d_namlen = mem.view(buf.add(new BigInt(0, offset + 7))).getUint8(0)
            let name = ''
            for (let i = 0; i < d_namlen; i++) {
              name += String.fromCharCode(mem.view(buf.add(new BigInt(0, offset + 8 + i))).getUint8(0))
            }
            if (d_type === 4 && name !== '.' && name !== '..') {
              themes.push(name)
            }
            offset += d_reclen
          }
        }
        fn.close_sys(fd)
      }
    } catch (e) {
      log('Theme scan failed: ' + (e as Error).message)
    }

    const idx = themes.indexOf('default')
    if (idx > 0) {
      themes.splice(idx, 1)
      themes.unshift('default')
    } else if (idx < 0) {
      themes.unshift('default')
    }

    return themes
  }

  const availableThemes = scanThemes()
  log('Discovered themes: ' + availableThemes.join(', '))
  const themeLabels: string[] = availableThemes.map((theme: string) => theme.charAt(0).toUpperCase() + theme.slice(1))
  const themeImgKeys: string[] = availableThemes.map((theme: string) => 'theme' + theme.charAt(0).toUpperCase() + theme.slice(1))

  let currentButton = 0
  const buttons: Image[] = []
  const buttonTexts: jsmaf.Text[] = []
  const buttonMarkers: (Image | null)[] = []
  const buttonOrigPos: { x: number; y: number }[] = []
  const textOrigPos: { x: number; y: number }[] = []
  const valueTexts: Image[] = []

  const normalButtonImg = 'file:///assets/img/button_over_9.png'
  const selectedButtonImg = 'file:///assets/img/button_over_9.png'

  // ── Sound helpers ────────────────────────────────────────────────────────────
  const SFX_CURSOR  = 'file:///../download0/sfx/cursor.wav'
  const SFX_CONFIRM = 'file:///../download0/sfx/confirm.wav'
  const SFX_CANCEL  = 'file:///../download0/sfx/cancel.wav'

  function playSound (url: string) {
    try {
      const clip = new jsmaf.AudioClip()
      clip.volume = 1.0
      clip.open(url)
    } catch (e) {
      log('SFX error: ' + (e as Error).message)
    }
  }

  jsmaf.root.children.length = 0

  // ── Fallout 4 Terminal Styles ──────────────────────────────────────────────
  new Style({ name: 'white',           color: 'rgb(0,220,0)',  size: 24 })
  new Style({ name: 'title',           color: 'rgb(0,240,0)',  size: 32 })
  new Style({ name: 'terminal',        color: 'rgb(0,220,0)',  size: 22 })
  new Style({ name: 'terminal_shadow', color: 'rgb(0,0,0)',    size: 22 })
  new Style({ name: 'dim_text',        color: 'rgb(6,200,6)',  size: 20 })
  new Style({ name: 'prompt',          color: 'rgb(0,240,0)',  size: 22 })

  // ── Background ────────────────────────────────────────────────────────────
  const background = new Image({
    url: 'file:///../download0/img/FalloutBG.png',
    x: 0, y: 0, width: 1920, height: 1080
  })
  background.alpha = 0.6
  jsmaf.root.children.push(background)

  // Dark overlay for readability
  const overlay = new Image({
    url: 'file:///../download0/img/FalloutBG.png',
    x: 0, y: 0, width: 1920, height: 1080
  })
  overlay.alpha = 0.45
  jsmaf.root.children.push(overlay)

  // ── Terminal Header ───────────────────────────────────────────────────────
  const termHeaders = [
    '>PIP SET >D:TERMINAL',
    '>PIP SET >D:"FILE/PROTECTION=OWNER -R/W READY"',
    '>PIP SET >D:FrontEnd',
    '>PIP SET >D:DevMode',
    '>PIP SET >D:Fallout/Config_ui.js',
  ]
  termHeaders.forEach((text, i) => {
    const t = new jsmaf.Text()
    t.text = text; t.x = 100; t.y = 30 + i * 20; t.style = 'dim_text'
    jsmaf.root.children.push(t)
  })

  const dividerTop = new jsmaf.Text()
  dividerTop.text = '___________________________________________________________________________________'
  dividerTop.x = 100; dividerTop.y = 148; dividerTop.style = 'terminal'
  jsmaf.root.children.push(dividerTop)

  // ── Title ─────────────────────────────────────────────────────────────────
  if (useImageText) {
    const title = new Image({
      url: textImageBase + 'config.png',
      x: 860, y: 160, width: 200, height: 60
    })
    jsmaf.root.children.push(title)
  } else {
    const title = new jsmaf.Text()
    title.text = '>> ' + lang.config.toUpperCase() + ' <<'
    title.x = 820; title.y = 168; title.style = 'title'
    jsmaf.root.children.push(title)
  }

  const configOptions = [
    { key: 'autolapse',   label: lang.autoLapse,         imgKey: 'autoLapse',  type: 'toggle' },
    { key: 'autopoop',    label: lang.autoPoop,           imgKey: 'autoPoop',   type: 'toggle' },
    { key: 'autoclose',   label: lang.autoClose,          imgKey: 'autoClose',  type: 'toggle' },
    { key: 'music',       label: lang.music,              imgKey: 'music',      type: 'toggle' },
    { key: 'log_to_usb',  label: 'Log to USB',            imgKey: 'music',      type: 'toggle' },
    { key: 'jb_behavior', label: lang.jbBehavior,         imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'theme',       label: lang.theme || 'Theme',   imgKey: 'theme',      type: 'cycle'  },
    { key: 'exp_core',    label: 'CPU Core (0-5)',        imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_grooms',  label: 'Heap Grooms',           imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_races',   label: 'Race Attempts',         imgKey: 'jbBehavior', type: 'cycle'  },
    { key: 'exp_timeout', label: 'Timeout (s)',           imgKey: 'jbBehavior', type: 'cycle'  },
  ]

  const centerX = 960
  const startY = 200
  const buttonSpacing = 105
  const buttonWidth = 400
  const buttonHeight = 80

  for (let i = 0; i < configOptions.length; i++) {
    const configOption = configOptions[i]!
    const btnX = centerX - buttonWidth / 2
    const btnY = startY + i * buttonSpacing

    const button = new Image({
      url: normalButtonImg,
      x: btnX,
      y: btnY,
      width: buttonWidth,
      height: buttonHeight
    })
    buttons.push(button)
    jsmaf.root.children.push(button)

    buttonMarkers.push(null)

    let btnText: Image | jsmaf.Text
    if (useImageText) {
      btnText = new Image({
        url: textImageBase + configOption.imgKey + '.png',
        x: btnX + 20,
        y: btnY + 15,
        width: 200,
        height: 50
      })
    } else {
      btnText = new jsmaf.Text()
      btnText.text = configOption.label
      btnText.x = btnX + 30
      btnText.y = btnY + 28
      btnText.style = 'white'
    }
    buttonTexts.push(btnText)
    jsmaf.root.children.push(btnText)

    if (configOption.type === 'toggle') {
      const checkmark = new Image({
        url: currentConfig[configOption.key as keyof typeof currentConfig] ? 'file:///assets/img/check_small_on.png' : 'file:///assets/img/check_small_off.png',
        x: btnX + 320,
        y: btnY + 20,
        width: 40,
        height: 40
      })
      valueTexts.push(checkmark)
      jsmaf.root.children.push(checkmark)
    } else {
      let valueLabel: Image | jsmaf.Text
      if (configOption.key === 'jb_behavior') {
        if (useImageText) {
          valueLabel = new Image({
            url: textImageBase + jbBehaviorImgKeys[currentConfig.jb_behavior] + '.png',
            x: btnX + 230,
            y: btnY + 15,
            width: 150,
            height: 50
          })
        } else {
          valueLabel = new jsmaf.Text()
          valueLabel.text = jbBehaviorLabels[currentConfig.jb_behavior] || jbBehaviorLabels[0]!
          valueLabel.x = btnX + 250
          valueLabel.y = btnY + 28
          valueLabel.style = 'white'
        }
      } else if (configOption.key === 'theme') {
        const themeIndex = availableThemes.indexOf(currentConfig.theme)
        const displayIndex = themeIndex >= 0 ? themeIndex : 0

        valueLabel = new jsmaf.Text()
        valueLabel.text = themeLabels[displayIndex] || themeLabels[0]!
        valueLabel.x = btnX + 250
        valueLabel.y = btnY + 28
        valueLabel.style = 'white'
      }
      valueTexts.push(valueLabel)
      jsmaf.root.children.push(valueLabel)
    }

    buttonOrigPos.push({ x: btnX, y: btnY })
    textOrigPos.push({ x: btnText.x, y: btnText.y })
  }

  let backHint: Image | jsmaf.Text
  if (useImageText) {
    backHint = new Image({
      url: textImageBase + (jsmaf.circleIsAdvanceButton ? 'xToGoBack.png' : 'oToGoBack.png'),
      x: centerX - 60,
      y: startY + configOptions.length * buttonSpacing + 60,
      width: 150,
      height: 40
    })
  } else {
    backHint = new jsmaf.Text()
    backHint.text = jsmaf.circleIsAdvanceButton ? lang.xToGoBack : lang.oToGoBack
    backHint.x = centerX - 60
    backHint.y = startY + configOptions.length * buttonSpacing + 60
    backHint.style = 'white'
  }
  jsmaf.root.children.push(backHint)

  let zoomInInterval: number | null = null
  let zoomOutInterval: number | null = null
  let prevButton = -1

  function easeInOut (t: number) {
    return (1 - Math.cos(t * Math.PI)) / 2
  }

  function animateZoomIn (btn: Image, text: jsmaf.Text, btnOrigX: number, btnOrigY: number, textOrigX: number, textOrigY: number) {
    if (zoomInInterval) jsmaf.clearInterval(zoomInInterval)
    const btnW = buttonWidth
    const btnH = buttonHeight
    const startScale = btn.scaleX || 1.0
    const endScale = 1.1
    const duration = 175
    let elapsed = 0
    const step = 16

    zoomInInterval = jsmaf.setInterval(function () {
      elapsed += step
      const t = Math.min(elapsed / duration, 1)
      const eased = easeInOut(t)
      const scale = startScale + (endScale - startScale) * eased

      btn.scaleX = scale
      btn.scaleY = scale
      btn.x = btnOrigX - (btnW * (scale - 1)) / 2
      btn.y = btnOrigY - (btnH * (scale - 1)) / 2
      text.scaleX = scale
      text.scaleY = scale
      text.x = textOrigX - (btnW * (scale - 1)) / 2
      text.y = textOrigY - (btnH * (scale - 1)) / 2

      if (t >= 1) {
        jsmaf.clearInterval(zoomInInterval ?? -1)
        zoomInInterval = null
      }
    }, step)
  }

  function animateZoomOut (btn: Image, text: jsmaf.Text, btnOrigX: number, btnOrigY: number, textOrigX: number, textOrigY: number) {
    if (zoomOutInterval) jsmaf.clearInterval(zoomOutInterval)
    const btnW = buttonWidth
    const btnH = buttonHeight
    const startScale = btn.scaleX || 1.1
    const endScale = 1.0
    const duration = 175
    let elapsed = 0
    const step = 16

    zoomOutInterval = jsmaf.setInterval(function () {
      elapsed += step
      const t = Math.min(elapsed / duration, 1)
      const eased = easeInOut(t)
      const scale = startScale + (endScale - startScale) * eased

      btn.scaleX = scale
      btn.scaleY = scale
      btn.x = btnOrigX - (btnW * (scale - 1)) / 2
      btn.y = btnOrigY - (btnH * (scale - 1)) / 2
      text.scaleX = scale
      text.scaleY = scale
      text.x = textOrigX - (btnW * (scale - 1)) / 2
      text.y = textOrigY - (btnH * (scale - 1)) / 2

      if (t >= 1) {
        jsmaf.clearInterval(zoomOutInterval ?? -1)
        zoomOutInterval = null
      }
    }, step)
  }

  function updateHighlight () {
    // Animate out the previous button
    const prevButtonObj = buttons[prevButton]
    const buttonMarker = buttonMarkers[prevButton]
    if (prevButton >= 0 && prevButton !== currentButton && prevButtonObj) {
      prevButtonObj.url = normalButtonImg
      prevButtonObj.alpha = 0.7
      prevButtonObj.borderColor = 'transparent'
      prevButtonObj.borderWidth = 0
      if (buttonMarker) buttonMarker.visible = false
      animateZoomOut(prevButtonObj, buttonTexts[prevButton]!, buttonOrigPos[prevButton]!.x, buttonOrigPos[prevButton]!.y, textOrigPos[prevButton]!.x, textOrigPos[prevButton]!.y)
    }

    // Set styles for all buttons
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]
      const buttonMarker = buttonMarkers[i]
      const buttonText = buttonTexts[i]
      const buttonOrigPos_ = buttonOrigPos[i]
      const textOrigPos_ = textOrigPos[i]
      if (button === undefined || buttonText === undefined || buttonOrigPos_ === undefined || textOrigPos_ === undefined) continue
      if (i === currentButton) {
        button.url = selectedButtonImg
        button.alpha = 1.0
        button.borderColor = 'rgb(0,230,0)'
        button.borderWidth = 3
        if (buttonMarker) buttonMarker.visible = true
        animateZoomIn(button, buttonText, buttonOrigPos_.x, buttonOrigPos_.y, textOrigPos_.x, textOrigPos_.y)
      } else if (i !== prevButton) {
        button.url = normalButtonImg
        button.alpha = 0.7
        button.borderColor = 'transparent'
        button.borderWidth = 0
        button.scaleX = 1.0
        button.scaleY = 1.0
        button.x = buttonOrigPos_.x
        button.y = buttonOrigPos_.y
        buttonText.scaleX = 1.0
        buttonText.scaleY = 1.0
        buttonText.x = textOrigPos_.x
        buttonText.y = textOrigPos_.y
        if (buttonMarker) buttonMarker.visible = false
      }
    }

    prevButton = currentButton
  }

  function updateValueText (index: number) {
    const options = configOptions[index]
    const valueText = valueTexts[index]
    if (!options || !valueText) return
    const key = options.key
    if (options.type === 'toggle') {
      const value = currentConfig[key as keyof typeof currentConfig]
      valueText.url = value ? 'file:///assets/img/check_small_on.png' : 'file:///assets/img/check_small_off.png'
    } else {
      if (key === 'jb_behavior') {
        if (useImageText) {
          (valueText as Image).url = textImageBase + jbBehaviorImgKeys[currentConfig.jb_behavior] + '.png'
        } else {
          (valueText as jsmaf.Text).text = jbBehaviorLabels[currentConfig.jb_behavior] || jbBehaviorLabels[0]
        }
      } else if (key === 'theme') {
        const themeIndex = availableThemes.indexOf(currentConfig.theme)
        const displayIndex = themeIndex >= 0 ? themeIndex : 0;

        (valueText as jsmaf.Text).text = themeLabels[displayIndex] || themeLabels[0]!
      }
    }
  }

  function saveConfig (onDone?: () => void) {
    if (!configLoaded) {
      log('Config not loaded yet, skipping save')
      if (onDone) onDone()
      return
    }
    const configData = {
      config: {
        autolapse:       currentConfig.autolapse,
        autopoop:        currentConfig.autopoop,
        autoclose:       currentConfig.autoclose,
        autoclose_delay: currentConfig.autoclose_delay,
        music:           currentConfig.music,
        jb_behavior:     currentConfig.jb_behavior,
        theme:           currentConfig.theme,
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

    const configContent = JSON.stringify(configData, null, 2)

    fs.write('config.json', configContent, function (err) {
      if (err) {
        log('ERROR: Failed to save config: ' + err.message)
      } else {
        log('Config saved successfully')
      }
      if (onDone) onDone()
    })
  }

  function loadConfig () {
    fs.read('config.json', function (err: Error | null, data?: string) {
      if (err) {
        log('ERROR: Failed to read config: ' + err.message)
        return
      }

      try {
        const configData = JSON.parse(data || '{}')

        if (configData.config) {
          const CONFIG = configData.config

          currentConfig.autolapse = CONFIG.autolapse || false
          currentConfig.autopoop = CONFIG.autopoop || false
          currentConfig.autoclose = CONFIG.autoclose || false
          currentConfig.autoclose_delay = CONFIG.autoclose_delay || 0
          currentConfig.music = CONFIG.music !== false
          currentConfig.jb_behavior = CONFIG.jb_behavior || 0

          // Validate and set theme (themes are auto-discovered from directory scan)
          if (CONFIG.theme && availableThemes.includes(CONFIG.theme)) {
            currentConfig.theme = CONFIG.theme
          } else {
            log('WARNING: Theme "' + (CONFIG.theme || 'undefined') + '" not found in available themes, using default')
            currentConfig.theme = availableThemes[0] || 'fallout'
          }

          // Load exploit settings
          if (CONFIG.log_to_usb !== undefined) currentConfig.log_to_usb = CONFIG.log_to_usb
          if (CONFIG.exploit) {
            const ex = CONFIG.exploit
            if (ex.core      !== undefined) currentConfig.exp_core    = ex.core
            if (ex.grooms    !== undefined) currentConfig.exp_grooms  = ex.grooms
            if (ex.races     !== undefined) currentConfig.exp_races   = ex.races
            if (ex.timeout_s !== undefined) currentConfig.exp_timeout = ex.timeout_s
            if (ex.log_to_usb!== undefined) currentConfig.log_to_usb  = ex.log_to_usb
          }

          // Preserve user's payloads
          if (configData.payloads && Array.isArray(configData.payloads)) {
            userPayloads = configData.payloads.slice()
          }

          for (let i = 0; i < configOptions.length; i++) {
            updateValueText(i)
          }
          if (currentConfig.music) {
            startBgmIfEnabled()
          } else {
            stopBgm()
          }
          configLoaded = true
          log('Config loaded successfully')
        }
      } catch (e) {
        log('ERROR: Failed to parse config: ' + (e as Error).message)
        configLoaded = true // Allow saving even on error
      }
    })
  }

  function handleButtonPress () {
    if (currentButton < configOptions.length) {
      const option = configOptions[currentButton]!
      const key = option.key

      if (option.type === 'cycle') {
        if (key === 'jb_behavior') {
          currentConfig.jb_behavior = (currentConfig.jb_behavior + 1) % jbBehaviorLabels.length
          log(key + ' = ' + jbBehaviorLabels[currentConfig.jb_behavior])
        } else if (key === 'theme') {
          const themeIndex = availableThemes.indexOf(currentConfig.theme)
          const displayIndex = themeIndex >= 0 ? themeIndex : 0
          const nextIndex = (displayIndex + 1) % availableThemes.length
          currentConfig.theme = availableThemes[nextIndex]!
          log(key + ' = ' + currentConfig.theme)
        } else if (key === 'exp_core') {
          currentConfig.exp_core = (currentConfig.exp_core + 1) % 6
          log(key + ' = Core ' + currentConfig.exp_core)
        } else if (key === 'exp_grooms') {
          const v = [128, 256, 512, 768, 1024, 1280]
          const i = v.indexOf(currentConfig.exp_grooms)
          currentConfig.exp_grooms = v[(i + 1) % v.length]!
          log(key + ' = ' + currentConfig.exp_grooms)
        } else if (key === 'exp_races') {
          const v = [50, 75, 100, 150, 200, 300]
          const i = v.indexOf(currentConfig.exp_races)
          currentConfig.exp_races = v[(i + 1) % v.length]!
          log(key + ' = ' + currentConfig.exp_races)
        } else if (key === 'exp_timeout') {
          const v = [5, 8, 10, 15, 20]
          const i = v.indexOf(currentConfig.exp_timeout)
          currentConfig.exp_timeout = v[(i + 1) % v.length]!
          log(key + ' = ' + currentConfig.exp_timeout + 's')
        }
      } else {
        const boolKey = key as 'autolapse' | 'autopoop' | 'autoclose' | 'music' | 'log_to_usb'
        currentConfig[boolKey] = !currentConfig[boolKey]

        if (boolKey === 'music') {
          if (typeof CONFIG !== 'undefined') {
            CONFIG.music = currentConfig.music
          }
          if (currentConfig.music) {
            startBgmIfEnabled()
          } else {
            stopBgm()
          }
        }

        if (key === 'autolapse' && currentConfig.autolapse === true) {
          currentConfig.autopoop = false
          for (let i = 0; i < configOptions.length; i++) {
            if (configOptions[i]!.key === 'autopoop') {
              updateValueText(i)
              break
            }
          }
          log('autopoop disabled (autolapse enabled)')
        } else if (key === 'autopoop' && currentConfig.autopoop === true) {
          currentConfig.autolapse = false
          for (let i = 0; i < configOptions.length; i++) {
            if (configOptions[i]!.key === 'autolapse') {
              updateValueText(i)
              break
            }
          }
          log('autolapse disabled (autopoop enabled)')
        }

        log(key + ' = ' + currentConfig[boolKey])
      }

      updateValueText(currentButton)
      saveConfig()
    }
  }

  const confirmKey = jsmaf.circleIsAdvanceButton ? 13 : 14
  const backKey = jsmaf.circleIsAdvanceButton ? 14 : 13

  jsmaf.onKeyDown = function (keyCode) {
    if (keyCode === 6 || keyCode === 5) {
      currentButton = (currentButton + 1) % buttons.length
      playSound(SFX_CURSOR)
      updateHighlight()
    } else if (keyCode === 4 || keyCode === 7) {
      currentButton = (currentButton - 1 + buttons.length) % buttons.length
      playSound(SFX_CURSOR)
      updateHighlight()
    } else if (keyCode === confirmKey) {
      playSound(SFX_CONFIRM)
      handleButtonPress()
    } else if (keyCode === backKey) {
      log('Saving and restarting...')
      playSound(SFX_CANCEL)
      saveConfig(function () {
        debugging.restart()
      })
    }
  }

  updateHighlight()
  loadConfig()

  // ── Fallout Footer ────────────────────────────────────────────────────────
  const footerLine = new jsmaf.Text()
  footerLine.text  = '___________________________________________________________________________________'
  footerLine.x = 100; footerLine.y = 960; footerLine.style = 'terminal'
  jsmaf.root.children.push(footerLine)

  const footerStatus = new jsmaf.Text()
  footerStatus.text  = '>Vue after Free 2.0 compatible'
  footerStatus.x = 100; footerStatus.y = 990; footerStatus.style = 'prompt'
  jsmaf.root.children.push(footerStatus)

  log('Fallout Config UI loaded.')
})()
