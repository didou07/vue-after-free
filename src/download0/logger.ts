import { fn, utils } from 'download0/types'

// ── Internal buffer ───────────────────────────────────────────────────────
export const _LOG_LINES: string[] = []
export const _LOG_T0   = Date.now()

// ── Timer stack (for nested timings) ─────────────────────────────────────
interface TimerEntry { label: string; t: number }
const _timer_stack: TimerEntry[] = []

// ── Per-operation statistics (for tuning recommendations) ─────────────────
export const stats = {
  // Race
  race_attempts:    0,
  race_wins:        0,
  race_win_attempt: -1,
  race_timings_ms:  [] as number[],

  // AIO spray
  spray_count:      0,
  spray_total_ms:   0,

  // Aliasing (pktopts)
  alias_attempts:   0,
  alias_wins:       0,
  alias_win_attempt: -1,
  alias_timings_ms: [] as number[],

  // Clobber (rthdr overwrite)
  clobber_attempts:   0,
  clobber_win_attempt: -1,

  // Reclaim socket search
  reclaim_attempts:   0,
  reclaim_win_attempt: -1,

  // Stage timings (ms)
  stage_ms: {} as Record<string, number>,
  total_ms: 0,
}

// ═══════════════════════════════════════════════════════════
//  Core log helpers
// ═══════════════════════════════════════════════════════════

export function xlog (msg: string, level: string = 'LOG') {
  const elapsed = ((Date.now() - _LOG_T0) / 1000).toFixed(3)
  const line    = '[' + elapsed + 's][' + level + '] ' + msg
  log(line)            // native jsmaf log (goes to UI)
  _LOG_LINES.push(line)
}

export function xdbg (msg: string) { xlog(msg, 'DBG') }
export function xerr (msg: string) { xlog(msg, 'ERR') }
export function xok  (msg: string) { xlog(msg, ' OK') }
export function xval (label: string, val: string) {
  xlog(label + ' = ' + val, 'VAL')
}

// ═══════════════════════════════════════════════════════════
//  Stage timers
// ═══════════════════════════════════════════════════════════

/** Start a named timer and push it on the stack */
export function timer_start (label: string): number {
  const t = Date.now()
  _timer_stack.push({ label, t })
  xlog('▶ ' + label, 'TMR')
  return t
}

/** Pop timer, log duration, return ms */
export function timer_end (override_label?: string): number {
  const entry = _timer_stack.pop()
  const ms    = Date.now() - (entry ? entry.t : Date.now())
  const lbl   = override_label ?? entry?.label ?? '?'
  xlog('◀ ' + lbl + '  →  ' + ms + ' ms', 'TMR')
  return ms
}

/** Pop timer, log duration, AND save to stats.stage_ms */
export function timer_end_stage (key: string, override_label?: string): number {
  const ms = timer_end(override_label)
  stats.stage_ms[key] = ms
  return ms
}

// ═══════════════════════════════════════════════════════════
//  Race tracking  (Stage 1)
// ═══════════════════════════════════════════════════════════

export function log_race_attempt (
  attempt:   number,
  won:       boolean,
  poll_hex:  string,
  tcp_hex:   string,
  ms:        number
) {
  stats.race_attempts++
  stats.race_timings_ms.push(ms)

  if (won) {
    stats.race_wins++
    stats.race_win_attempt = attempt
    xok('Race WON  #' + attempt +
        '  time=' + ms + 'ms' +
        '  poll=' + poll_hex +
        '  tcp='  + tcp_hex)
  } else {
    xdbg('Race MISS #' + attempt +
         '  time=' + ms + 'ms' +
         '  poll=' + poll_hex +
         '  tcp='  + tcp_hex)
  }
}

// ═══════════════════════════════════════════════════════════
//  AIO spray tracking
// ═══════════════════════════════════════════════════════════

export function log_spray (loops: number, num_reqs: number, ms: number) {
  stats.spray_count++
  stats.spray_total_ms += ms
  xdbg('AIO spray  loops=' + loops +
       '  reqs='  + num_reqs +
       '  time='  + ms + 'ms' +
       '  total_sprays=' + stats.spray_count)
}

// ═══════════════════════════════════════════════════════════
//  Alias tracking  (Stage 3 pktopts)
// ═══════════════════════════════════════════════════════════

