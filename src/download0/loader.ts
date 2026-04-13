import { libc_addr } from 'download0/userland'
import { fn, mem, BigInt, utils } from 'download0/types'
import { sysctlbyname } from 'download0/kernel'
import { lapse } from 'download0/lapse'
import { binloader_init } from 'download0/binloader'
import { checkJailbroken } from 'download0/check-jailbroken'
import { xlog, xerr, xok, timer_start, timer_end_stage } from 'download0/logger'

if (jsmaf.loader_has_run) {
  throw new Error('loader already ran')
}
jsmaf.loader_has_run = true

// Now load all scripts
if (typeof libc_addr === 'undefined') {
  include('userland.js')
}
include('logger.js')       // after userland — needs fn/utils
include('binloader.js')
include('lapse.js')
include('kernel.js')
include('check-jailbroken.js')
log('All scripts loaded')

export function show_success (immediate?: boolean) {
  log('Jailbreak successful!')
}

if (typeof startBgmIfEnabled === 'function') {
  startBgmIfEnabled()
}

const is_jailbroken = checkJailbroken()
const themeFolder = (typeof CONFIG !== 'undefined' && typeof CONFIG.theme === 'string') ? CONFIG.theme : 'default'

// ── Minimal helpers (avoid circular dep) ────────────────────────────────
function _write64 (addr: BigInt, val: BigInt | number) {
  mem.view(addr).setBigInt(0, new BigInt(val), true)
}
function _read8 (addr: BigInt) { return mem.view(addr).getUint8(0) }
function _malloc (size: number) { return mem.malloc(size) }

function get_fwversion_loader () {
  const buf  = _malloc(0x8)
  const size = _malloc(0x8)
  _write64(size, 0x8)
  if (sysctlbyname('kern.sdk_version', buf, size, 0, 0)) {
    const minor = Number(_read8(buf.add(2)))
    const major = Number(_read8(buf.add(3)))
    return major.toString(16) + '.' + minor.toString(16).padStart(2, '0')
  }
  return null
}

function is_exploit_complete () {
  fn.register(24,  'getuid_l',        [], 'bigint')
  fn.register(585, 'is_in_sandbox_l', [], 'bigint')
  try {
    return fn.getuid_l().eq(0) && fn.is_in_sandbox_l().eq(0)
  } catch (e) {
    return false
  }
}

const _cmp = (a: string, b: string) => {
  const [amaj, amin] = a.split('.').map(Number)
  const [bmaj, bmin] = b.split('.').map(Number)
  return amaj === bmaj ? amin! - bmin! : amaj! - bmaj!
}

// ── Main ─────────────────────────────────────────────────────────────────
const FW_VERSION: string | null = get_fwversion_loader()

if (FW_VERSION === null) {
  xerr('Failed to determine FW version')
  throw new Error('Failed to determine FW version')
}

if (!is_jailbroken) {
  const _ec       = (typeof CONFIG !== 'undefined' && CONFIG.exploit)        ? CONFIG.exploit        : {}
  const jb_behav  = (typeof CONFIG !== 'undefined' && typeof CONFIG.jb_behavior === 'number') ? CONFIG.jb_behavior : 0

  utils.notify(FW_VERSION + ' Detected!')

  xlog('╔══════════════════════════════════════╗')
  xlog('║   VAF Loader — ' + FW_VERSION + '              ║')
  xlog('╚══════════════════════════════════════╝')
  xlog('core='    + (_ec.core    ?? 4)  +
       '  rtprio='  + (_ec.rtprio  ?? 256) +
       '  grooms='  + (_ec.grooms  ?? 512) +
       '  races='   + (_ec.races   ?? 100) +
       '  alias='   + (_ec.alias   ?? 100) +
       '  timeout=' + (_ec.timeout_s ?? 8) + 's')

  let use_lapse = false

  if (jb_behav === 1) {
    xlog('JB Behavior: NetControl (forced)')
    include('netctrl_c0w_twins.js')
  } else if (jb_behav === 2) {
    xlog('JB Behavior: Lapse (forced)')
    use_lapse = true
    lapse()
  } else {
    xlog('JB Behavior: Auto Detect')
    if (_cmp(FW_VERSION, '7.00') >= 0 && _cmp(FW_VERSION, '12.02') <= 0) {
      use_lapse = true
      lapse()
    } else if (_cmp(FW_VERSION, '12.50') >= 0 && _cmp(FW_VERSION, '13.00') <= 0) {
      include('netctrl_c0w_twins.js')
    }
  }

  // ── Poll for completion ───────────────────────────────────────────────
  if (use_lapse) {
    const t_start   = Date.now()
    const timeout_s = (_ec.timeout_s !== undefined) ? _ec.timeout_s : 8
    const timeout_ms = timeout_s * 1000

    xlog('Polling (timeout=' + timeout_s + 's)...')
    timer_start('Loader: poll for completion')

    while (!is_exploit_complete()) {
      if (Date.now() - t_start > timeout_ms) {
        xerr('TIMEOUT after ' + ((Date.now() - t_start) / 1000).toFixed(1) + 's')
        timer_end_stage('loader_timeout', 'Poll TIMEOUT')
        throw new Error('Lapse failed! restart and try again...')
      }
      const s = Date.now(); while (Date.now() - s < 500) {}
    }

    xok('Exploit complete in ' + ((Date.now() - t_start) / 1000).toFixed(2) + 's')
    timer_end_stage('loader_poll', 'Poll: done')

    // ── Binloader ───────────────────────────────────────────────────────
    log('Initializing binloader...')
    timer_start('Binloader')
    try {
      binloader_init()
      xok('Binloader OK')
      timer_end_stage('binloader')
    } catch (e) {
      xerr('Binloader FAILED: ' + (e as Error).message)
      if ((e as Error).stack) xerr((e as Error).stack!)
      timer_end_stage('binloader', 'Binloader FAILED')
      throw e
    }
  }

} else {
  utils.notify('Already Jailbroken!')
  xlog('Already jailbroken — skipping exploit')
  try { include('themes/' + themeFolder + '/main.js') } catch (_e) { /* sandbox already escaped */ }
}

export function run_binloader () {
  log('Initializing binloader...')
  timer_start('run_binloader')
  try {
    binloader_init()
    xok('Binloader OK')
    timer_end_stage('run_binloader')
  } catch (e) {
    xerr('run_binloader FAILED: ' + (e as Error).message)
    if ((e as Error).stack) xerr((e as Error).stack!)
    timer_end_stage('run_binloader', 'FAILED')
    throw e
  }
}
