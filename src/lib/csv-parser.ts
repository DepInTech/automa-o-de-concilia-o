import type { SystemRecord, CardRecord } from './types'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

function parseLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export function parseCSV(text: string): ParsedCSV {
  const delimiter = text.includes(';') ? ';' : ','
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseLine(lines[0], delimiter).map((h) => h.trim())
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line, delimiter)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').trim()
    })
    return row
  })
  return { headers, rows }
}

export function parseBrazilianNumber(value: string): number | null {
  if (!value || value.trim() === '') return null
  const cleaned = value.trim().replace(/R\$/g, '').replace(/\s/g, '')
  if (cleaned.includes(',')) {
    const withoutThousand = cleaned.replace(/\./g, '')
    const num = parseFloat(withoutThousand.replace(',', '.'))
    return isNaN(num) ? null : num
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => h.toLowerCase().trim())
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h === candidate.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  for (const candidate of candidates) {
    const idx = normalized.findIndex((h) => h.includes(candidate.toLowerCase()))
    if (idx !== -1) return headers[idx]
  }
  return null
}

export function mapSystemRecords(parsed: ParsedCSV): SystemRecord[] {
  const dataCol = findColumn(parsed.headers, ['Data', 'DATA'])
  const lancCol = findColumn(parsed.headers, [
    'Lançamento Diário',
    'Lancamento Diario',
    'lancamento',
  ])
  const parcCol = findColumn(parsed.headers, ['Parceiro', 'PARCEIRO'])
  const debCol = findColumn(parsed.headers, ['Débito', 'Debito', 'DEBITO'])
  const credCol = findColumn(parsed.headers, ['Crédito', 'Credito', 'CREDITO'])
  return parsed.rows.map((row, i) => ({
    id: `S${i + 1}`,
    data: dataCol ? row[dataCol] || '' : '',
    lancamentoDiario: lancCol ? row[lancCol] || '' : '',
    parceiro: parcCol ? row[parcCol] || '' : '',
    debito: debCol ? parseBrazilianNumber(row[debCol]) : null,
    credito: credCol ? parseBrazilianNumber(row[credCol]) || 0 : 0,
    categoria: '',
  }))
}

export function mapCardRecords(parsed: ParsedCSV): CardRecord[] {
  const dataCol = findColumn(parsed.headers, ['Data', 'DATA'])
  const estCol = findColumn(parsed.headers, ['Estabelecimento', 'ESTABELECIMENTO'])
  const catCol = findColumn(parsed.headers, ['Categoria', 'CATEGORIA'])
  const valCol = findColumn(parsed.headers, ['Valor', 'VALOR'])
  return parsed.rows.map((row, i) => ({
    id: `C${i + 1}`,
    data: dataCol ? row[dataCol] || '' : '',
    estabelecimento: estCol ? row[estCol] || '' : '',
    categoria: catCol ? row[catCol] || '' : '',
    valor: valCol ? parseBrazilianNumber(row[valCol]) || 0 : 0,
  }))
}
