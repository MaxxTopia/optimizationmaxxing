import type { SpecProfile } from '../lib/tauri'

/**
 * Heuristic warning surface for AMD Ryzen UCLK / FCLK ratio drops. Reading
 * the actual UCLK ratio at runtime requires MSR access (kernel driver) or a
 * vendor SDK; instead we infer from the configured RAM speed + CPU vendor:
 *
 *   - Ryzen 7000 (AM5, DDR5) above ~6400 MT/s often needs a different UCLK
 *     ratio, but the actual result depends on the CPU, board, BIOS, and kit.
 *   - Ryzen 5000 (AM4, DDR4) above ~3733 MT/s often needs a different FCLK
 *     relationship, but the actual result must be read in firmware.
 *
 * Honest framing: we can't read the ratio from userspace, only flag the
 * speed window where it's likely. The fix lives in BIOS — verify
 * "UCLK DIV1 Mode = UCLK==MEMCLK" (or your board's equivalent label).
 */

interface Props {
  spec: SpecProfile | null
}

export function UclkWarningCard({ spec }: Props) {
  if (!spec) return null
  const cpuVendor = (spec.cpu?.vendor ?? '').toLowerCase()
  const isAmd = cpuVendor.includes('amd')
  if (!isAmd) return null

  const speed = spec.ram?.configuredSpeedMts ?? spec.ram?.speedMts ?? 0
  if (speed === 0) return null

  // Detect platform via CPU family. AM5 / Ryzen 7000+ = family 25 with model >= 0x60ish (Zen 4).
  // Easier shortcut: DDR5 = AM5; DDR4 = AM4. We don't have RAM-type in SpecProfile yet, so
  // we use the speed itself to infer (>=4800 MT/s = DDR5).
  const isDdr5 = speed >= 4800
  let warning: string | null = null
  let detail = ''
  if (isDdr5) {
    if (speed > 6400) {
      warning = 'Likely UCLK 1:2 mode'
      detail = `RAM running ${speed} MT/s. On Ryzen 7000+, this speed range often changes the UCLK relationship. Verify the actual UCLK/MCLK state in BIOS or a trusted hardware monitor; do not assume a ratio or a latency result from speed alone. If unstable, return to the board's rated/default profile and validate.`
    } else if (speed >= 6000 && speed <= 6400) {
      warning = null
      detail = `RAM at ${speed} MT/s — commonly compatible with Ryzen 7000 1:1 operation, but the actual ratio still depends on the CPU, board, BIOS, and profile. No action is needed if stability and measured frametime are good.`
    }
  } else {
    // DDR4 → AM4 / Ryzen 5000.
    if (speed > 3800) {
      warning = 'Likely FCLK desync'
      detail = `RAM running ${speed} MT/s on a DDR4 platform. Ryzen 5000 often needs a different FCLK relationship above this range. Verify the actual FCLK/MCLK state in BIOS or a trusted hardware monitor; if unstable, return to the board's rated/default profile and validate.`
    } else if (speed >= 3600 && speed <= 3800) {
      detail = `RAM at ${speed} MT/s — commonly compatible with Ryzen 5000 1:1 operation, but the actual ratio still depends on the CPU, board, BIOS, and profile. No action is needed if stability and measured frametime are good.`
    }
  }

  if (!warning && !detail) return null

  return (
    <section
      className={`surface-card p-4 ${
        warning ? 'border-accent/50 bg-accent/5' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden>
          {warning ? '⚠' : '✓'}
        </span>
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">
            ryzen ram coupling
          </p>
          <h3 className="font-semibold text-text">
            {warning ?? 'RAM speed within 1:1 sweet spot'}
          </h3>
          <p className="text-xs text-text-muted leading-snug mt-1">{detail}</p>
        </div>
      </div>
    </section>
  )
}
