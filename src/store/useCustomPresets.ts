import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * User-built custom presets. Stored in localStorage; never exfiltrated.
 * Apply / revert routes through the same code path as built-in presets
 * since shape mirrors PresetBundle.
 */
export interface CustomPreset {
  id: string
  name: string
  tagline: string
  description: string
  tweakIds: string[]
  createdAt: string
  /** mark = "user-built" so the UI can render an Edit button. */
  isCustom: true
}

interface CustomPresetsState {
  presets: CustomPreset[]
  add: (p: Omit<CustomPreset, 'id' | 'createdAt' | 'isCustom'>) => CustomPreset
  update: (id: string, patch: Partial<Omit<CustomPreset, 'id' | 'isCustom'>>) => void
  remove: (id: string) => void
  /** Bulk import (e.g. paste from a friend). Returns count of imported. */
  importMany: (presets: Array<Omit<CustomPreset, 'id' | 'createdAt' | 'isCustom'>>) => number
}

function makeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `preset.custom.${slug || 'untitled'}.${Date.now().toString(36)}`
}

export const useCustomPresets = create<CustomPresetsState>()(
  persist(
    (set, get) => ({
      presets: [],
      add: (p) => {
        const built: CustomPreset = {
          ...p,
          id: makeId(p.name),
          createdAt: new Date().toISOString(),
          isCustom: true,
        }
        set({ presets: [...get().presets, built] })
        return built
      },
      update: (id, patch) =>
        set({
          presets: get().presets.map((p) =>
            p.id === id ? { ...p, ...patch, id: p.id, isCustom: true } : p,
          ),
        }),
      remove: (id) => set({ presets: get().presets.filter((p) => p.id !== id) }),
      importMany: (incoming) => {
        const existing = get().presets
        const built = incoming.map((p) => ({
          ...p,
          id: makeId(p.name),
          createdAt: new Date().toISOString(),
          isCustom: true as const,
        }))
        set({ presets: [...existing, ...built] })
        return built.length
      },
    }),
    { name: 'optmaxxing-custom-presets' },
  ),
)
