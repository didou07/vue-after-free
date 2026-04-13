// ═══════════════════════════════════════════════════════════════════════════
//  VAF Logger — detailed timing log for tuning exploit parameters
//  All output goes via the existing log() / ws.broadcast() pipeline
//  (serve.js overrides log() to broadcast over WebSocket — ws.py on PC
//   captures everything in real-time automatically)
// ═══════════════════════════════════════════════════════════════════════════

export const _LOG_T0 = Date.now()

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

// ═══════════════════════════════════════════════════════════
//  Core helpers — wrap log() with timing prefix
// ═══════════════════════════════════════════════════════════

export function xlog (msg: string, level: string = 'LOG') {
  const elapsed = ((Date.now() - _LOG_T0) / 1000).toFixed(3)
  log('[' + elapsed + 's][' + level + '] ' + msg)
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
  xlog('◀ ' + (override_label ?? entry?.label ?? '?') + '  →  ' + ms + ' ms', 'TMR')
  return ms
}

export function timer_end_stage (key: string, override_label?: string): number {
  const ms = timer_end(override_label)
  stats.stage_ms[key] = ms
  return ms
}

// ═══════════════════════════════════════════════════════════
//  Operation tracking
// ═══════════════════════════════════════════════════════════

export function log_race_attempt (
  attempt: number, won: boolean,
  poll_hex: string, tcp_hex: string, ms: number
) {
  stats.race_attempts++; stats.race_timings_ms.push(ms)
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
//  Summary — printed at end of exploit via log()
// ═══════════════════════════════════════════════════════════

function _avg (a: number[]): string {
  return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 'N/A'
}
function _min (a: number[]): number { return a.length ? Math.min(...a) : 0 }
function _max (a: number[]): number { return a.length ? Math.max(...a) : 0 }

export function print_summary () {
  stats.total_ms = Date.now() - _LOG_T0
  const L = [
    '╔══════════════════════════════════════════════╗',
    '║         EXPLOIT TUNING SUMMARY               ║',
    '╚══════════════════════════════════════════════╝',
    'Total runtime: ' + (stats.total_ms / 1000).toFixed(2) + 's',
    '── Stage Timings ───────────────────────────────',
  ]
  for (const k of Object.keys(stats.stage_ms)) L.push('  ' + k.padEnd(28) + stats.stage_ms[k] + ' ms')
  L.push('── Stage 1: Race ───────────────────────────────')
  L.push('  Attempts : ' + stats.race_attempts)
  L.push('  Won at   : ' + (stats.race_win_attempt >= 0 ? '#' + stats.race_win_attempt : 'NEVER'))
  L.push('  avg/min/max ms: ' + _avg(stats.race_timings_ms) + ' / ' + _min(stats.race_timings_ms) + ' / ' + _max(stats.race_timings_ms))
  L.push('── Stage 3: Alias ──────────────────────────────')
  L.push('  Attempts : ' + stats.alias_attempts)
  L.push('  Won at   : ' + (stats.alias_win_attempt >= 0 ? '#' + stats.alias_win_attempt : 'NEVER'))
  L.push('── Recommendations ─────────────────────────────')
  if (stats.race_win_attempt < 0)       L.push('  [!] RACE NEVER WON — try more grooms or different core')
  else if (stats.race_win_attempt < 20) L.push('  [+] Race won early — settings optimal')
  else if (stats.race_win_attempt > 150) L.push('  [~] Race won late — consider more grooms or different core')
  if (stats.alias_win_attempt < 0)      L.push('  [!] ALIAS NEVER WON — increase alias/grooms')
  if (stats.clobber_win_attempt < 0)    L.push('  [!] CLOBBER NEVER WON — increase grooms')
  for (const line of L) log(line)
}
