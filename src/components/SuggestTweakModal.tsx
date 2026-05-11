import { useEffect, useState } from 'react'

import { openExternal } from '../lib/tauri'

/**
 * Suggest-a-tweak feedback modal. Three submission paths:
 *   1. Copy as DM template — for Discord (manual paste into #feedback thread)
 *   2. Open Maxxtopia Discord invite — drops user in #welcome of the suite hub
 *   3. Email lucidcobra@gmail.com — always works
 *
 * Once in the server, users post tweak suggestions as new threads in
 * #feedback (forum channel). Format: "[optmaxxing] short summary".
 */

const SUGGEST_DISCORD_URL = 'https://discord.gg/S78eecbWdx'
const FEEDBACK_EMAIL = 'lucidcobra@gmail.com'

interface Props {
  open: boolean
  onClose: () => void
}

const TEMPLATE_PLACEHOLDER = `Tweak name: <e.g. "Disable Win11 Snap Hover Delay">

Source / where I learned about it:
<creator name + video URL, or registry path you found, or paragontweaks docs URL>

Why it matters for gaming:
<one-line explanation>

What it does (registry path / bcdedit cmd / PS script):
<paste the actual command>

Risk + reboot needed:
<low / medium / high · logout / reboot / none>`

export function SuggestTweakModal({ open, onClose }: Props) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setText('')
      setCopied(false)
    }
  }, [open])

  if (!open) return null

  async function handleCopy() {
    const body = text.trim() || TEMPLATE_PLACEHOLDER
    const message = `📥 New tweak suggestion\n\n${body}\n\n— from optimizationmaxxing v${
      (import.meta.env.VITE_APP_VERSION as string) || '0.1.20'
    }`
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Older webviews — best-effort fallback.
      const ta = document.createElement('textarea')
      ta.value = message
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  function handleEmail() {
    const subject = encodeURIComponent('optimizationmaxxing tweak suggestion')
    const body = encodeURIComponent(text.trim() || TEMPLATE_PLACEHOLDER)
    void openExternal(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-4">
      <div className="surface-card flex flex-col w-full max-w-xl max-h-full overflow-hidden">
        <header className="p-5 border-b border-border">
          <p className="text-xs uppercase tracking-widest text-text-subtle">community</p>
          <h3 className="text-lg font-semibold mt-1">Suggest a tweak</h3>
          <p className="text-xs text-text-subtle mt-1">
            Found something we missed? Drop the registry path, bcdedit cmd, or PowerShell snippet.
            Reviewed manually before promotion.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={TEMPLATE_PLACEHOLDER}
            rows={12}
            className="w-full px-3 py-2 rounded-md bg-bg-card border border-border focus:border-border-glow outline-none text-sm font-mono"
          />
          <p className="text-xs text-text-subtle">
            Tip: copy the body, then paste into Discord or email. Discord server coming soon —
            email works today.
          </p>
        </div>

        <footer className="p-5 border-t border-border flex flex-wrap justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-border text-sm hover:border-border-glow"
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-2 rounded-md border border-border text-sm hover:border-border-glow"
          >
            {copied ? '✓ Copied' : 'Copy as message'}
          </button>
          <a
            href={SUGGEST_DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-md border border-border text-sm hover:border-border-glow"
            title="Discord server coming soon"
          >
            Open Discord
          </a>
          <button
            onClick={handleEmail}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            Email diggy
          </button>
        </footer>
      </div>
    </div>
  )
}
