import { useState, useRef, useEffect } from 'react'
import { useProfileStore } from '../store/useProfileStore'
import { PROFILE_ORDER, profiles } from '../theme/profiles'

/**
 * Sidebar-adjacent profile-picker dropdown. Each entry shows a 2-color swatch
 * + label so the user can browse Val / Sonic / DMC / BO3 at a glance.
 */
export function ThemePicker() {
  const activeProfile = useProfileStore((s) => s.activeProfile)
  const setProfile = useProfileStore((s) => s.setProfile)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) {
      document.addEventListener('mousedown', onClick)
      return () => document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const active = profiles[activeProfile]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-bg-card text-sm text-text-muted hover:text-text hover:border-border-glow transition"
      >
        <span
          className="size-4 rounded-sm border border-border"
          style={{
            background: `linear-gradient(135deg, ${active.swatch.primary} 0%, ${active.swatch.primary} 50%, ${active.swatch.secondary} 50%, ${active.swatch.secondary} 100%)`,
          }}
        />
        <span>{active.label}</span>
        <span className="text-text-subtle">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-bg-raised shadow-xl shadow-black/40 z-30 p-1">
          {PROFILE_ORDER.map((id) => {
            const p = profiles[id]
            const isActive = id === activeProfile
            return (
              <button
                key={id}
                onClick={() => {
                  setProfile(id)
                  setOpen(false)
                }}
                className={`w-full flex items-start gap-3 px-2 py-2 rounded-md text-left transition ${
                  isActive ? 'bg-bg-card' : 'hover:bg-bg-card'
                }`}
              >
                <span
                  className="mt-1 size-6 rounded-sm border border-border shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${p.swatch.primary} 0%, ${p.swatch.primary} 50%, ${p.swatch.secondary} 50%, ${p.swatch.secondary} 100%)`,
                  }}
                />
                <span className="flex-1">
                  <span className="block text-sm text-text font-medium">{p.label}</span>
                  <span className="block text-xs text-text-subtle">{p.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
