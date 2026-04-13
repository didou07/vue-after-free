import { fn } from 'download0/types'

// ═══════════════════════════════════════════════════════════════════════════
//  VAF Logger  —  detailed logging with timing + save via XHR to save data
//  Works at ALL stages: before jailbreak, during, and after failure.
//  Saves to file://../download0/vaf_log_<fw>_<cfg>.txt (game save folder)
//  User can retrieve via USB Data Transfer from the PS4 system settings.
// ═══════════════════════════════════════════════════════════════════════════

// ── Internal buffer ───────────────────────────────────────────────────────
export const _LOG_LINES: string[] = []
export const _LOG_T0   = Date.now()

// ── Timer stack ───────────────────────────────────────────────────────────
interface TimerEntry { label: string; t: number }
const _timer_stack: TimerEntry[] = []

// ── Per-operation statistics ──────────────────────────────────────────────
export const stats = {
  race_attempts:     0,
  race_wins:         0,
  race_win_attempt:  -1,
  race_timings_ms:   [] as number[],

  spray_count:       0,
  spray_total_ms:    0,

  alias_attempts:    0,
  alias_wins:        0,
  alias_win_attempt: -1,
  alias_timings_ms:  [] as number[],

  clobber_attempts:    0,
  clobber_win_attempt: -1,

  reclaim_attempts:    0,
  reclaim_win_attempt: -1,

  stage_ms: {} as Record<string, number>,
  total_ms: 0,
}

export let last_log_path  = ''
export let last_log_bytes = 0

// ═══════════════════════════════════════════════════════════
//  Core log helpers
// ═══════════════════════════════════════════════════════════

export function xlog (msg: string, level: string = 'LOG') {
  const elapsed = ((Date.now() - _LOG_T0) / 1000).toFixed(3)
  const line    = '[' + elapsed + 's][' + level + '] ' + msg
  log(line)
  _LOG_LINES.push(line)
}

export function xdbg (msg: string) { xlog(msg, 'DBG') }
export function xerr (msg: string) { xlog(msg, 'ERR') }
export function xok  (msg: string) { xlog(msg, ' OK') }
export function xval (label: string, val: string) { xlog(label + ' = ' + val, 'VAL') }

// ═══════════════════════════════════════════════════════════
//  Stage timers
// ═══════════════════════════════════════════════════════════

export function timer_start (label: string): number {
  const t = Date.now()
  _timer_stack.push({ label, t })
  xlog('▶ ' + label, 'TMR')
  return t
}

export function timer_end (override_label?: string): number {
  const entry = _timer_stack.pop()
  const ms    = Date.now() - (entry ? entry.t : Date.now())
  const lbl   = override_label ?? entry?.label ?? '?'
  xlog('◀ ' + lbl + '  →  ' + ms + ' ms', 'TMR')
  return ms
}

export function timer_end_stage (key: string, override_label?: string): number {
  const ms = timer_end(override_label)
  stats.stage_ms[key] = ms
  return ms
}

// ═══════════════════════════════════════════════════════════
//  Race / spray / alias / clobber / reclaim tracking
// ═══════════════════════════════════════════════════════════

export function log_race_attempt (
  attempt:  number, won: boolean,
  poll_hex: string, tcp_hex: string, ms: number
) {
  stats.race_attempts++
  stats.race_timings_ms.push(ms)
  if (won) {
    stats.race_wins++; stats.race_win_attempt = attempt
    xok('Race WON  #' + attempt + '  time=' + ms + 'ms  poll=' + poll_hex + '  tcp=' + tcp_hex)
  } else {
    xdbg('Race MISS #' + attempt + '  time=' + ms + 'ms  poll=' + poll_hex + '  tcp=' + tcp_hex)
  }
}

export function log_spray (loops: number, num_reqs: number, ms: number) {
  stats.spray_count++; stats.spray_total_ms += ms
  xdbg('AIO spray  loops=' + loops + '  reqs=' + num_reqs + '  time=' + ms + 'ms')
}

export function log_alias_attempt (
  attempt: number, won: boolean, ms: number, extra?: string
) {
  stats.alias_attempts++; stats.alias_timings_ms.push(ms)
  if (won) {
    stats.alias_wins++; stats.alias_win_attempt = attempt
    xok('Alias WON  #' + attempt + '  time=' + ms + 'ms' + (extra ? '  ' + extra : ''))
  } else {
    xdbg('Alias MISS #' + attempt + '  time=' + ms + 'ms' + (extra ? '  ' + extra : ''))
  }
}

export function log_clobber_attempt (
  attempt: number, won: boolean, cmd_hex: string, size: number
) {
  stats.clobber_attempts++
  if (won) { stats.clobber_win_attempt = attempt; xok('Clobber WON  #' + attempt + '  cmd=' + cmd_hex + '  size=' + size) }
  else     { xdbg('Clobber MISS #' + attempt + '  cmd=' + cmd_hex + '  size=' + size) }
}

export function log_reclaim_attempt (attempt: number, won: boolean) {
  stats.reclaim_attempts++
  if (won) { stats.reclaim_win_attempt = attempt; xok('Reclaim WON  #' + attempt) }
  else     { xdbg('Reclaim MISS #' + attempt) }
}

// ═══════════════════════════════════════════════════════════
//  Summary builder
// ═══════════════════════════════════════════════════════════