export function log_alias_attempt (
  attempt: number,
  won:     boolean,
  ms:      number,
  extra?:  string
) {
  stats.alias_attempts++
  stats.alias_timings_ms.push(ms)

  if (won) {
    stats.alias_wins++
    stats.alias_win_attempt = attempt
    xok('Alias WON  #' + attempt +
        '  time=' + ms + 'ms' +
        (extra ? '  ' + extra : ''))
  } else {
    xdbg('Alias MISS #' + attempt +
         '  time=' + ms + 'ms' +
         (extra ? '  ' + extra : ''))
  }
}

// ═══════════════════════════════════════════════════════════
//  Clobber (rthdr overwrite)  tracking
// ═══════════════════════════════════════════════════════════

export function log_clobber_attempt (
  attempt: number,
  won:     boolean,
  cmd_hex: string,
  size:    number
) {
  stats.clobber_attempts++
  if (won) {
    stats.clobber_win_attempt = attempt
    xok('Clobber WON  #' + attempt +
        '  cmd=' + cmd_hex +
        '  size=' + size)
  } else {
    xdbg('Clobber MISS #' + attempt +
         '  cmd=' + cmd_hex +
         '  size=' + size)
  }
}

// ═══════════════════════════════════════════════════════════
//  Reclaim socket tracking
// ═══════════════════════════════════════════════════════════

