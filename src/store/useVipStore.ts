import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * VIP state is persisted only as a cache. A server-backed redemption is
 * revalidated by App on startup and periodically while it is running. The
 * older offline-HMAC path remains explicitly marked as legacy so existing
 * private testers are not silently invalidated during this migration.
 */

export type Tier = 'free' | 'vip'
export type VipLicenseSource = 'server' | 'legacy-offline'
const CLIENT_CLOCK_SKEW_MS = 5 * 60 * 1000

export interface VipRedemptionMetadata {
  source?: VipLicenseSource
  /** Unix epoch milliseconds. null/undefined means lifetime. */
  expiresAt?: number | null
}

interface VipState {
  tier: Tier
  /** Set after a successful purchase + receipt verification (placeholder). */
  purchaseId: string | null
  /** Last-redeemed code, for display + revoke. Null if VIP came from dev unlock. */
  redeemedCode: string | null
  /** HWID the redeemed code was bound to. If the user moves to a new rig
   * the HWID changes and the persisted VIP no longer applies. */
  boundHwid: string | null
  /** Server-backed claims are subject to periodic validation; legacy offline
   * claims keep their old compatibility behavior until reissued. */
  licenseSource: VipLicenseSource | null
  /** Last successful Worker validation, in local epoch milliseconds. */
  lastValidatedAt: number | null
  /** Expiry returned by the Worker. null means lifetime. */
  expiresAt: number | null
  /** Last local wall-clock observation used to fail closed on clock rollback. */
  lastClientClockAt: number | null
  setTier: (t: Tier) => void
  /** Dev / test switch — set the tier without going through redemption. */
  unlockForDev: () => void
  /** Apply a successfully verified code. Persists code + HWID + source. */
  applyRedemption: (code: string, hwid: string, metadata?: VipRedemptionMetadata) => void
  /** Record a successful read-only server validation. */
  markServerValidated: (expiresAt?: number | null) => void
  /** Record a legacy code as server-backed after a successful migration check. */
  promoteToServerLicense: (expiresAt?: number | null) => void
  /** Record the current wall clock without changing entitlement. */
  markClientClockSeen: () => void
  reset: () => void
}

export const useVipStore = create<VipState>()(
  persist(
    (set) => ({
      tier: 'free',
      purchaseId: null,
      redeemedCode: null,
      boundHwid: null,
      licenseSource: null,
      lastValidatedAt: null,
      expiresAt: null,
      lastClientClockAt: null,
      setTier: (t) => set({ tier: t }),
      unlockForDev: () =>
        set({
          tier: 'vip',
          purchaseId: 'dev-unlock',
          redeemedCode: null,
          boundHwid: null,
          licenseSource: null,
          lastValidatedAt: null,
          expiresAt: null,
          lastClientClockAt: null,
        }),
      applyRedemption: (code, hwid, metadata) => {
        const source = metadata?.source ?? 'legacy-offline'
        const now = Date.now()
        set({
          tier: 'vip',
          purchaseId: 'code-redeem',
          redeemedCode: code,
          boundHwid: hwid,
          licenseSource: source,
          lastValidatedAt: source === 'server' ? now : null,
          expiresAt: source === 'server' ? (metadata?.expiresAt ?? null) : null,
          lastClientClockAt: source === 'server' ? now : null,
        })
      },
      markServerValidated: (expiresAt) => {
        const now = Date.now()
        set((state) => ({
          licenseSource: 'server',
          lastValidatedAt: now,
          expiresAt: expiresAt ?? null,
          // Keep the previous observation during a rollback so useIsVip can
          // fail closed instead of letting a successful network check hide it.
          lastClientClockAt: state.lastClientClockAt != null
            && now + CLIENT_CLOCK_SKEW_MS < state.lastClientClockAt
            ? state.lastClientClockAt
            : now,
        }))
      },
      promoteToServerLicense: (expiresAt) => {
        const now = Date.now()
        set((state) => ({
          licenseSource: 'server',
          lastValidatedAt: now,
          expiresAt: expiresAt ?? null,
          lastClientClockAt: state.lastClientClockAt != null
            && now + CLIENT_CLOCK_SKEW_MS < state.lastClientClockAt
            ? state.lastClientClockAt
            : now,
        }))
      },
      markClientClockSeen: () => {
        const now = Date.now()
        set((state) => state.lastClientClockAt != null
          && now + CLIENT_CLOCK_SKEW_MS < state.lastClientClockAt
          ? {}
          : { lastClientClockAt: now })
      },
      reset: () =>
        set({
          tier: 'free',
          purchaseId: null,
          redeemedCode: null,
          boundHwid: null,
          licenseSource: null,
          lastValidatedAt: null,
          expiresAt: null,
          lastClientClockAt: null,
        }),
    }),
    { name: 'optmaxxing-vip' },
  ),
)

/** Convenience selector — reads tier without subscribing the whole store. */
export function useIsVip(): boolean {
  const tier = useVipStore((s) => s.tier)
  const source = useVipStore((s) => s.licenseSource)
  const lastValidatedAt = useVipStore((s) => s.lastValidatedAt)
  const expiresAt = useVipStore((s) => s.expiresAt)
  const lastClientClockAt = useVipStore((s) => s.lastClientClockAt)
  if (tier !== 'vip') return false

  // Dev unlocks and legacy offline gifts retain their existing compatibility
  // behavior. Only server-backed claims use the bounded online trust window.
  if (source !== 'server') return true
  const now = Date.now()
  if (lastClientClockAt && now + CLIENT_CLOCK_SKEW_MS < lastClientClockAt) return false
  if (typeof expiresAt === 'number' && now >= expiresAt) return false
  if (lastValidatedAt && now - lastValidatedAt > 24 * 60 * 60 * 1000) return false
  return true
}
