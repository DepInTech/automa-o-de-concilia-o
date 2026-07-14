import type { ParsedCSV } from './csv-parser'

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function findHeaderLineIndex(lines: string[], fileType: 'system' | 'card'): number {
  const keywords = fileType === 'card' ? ['data', 'estabelecimento'] : ['data', 'numero']

  for (let i = 0; i < lines.length; i++) {
    const normalized = normalizeText(lines[i])
    if (keywords.every((kw) => normalized.includes(kw))) {
      return i
    }
  }
  return -1
}

export function sanitizeItauText(text: string, fileType: 'system' | 'card'): string {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines.length === 0) return text

  const headerIndex = findHeaderLineIndex(lines, fileType)
  if (headerIndex <= 0) return text

  return lines.slice(headerIndex).join('\n')
}

export function sanitizeParsedCSV(parsed: ParsedCSV, fileType: 'system' | 'card'): ParsedCSV {
  const keywords = fileType === 'card' ? ['data', 'estabelecimento'] : ['data', 'numero']

  const normalizedHeaders = parsed.headers.map((h) => normalizeText(h))
  const headersMatch = keywords.every((kw) => normalizedHeaders.some((h) => h.includes(kw)))
  if (headersMatch) return parsed

  for (let i = 0; i < parsed.rows.length; i++) {
    const rowValues = Object.values(parsed.rows[i])
    const normalizedValues = rowValues.map((v) => normalizeText(v))
    const hasAllKeywords = keywords.every((kw) => normalizedValues.some((v) => v.includes(kw)))
    if (hasAllKeywords) {
      const newHeaders = rowValues
      const newRows: Record<string, string>[] = []
      for (let j = i + 1; j < parsed.rows.length; j++) {
        const oldRowValues = Object.values(parsed.rows[j])
        const newRow: Record<string, string> = {}
        newHeaders.forEach((header, idx) => {
          newRow[header] = oldRowValues[idx] ?? ''
        })
        newRows.push(newRow)
      }
      return { headers: newHeaders, rows: newRows, detectedRows: newRows.length }
    }
  }

  return parsed
}