export function log_reclaim_attempt (attempt: number, won: boolean) {
  stats.reclaim_attempts++
  if (won) {
    stats.reclaim_win_attempt = attempt
    xok('Reclaim WON  #' + attempt)
  } else {
    xdbg('Reclaim MISS #' + attempt)
  }
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
  const lines: string[] = [
    '',
    '╔══════════════════════════════════════════════╗',
    '║          EXPLOIT TUNING SUMMARY              ║',
    '╚══════════════════════════════════════════════╝',
    'Total runtime: ' + (stats.total_ms / 1000).toFixed(2) + 's',
    '',
    '┌─ Stage Timings ────────────────────────────',
  ]

  for (const key of Object.keys(stats.stage_ms)) {
    lines.push('│  ' + key.padEnd(20) + stats.stage_ms[key] + ' ms')
  }

  lines.push('│')
  lines.push('├─ Stage 1: Race Condition ───────────────────')
  lines.push('│  Attempts    : ' + stats.race_attempts + ' / ' + '(NUM_RACES)')
  lines.push('│  Won at      : ' + (stats.race_win_attempt >= 0 ? '#' + stats.race_win_attempt : 'NEVER - INCREASE races'))
  lines.push('│  avg time/try: ' + _avg(stats.race_timings_ms) + ' ms')
  lines.push('│  min/max     : ' + _min(stats.race_timings_ms) + ' / ' + _max(stats.race_timings_ms) + ' ms')
  lines.push('│')

  lines.push('├─ Stage 3: Alias (pktopts) ──────────────────')
  lines.push('│  Attempts    : ' + stats.alias_attempts + ' / ' + '(NUM_ALIAS)')
  lines.push('│  Won at      : ' + (stats.alias_win_attempt >= 0 ? '#' + stats.alias_win_attempt : 'NEVER - INCREASE alias'))
  lines.push('│  avg time/try: ' + _avg(stats.alias_timings_ms) + ' ms')
  lines.push('│')

  lines.push('├─ Clobber (rthdr overwrite) ──────────────────')
  lines.push('│  Attempts    : ' + stats.clobber_attempts)
  lines.push('│  Won at      : ' + (stats.clobber_win_attempt >= 0 ? '#' + stats.clobber_win_attempt : 'NEVER'))
  lines.push('│')

  lines.push('├─ AIO Spray ─────────────────────────────────')
  lines.push('│  Total sprays: ' + stats.spray_count)
  lines.push('│  Total time  : ' + stats.spray_total_ms + ' ms')
  lines.push('│')

  // Recommendations
  lines.push('└─ Recommendations ───────────────────────────')

  if (stats.race_win_attempt < 0) {
    lines.push('  [!] RACE NEVER WON — try: more grooms, different core, higher rtprio')
  } else if (stats.race_win_attempt < 20) {
    lines.push('  [+] Race won early (#' + stats.race_win_attempt + ') — current settings are good')
  } else if (stats.race_win_attempt > 150) {
    lines.push('  [~] Race won late (#' + stats.race_win_attempt + ') — consider:')
    lines.push('       • increasing grooms (current too low?)')
    lines.push('       • trying a different CPU core')
    lines.push('       • increasing rtprio')
  }

  if (stats.alias_win_attempt < 0) {
    lines.push('  [!] ALIAS NEVER WON — increase alias count or grooms')
  } else if (stats.alias_win_attempt > 50) {
    lines.push('  [~] Alias won late (#' + stats.alias_win_attempt + ') — increase alias/grooms')
  }

  if (stats.clobber_win_attempt < 0) {
    lines.push('  [!] CLOBBER NEVER WON — heap layout unstable, try more grooms')
  }

  lines.push('')
  lines.push('Total log lines: ' + _LOG_LINES.length)
  lines.push('')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════
//  USB write — actual PS4 syscalls (open / write / close)
// ═══════════════════════════════════════════════════════════

// Track last saved path so config UI can display it
export let last_log_path  = ''
export let last_log_bytes = 0

export function write_log_to_usb (fw_version: string, config: Record<string, any>): boolean {
  // Respect the log_to_usb toggle from config
  if (config.log_to_usb === false) {
    xlog('USB logging disabled (log_to_usb=false) — skipping', 'LOG')
    return false
  }

  stats.total_ms = Date.now() - _LOG_T0

  // Register file I/O syscalls under unique names to avoid conflicts
  fn.register(0x88, '_mkdir',  ['bigint', 'number'],            'bigint')  // 136 mkdir
  fn.register(0x05, '_fopen',  ['bigint', 'number', 'number'],  'bigint')  //   5 open
  fn.register(0x04, '_fwrite', ['bigint', 'bigint', 'number'],  'bigint')  //   4 write
  fn.register(0x06, '_fclose', ['bigint'],                       'bigint')  //   6 close

  const O_WRONLY = 0x1
  const O_CREAT  = 0x200
  const O_TRUNC  = 0x400

  const ts    = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')
  const fname = 'vaf_' + fw_version.replace('.', '_') + '_c' + (config.core ?? 4) +
                '_g' + (config.grooms ?? 512) + '_r' + (config.races ?? 100) +
                '_' + ts + '.txt'

  const summary = build_summary()

  const header = [
    '══════════════════════════════════════════════════',
    ' VUE-AFTER-FREE  |  Exploit Log',
    ' Date   : ' + new Date().toISOString(),
    ' FW     : ' + fw_version,
    '──────────────────────────────────────────────────',
    ' core   : ' + (config.core    ?? 4),
    ' rtprio : ' + (config.rtprio  ?? 256),
    ' grooms : ' + (config.grooms  ?? 512),
    ' races  : ' + (config.races   ?? 100),
    ' alias  : ' + (config.alias   ?? 100),
    ' sds    : ' + (config.sds     ?? 64),
    ' workers: ' + (config.workers ?? 2),
    ' timeout: ' + (config.timeout_s ?? 8) + 's',
    '══════════════════════════════════════════════════',
    '',
  ].join('\n')

  const content = header + _LOG_LINES.join('\n') + '\n' + summary

  for (let u = 0; u <= 7; u++) {
    try {
      const dir  = '/mnt/usb' + u + '/vaf_logs'
      const path = dir + '/' + fname

      // mkdir — ignore error (dir may already exist)
      fn._mkdir(utils.cstr(dir), 0o755)

      // open
      const fd = fn._fopen(utils.cstr(path), O_WRONLY | O_CREAT | O_TRUNC, 0o644)
      if (Number(fd.shr(32)) >= 0xffff8000) continue   // open failed

      // write in 16 KB chunks
      const CHUNK = 0x4000
      let offset  = 0
      while (offset < content.length) {
        const slice = content.slice(offset, offset + CHUNK)
        fn._fwrite(fd, utils.cstr(slice), slice.length)
        offset += slice.length
      }

      fn._fclose(fd)

      last_log_path  = '/mnt/usb' + u + '/vaf_logs/' + fname
      last_log_bytes = content.length

      xok('Log saved → USB' + u + ':  ' + fname +
          '  (' + content.length + ' bytes,  ' + _LOG_LINES.length + ' lines)')
      return true
    } catch (_) {
      // USB slot not available — try next
    }
  }

  xerr('No USB found — log kept in memory (' + _LOG_LINES.length + ' lines)')
  return false
}
