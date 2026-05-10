import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PROFILE, profiles, type ProfileId } from '../theme/profiles'

interface ProfileState {
  activeProfile: ProfileId
  setProfile: (id: ProfileId) => void
}

// v0.1.59 — `bo3` was renamed to `bumblebee`. Users who had picked the
// old `bo3` palette get migrated transparently on next load. Any other
// unknown value (corrupted localStorage, future profile-id rename) falls
// back to the default profile so the app doesn't crash with an undefined
// theme lookup.
const PROFILE_MIGRATIONS: Record<string, ProfileId> = {
  bo3: 'bumblebee',
}

function normalizeProfileId(value: unknown): ProfileId {
  if (typeof value !== 'string') return DEFAULT_PROFILE
  const migrated = PROFILE_MIGRATIONS[value]
  if (migrated) return migrated
  if (value in profiles) return value as ProfileId
  return DEFAULT_PROFILE
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      activeProfile: DEFAULT_PROFILE,
      setProfile: (id) => set({ activeProfile: id }),
    }),
    {
      name: 'optmaxxing-profile',
      // Run migration on every rehydrate. Safe to leave on permanently —
      // unknown ids fall through to DEFAULT_PROFILE.
      onRehydrateStorage: () => (state) => {
        if (state) state.activeProfile = normalizeProfileId(state.activeProfile)
      },
    },
  ),
)
