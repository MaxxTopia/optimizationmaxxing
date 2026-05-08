import { useVipStore } from '../store/useVipStore'

/**
 * Pricing — modeled on Paragon's Free/Edge/Apex tier ladder but slimmed
 * to two clearly differentiated tiers: Free and VIP. Both list features,
 * VIP lists a sale crossover (regular vs current).
 *
 * Phase 7: VIP unlock is a localStorage flag for now. Real Stripe Checkout
 * link wires up at v0.2 with webhook → Tauri-side receipt verification.
 */
const STRIPE_CHECKOUT_PLACEHOLDER =
  'https://buy.stripe.com/optmaxxing-vip-placeholder'

const FREE_FEATURES = [
  '~50 safest tweaks (risk 1-2)',
  'Single rig profile',
  'Manual apply, no presets',
  'No restore checkpoints',
  'Community support (Discord)',
]

const VIP_FEATURES = [
  'Full 150-200 tweak catalog',
  'All curated presets (Esports / BR / Streamer)',
  'Unlimited restore checkpoints',
  'Profile export & share',
  'BIOS-level tweaks unlocked',
  'NVIDIA Profile Inspector integration',
  'Priority support',
  'Future tweak-pack updates',
]

export function Pricing() {
  const tier = useVipStore((s) => s.tier)
  const unlockForDev = useVipStore((s) => s.unlockForDev)
  const reset = useVipStore((s) => s.reset)
  const isVip = tier === 'vip'

  function handleUpgrade() {
    // Real flow: open Stripe Checkout in default browser (Tauri shell handles it),
    // then a webhook updates the local store after success-redirect handshake.
    // For now: open the placeholder URL externally so the user sees the flow.
    window.open(STRIPE_CHECKOUT_PLACEHOLDER, '_blank', 'noopener')
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-text-subtle">unlock</p>
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="text-sm text-text-muted max-w-xl">
          Free for life on the safest tweaks. VIP unlocks the full curated catalog, presets,
          checkpoints, and BIOS-tier optimizations.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PriceCard
          name="Free"
          price="$0"
          tagline="Forever"
          features={FREE_FEATURES}
          ctaLabel={isVip ? 'Downgrade' : 'Current plan'}
          ctaDisabled={!isVip}
          onCta={isVip ? reset : undefined}
        />
        <PriceCard
          name="VIP"
          price="$8"
          regularPrice="$15"
          tagline="USD / month"
          highlighted
          highlightLabel={isVip ? 'Active' : 'Most Value'}
          features={VIP_FEATURES}
          ctaLabel={isVip ? 'You are VIP' : 'Upgrade'}
          ctaDisabled={isVip}
          onCta={isVip ? undefined : handleUpgrade}
        />
      </div>

      <div className="surface-card p-4 text-xs text-text-subtle">
        <p>
          Stripe Checkout webhook integration lands at v0.2. For now,{' '}
          <button
            onClick={unlockForDev}
            className="text-accent hover:underline"
          >
            dev-unlock VIP locally
          </button>{' '}
          to test VIP-gated tweaks + presets without a real charge.
        </p>
      </div>

      <div className="surface-card p-5">
        <p className="text-xs uppercase tracking-widest text-text-subtle mb-2">comparison</p>
        <h2 className="text-lg font-semibold mb-3">vs. competitors</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <CompCell label="Bundle size" us="5 MB" them="81 MB Paragon · 90 MB+ Hone" win />
          <CompCell label="Themes" us="4" them="1" win />
          <CompCell label="Per-tweak undo" us="yes" them="all-or-nothing" win />
          <CompCell label="Spec-aware curation" us="yes" them="generic" win />
        </div>
      </div>

      <p className="text-xs text-text-subtle">
        Pricing finalizes after pilot. Subscription vs. lifetime decision pending — Discord vote
        tracked in <code className="text-accent">#optimizationmaxxer-tiers</code>.
      </p>
    </div>
  )
}

function PriceCard({
  name,
  price,
  regularPrice,
  tagline,
  features,
  ctaLabel,
  ctaDisabled,
  onCta,
  highlighted,
  highlightLabel,
}: {
  name: string
  price: string
  regularPrice?: string
  tagline: string
  features: string[]
  ctaLabel: string
  ctaDisabled?: boolean
  onCta?: () => void
  highlighted?: boolean
  highlightLabel?: string
}) {
  return (
    <div
      className={`surface-card p-6 flex flex-col gap-4 relative ${
        highlighted ? 'border-border-glow shadow-accent-glow' : ''
      }`}
    >
      {highlighted && highlightLabel && (
        <span className="absolute -top-2 left-6 text-[10px] uppercase tracking-widest text-bg-base bg-accent px-2 py-0.5 rounded">
          {highlightLabel}
        </span>
      )}
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle mb-1">{name}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-4xl font-bold text-text">{price}</p>
          {regularPrice && (
            <p className="text-base text-text-subtle line-through tabular-nums">
              {regularPrice}
            </p>
          )}
          {regularPrice && (
            <span className="text-[10px] uppercase tracking-widest text-bg-base bg-accent px-1.5 py-0.5 rounded ml-1">
              SALE
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mt-1">{tagline}</p>
      </div>
      <ul className="space-y-2 text-sm text-text-muted flex-1">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-accent shrink-0">▸</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        disabled={ctaDisabled}
        onClick={onCta}
        className={`btn-chrome px-4 py-2 rounded-md font-semibold ${
          highlighted ? 'bg-accent text-bg-base' : 'bg-bg-raised text-text'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

function CompCell({
  label,
  us,
  them,
  win,
}: {
  label: string
  us: string
  them: string
  win?: boolean
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={`text-sm font-semibold ${win ? 'text-accent' : 'text-text'}`}>us · {us}</p>
      <p className="text-xs text-text-subtle line-through">them · {them}</p>
    </div>
  )
}
