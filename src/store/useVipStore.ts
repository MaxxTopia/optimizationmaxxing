import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Phase 7 — VIP / tier state. Zustand persisted in localStorage so it
 * survives across launches. Real Stripe webhook fulfilment will mutate
 * this store via a Tauri command + signed receipt validation later;
 * for now the toggle is local-state only (so we can dogfood VIP-gated
 * tweaks during testing).
 */

export type Tier = 'free' | 'vip'

interface VipState {
  tier: Tier
  /** Set after a successful purchase + receipt verification (placeholder). */
  purchaseId: string | null
  /** Last-redeemed code, for display + revoke. Null if VIP came from dev unlock. */
  redeemedCode: string | null
  /** HWID the redeemed code was bound to. If the user moves to a new rig
   * the HWID changes and the persisted VIP no longer applies. */
  boundHwid: string | null
  setTier: (t: Tier) => void
  /** Dev / test switch — set the tier without going through redemption. */
  unlockForDev: () => void
  /** Apply a successfully verified code. Persists code + HWID. */
  applyRedemption: (code: string, hwid: string) => void
  reset: () => void
}

export const useVipStore = create<VipState>()(
  persist(
    (set) => ({
      tier: 'free',
      purchaseId: null,
      redeemedCode: null,
      boundHwid: null,
      setTier: (t) => set({ tier: t }),
      unlockForDev: () =>
        set({ tier: 'vip', purchaseId: 'dev-unlock', redeemedCode: null, boundHwid: null }),
      applyRedemption: (code, hwid) =>
        set({ tier: 'vip', purchaseId: 'code-redeem', redeemedCode: code, boundHwid: hwid }),
      reset: () =>
        set({ tier: 'free', purchaseId: null, redeemedCode: null, boundHwid: null }),
    }),
    { name: 'optmaxxing-vip' },
  ),
)

/** Convenience selector — reads tier without subscribing the whole store. */
export function useIsVip(): boolean {
  return useVipStore((s) => s.tier === 'vip')
}
