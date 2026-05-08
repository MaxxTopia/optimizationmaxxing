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
  setTier: (t: Tier) => void
  /** Dev / test switch — set the tier without going through Stripe. */
  unlockForDev: () => void
  reset: () => void
}

export const useVipStore = create<VipState>()(
  persist(
    (set) => ({
      tier: 'free',
      purchaseId: null,
      setTier: (t) => set({ tier: t }),
      unlockForDev: () => set({ tier: 'vip', purchaseId: 'dev-unlock' }),
      reset: () => set({ tier: 'free', purchaseId: null }),
    }),
    { name: 'optmaxxing-vip' },
  ),
)

/** Convenience selector — reads tier without subscribing the whole store. */
export function useIsVip(): boolean {
  return useVipStore((s) => s.tier === 'vip')
}
