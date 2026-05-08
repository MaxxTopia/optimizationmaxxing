import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChangelogState {
  lastSeenVersion: string | null
  markSeen: (version: string) => void
}

export const useChangelog = create<ChangelogState>()(
  persist(
    (set) => ({
      lastSeenVersion: null,
      markSeen: (version) => set({ lastSeenVersion: version }),
    }),
    { name: 'optmaxxing-changelog' },
  ),
)
