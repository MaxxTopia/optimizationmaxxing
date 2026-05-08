import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_PROFILE, type ProfileId } from '../theme/profiles'

interface ProfileState {
  activeProfile: ProfileId
  setProfile: (id: ProfileId) => void
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      activeProfile: DEFAULT_PROFILE,
      setProfile: (id) => set({ activeProfile: id }),
    }),
    { name: 'optmaxxing-profile' },
  ),
)
