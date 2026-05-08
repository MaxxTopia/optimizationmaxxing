/**
 * Minimal Markdown → HTML renderer for our research articles. Supports:
 * - # / ## / ### / #### headings
 * - **bold**, *italic*, `code`
 * - bullet (- ) and numbered (1.) lists
 * - blank-line paragraphs
 * - tables (basic GFM pipe syntax)
 *
 * Output is sanitized — only emits a fixed set of tags. Safe to inject
 * via dangerouslySetInnerHTML for our own .md content. Don't feed
 * untrusted markdown.
 */

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function renderInline(s: string): string {
  // Code spans first (won't double-escape inside)
  let out = s.replace(/`([^`]+)`/g, (_m, code) => `<code>${escapeHtml(code)}</code>`)
  // Bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic (single * or _, not greedy across newlines)
  out = out.replace(/(?<![*_])\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
  out = out.replace(/(?<![_])_([^_\n]+)_(?!_)/g, '<em>$1</em>')
  return out
}

function renderTable(lines: string[]): string {
  const rows = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'))
    .map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
  if (rows.length < 2) return ''
  const [header, sep, ...body] = rows
  if (!sep || !sep.every((c) => /^:?-+:?$/.test(c))) return ''
  const th = header.map((c) => `<th>${renderInline(escapeBlock(c))}</th>`).join('')
  const trs = body
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${renderInline(escapeBlock(c))}</td>`).join('')}</tr>`,
    )
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
}

function escapeBlock(s: string): string {
  // Don't escape inside `code spans` — but the inline pass does that.
  // Escape angle brackets only.
  return s.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export function renderMarkdown(src: string): string {
  // Strip optional YAML frontmatter
  src = src.replace(/^---\n[\s\S]*?\n---\n/, '')
  const lines = src.split(/\r?\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // blank → close any list / paragraph
    if (line.trim() === '') {
      i++
      continue
    }
    // heading
    const h = line.match(/^(#{1,6})\s+(.+)$/)
    if (h) {
      const level = Math.min(h[1].length, 6)
      out.push(`<h${level}>${renderInline(escapeBlock(h[2]))}</h${level}>`)
      i++
      continue
    }
    // table
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      const html = renderTable(tableLines)
      if (html) {
        out.push(html)
        continue
      }
    }
    // bullet list
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ''))
        i++
      }
      out.push(
        `<ul>${items
          .map((item) => `<li>${renderInline(escapeBlock(item))}</li>`)
          .join('')}</ul>`,
      )
      continue
    }
    // numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      out.push(
        `<ol>${items
          .map((item) => `<li>${renderInline(escapeBlock(item))}</li>`)
          .join('')}</ol>`,
      )
      continue
    }
    // paragraph
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^\s*-\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !lines[i].trim().startsWith('|')) {
      para.push(lines[i])
      i++
    }
    if (para.length) {
      out.push(`<p>${renderInline(escapeBlock(para.join(' ')))}</p>`)
    }
  }
  return out.join('\n')
}
