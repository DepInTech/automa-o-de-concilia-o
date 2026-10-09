import type { ParsedCSV } from './csv-parser'

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function isHeaderMatching(normalizedList: string[], fileType: 'system' | 'card'): boolean {
  if (fileType === 'card') {
    const hasDate = normalizedList.some((h) => h.includes('data'))
    const hasDesc = normalizedList.some(
      (h) =>
        h.includes('estabelecimento') ||
        h.includes('descricao') ||
        h.includes('parceiro') ||
        h.includes('historico'),
    )
    return hasDate && hasDesc
  }

  // fileType === 'system' (Odoo)
  // Cabeçalho válido se contiver data + qualquer coluna de parceiro/descrição/diário + coluna monetária
  // (Total, Valor, Crédito, Montante, Débito) OU número
  const hasData = normalizedList.some((h) => h.includes('data') || h.includes('date'))
  const hasPartnerOrDesc = normalizedList.some(
    (h) =>
      h.includes('parceiro') ||
      h.includes('partner') ||
      h.includes('fornecedor') ||
      h.includes('nome') ||
      h.includes('contato') ||
      h.includes('razao') ||
      h.includes('descricao') ||
      h.includes('diario') ||
      h.includes('lancamento') ||
      h.includes('numero') ||
      h.includes('number') ||
      h.includes('referencia') ||
      h.includes('ref'),
  )
  const hasMoneyOrNum = normalizedList.some(
    (h) =>
      h.includes('total') ||
      h.includes('valor') ||
      h.includes('credito') ||
      h.includes('debito') ||
      h.includes('montante') ||
      h.includes('amount') ||
      h.includes('numero') ||
      h.includes('number'),
  )

  return hasData && (hasPartnerOrDesc || hasMoneyOrNum)
}

function findHeaderLineIndex(lines: string[], fileType: 'system' | 'card'): number {
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (!rawLine.trim()) continue
    // Divide linha por delimitadores prováveis (; ou , ou \t)
    const tokens = rawLine.split(/[,;\t]/).map((t) => normalizeText(t))
    if (isHeaderMatching(tokens, fileType)) {
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
  const normalizedHeaders = parsed.headers.map((h) => normalizeText(h))
  if (isHeaderMatching(normalizedHeaders, fileType)) {
    return parsed
  }

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]
    // Utiliza a ordem dos headers originais para preservar alinhamento exato de colunas
    const orderedValues = parsed.headers.map((h) => row[h] ?? '')
    const normalizedValues = orderedValues.map((v) => normalizeText(v))
    if (isHeaderMatching(normalizedValues, fileType)) {
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

  return parsed
}
