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
    const row = parsed.rows[i]
    // Utiliza a ordem dos headers originais para preservar alinhamento exato de colunas
    const orderedValues = parsed.headers.map((h) => row[h] ?? '')
    const normalizedValues = orderedValues.map((v) => normalizeText(v))
    const hasAllKeywords = keywords.every((kw) => normalizedValues.some((v) => v.includes(kw)))
    if (hasAllKeywords) {
      const newHeaders = orderedValues.map((v, idx) => v || `Col${idx}`)
      const newRows: Record<string, string>[] = []
      for (let j = i + 1; j < parsed.rows.length; j++) {
        const oldRow = parsed.rows[j]
        const oldOrderedValues = parsed.headers.map((h) => oldRow[h] ?? '')
        const newRow: Record<string, string> = {}
        newHeaders.forEach((header, idx) => {
          newRow[header] = oldOrderedValues[idx] ?? ''
        })
        newRows.push(newRow)
      }
      return { headers: newHeaders, rows: newRows, detectedRows: newRows.length }
    }
  }

  // Se nenhum cabeçalho continha exatamente keywords combinadas, mas os headers originais contêm 'data' e ('parceiro' ou 'total' ou 'valor')
  const hasDataCol = normalizedHeaders.some((h) => h.includes('data'))
  const hasPartnerOrTotal = normalizedHeaders.some(
    (h) =>
      h.includes('parceiro') ||
      h.includes('total') ||
      h.includes('valor') ||
      h.includes('debito') ||
      h.includes('credito'),
  )
  if (hasDataCol && hasPartnerOrTotal) {
    return parsed
  }

  return parsed
}