function _avg (arr: number[]): string {
  if (arr.length === 0) return 'N/A'
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)
}
function _min (arr: number[]): number { return arr.length ? Math.min(...arr) : 0 }
function _max (arr: number[]): number { return arr.length ? Math.max(...arr) : 0 }

function build_summary (): string {
  const L: string[] = [
    '', '╔══════════════════════════════════════════════╗',
    '║          EXPLOIT TUNING SUMMARY              ║',
    '╚══════════════════════════════════════════════╝',
    'Total runtime: ' + (stats.total_ms / 1000).toFixed(2) + 's', '',
    '┌─ Stage Timings ────────────────────────────',
  ]
  for (const key of Object.keys(stats.stage_ms)) {
    L.push('│  ' + key.padEnd(28) + stats.stage_ms[key] + ' ms')
  }
  L.push('│')
  L.push('├─ Stage 1: Race Condition ───────────────────')
  L.push('│  Attempts    : ' + stats.race_attempts)
  L.push('│  Won at      : ' + (stats.race_win_attempt >= 0 ? '#' + stats.race_win_attempt : 'NEVER — increase races/grooms'))
  L.push('│  avg/min/max : ' + _avg(stats.race_timings_ms) + ' / ' + _min(stats.race_timings_ms) + ' / ' + _max(stats.race_timings_ms) + ' ms')
  L.push('│')
  L.push('├─ Stage 3: Alias (pktopts) ──────────────────')
  L.push('│  Attempts    : ' + stats.alias_attempts)
  L.push('│  Won at      : ' + (stats.alias_win_attempt >= 0 ? '#' + stats.alias_win_attempt : 'NEVER — increase alias/grooms'))
  L.push('│  avg time    : ' + _avg(stats.alias_timings_ms) + ' ms')
  L.push('│')
  L.push('├─ Recommendations ───────────────────────────')
  if (stats.race_win_attempt < 0)       L.push('  [!] RACE NEVER WON — try more grooms, different CPU core, higher rtprio')
  else if (stats.race_win_attempt < 20) L.push('  [+] Race won early (#' + stats.race_win_attempt + ') — current settings are optimal')
  else if (stats.race_win_attempt > 150) {
    L.push('  [~] Race won late (#' + stats.race_win_attempt + ') — consider:')
    L.push('       • increasing grooms'); L.push('       • trying a different CPU core')
  }
  if (stats.alias_win_attempt < 0) L.push('  [!] ALIAS NEVER WON — increase alias/grooms')
  if (stats.clobber_win_attempt < 0) L.push('  [!] CLOBBER NEVER WON — heap unstable, increase grooms')
  L.push('')
  return L.join('\n')
}

// ═══════════════════════════════════════════════════════════
//  Save log — XHR to game save folder (always works, even
//  before jailbreak / in sandbox)
//  Path: file://../download0/vaf_log_<fw>_<cfg>.txt
//  Retrieve via PS4: Settings → Application Saved Data →
//    USB Storage → Copy (select the game)
// ═══════════════════════════════════════════════════════════

// fn is imported but only used if write_log_direct is called post-jailbreak
// The XHR path is the reliable one. We keep fn import for lapse.ts compatibility.
void fn // suppress unused-import lint warning

export function write_log_to_usb (fw_version: string, config: Record<string, unknown>): boolean {
  if (config.log_to_usb === false) {
    xlog('Logging disabled — skipping save', 'LOG')
    return false
  }

  stats.total_ms = Date.now() - _LOG_T0

  const summary = build_summary()
  const fw      = fw_version.replace('.', '_')
  const core    = config.core    ?? 4
  const grooms  = config.grooms  ?? 512
  const races   = config.races   ?? 100
  const ts      = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  const fname   = 'vaf_' + fw + '_c' + core + '_g' + grooms + '_r' + races + '_' + ts + '.txt'

  const header = [
    '══════════════════════════════════════════════════',
    ' VUE-AFTER-FREE  |  Exploit Log',
    ' Date    : ' + new Date().toISOString(),
    ' FW      : ' + fw_version,
    '──────────────────────────────────────────────────',
    ' core    : ' + core,
    ' grooms  : ' + grooms,
    ' races   : ' + races,
    ' timeout : ' + (config.timeout_s ?? 8) + 's',
    '══════════════════════════════════════════════════',
    '',
  ].join('\n')

  const content = header + _LOG_LINES.join('\n') + '\n' + summary

  // Save to game save data via XHR POST — same mechanism as config.json
  // Always accessible; user retrieves via USB Data Transfer in PS4 settings.
  try {
    const xhr = new jsmaf.XMLHttpRequest()
    xhr.open('POST', 'file://../download0/' + fname, false) // synchronous
    xhr.send(content)
    if (xhr.status === 0 || xhr.status === 200) {
      last_log_path  = '/download0/' + fname
      last_log_bytes = content.length
      xok('Log saved → save data:  ' + fname + '  (' + content.length + ' bytes,  ' + _LOG_LINES.length + ' lines)')
      xlog('Retrieve: PS4 Settings → App Saved Data → USB → Copy', 'LOG')
      return true
    }
    xerr('XHR save failed (status=' + xhr.status + ')')
  } catch (e) {
    xerr('XHR save error: ' + (e as Error).message)
  }

  xlog('Log in memory (' + _LOG_LINES.length + ' lines) — not persisted', 'LOG')
  return false
}
