import { useState } from 'react'
import { renderMarkdown } from '../lib/md'
import type { ResearchArticle } from '../lib/research'

/**
 * Collapsible research-article card. Renders the .md body via our
 * inline minimal markdown → HTML pass. Body content is trusted (we
 * author it) — don't feed user content here.
 */
export function ResearchCard({ article }: { article: ResearchArticle }) {
  const [open, setOpen] = useState(false)
  return (
    <article
      className={`surface-card overflow-hidden transition-all ${
        open ? 'border-border-glow' : ''
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-5 text-left flex items-start justify-between gap-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle mb-1">
            {article.badge}
          </p>
          <h3 className="text-lg font-semibold text-text">{article.title}</h3>
          <p className="text-sm text-text-muted mt-1">{article.blurb}</p>
        </div>
        <span
          className={`shrink-0 text-2xl text-text-subtle transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
      </button>
      {open && (
        <div
          className="research-body px-5 pb-5 text-sm text-text-muted leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
        />
      )}
    </article>
  )
}
