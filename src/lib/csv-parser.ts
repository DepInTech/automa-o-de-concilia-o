import type { SystemRecord, CardRecord } from './types'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function parseBrazilianNumber(value: string): number | null {
  if (!value || !value.trim()) return null
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function findColumn(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }))
  for (const candidate of candidates) {
    const normCandidate = normalizeHeader(candidate)
    const found = normalized.find((h) => h.norm === normCandidate)
    if (found) return found.original
  }
  for (const candidate of candidates) {
    const normCandidate = normalizeHeader(candidate)
    const found = normalized.find(
      (h) => h.norm.includes(normCandidate) || normCandidate.includes(h.norm),
    )
    if (found) return found.original
  }
  return null
}

function detectDelimiter(line: string): string {
  const semis = (line.match(/;/g) || []).length
  const commas = (line.match(/,/g) || []).length
  const tabs = (line.match(/\t/g) || []).length
  if (tabs > semis && tabs > commas) return '\t'
  return semis >= commas ? ';' : ','
}

function parseLineWithDelimiter(line: string, delimiter: string): string[] {
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
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0])
  const headerCells = parseLineWithDelimiter(lines[0], delimiter)
  const headers = headerCells

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseLineWithDelimiter(lines[i], delimiter)
    const row: Record<string, string> = {}
    let hasData = false
    for (let j = 0; j < headers.length; j++) {
      const val = cells[j] ?? ''
      row[headers[j]] = val
      if (val) hasData = true
    }
    if (hasData) rows.push(row)
  }

  return { headers, rows }
}

export function mapSystemRecords(parsed: ParsedCSV): SystemRecord[] {
  const dataCol = findColumn(parsed.headers, ['Data', 'Date', 'Data Movimento', 'Data Mov'])
  const lancamentoCol = findColumn(parsed.headers, [
    'Lançamento Diário',
    'Lancamento Diario',
    'Lançamento',
    'Lancamento',
    'Diário',
    'Diario',
  ])
  const parceiroCol = findColumn(parsed.headers, [
    'Parceiro',
    'Partner',
    'Razão Social',
    'Razao Social',
    'Nome',
  ])
  const debitoCol = findColumn(parsed.headers, ['Débito', 'Debito', 'Debit'])
  const creditoCol = findColumn(parsed.headers, ['Crédito', 'Credito', 'Credit'])
  const categoriaCol = findColumn(parsed.headers, ['Categoria', 'Category', 'Conta'])

  return parsed.rows.map((row, i) => ({
    id: `sys-${i}`,
    data: dataCol ? (row[dataCol] ?? '') : '',
    lancamentoDiario: lancamentoCol ? (row[lancamentoCol] ?? '') : '',
    parceiro: parceiroCol ? (row[parceiroCol] ?? '') : '',
    debito: debitoCol ? parseBrazilianNumber(row[debitoCol] ?? '') : null,
    credito: creditoCol ? (parseBrazilianNumber(row[creditoCol] ?? '') ?? 0) : 0,
    categoria: categoriaCol ? (row[categoriaCol] ?? '') : '',
  }))
}

export function mapCardRecords(parsed: ParsedCSV): CardRecord[] {
  const dataCol = findColumn(parsed.headers, ['Data', 'Date', 'Data Compra', 'Data Transação'])
  const estabelecimentoCol = findColumn(parsed.headers, [
    'Estabelecimento',
    'Establishment',
    'Razão Social',
    'Razao Social',
    'Nome do Estabelecimento',
  ])
  const categoriaCol = findColumn(parsed.headers, ['Categoria', 'Category', 'Tipo'])
  const valorCol = findColumn(parsed.headers, ['Valor', 'Value', 'Amount', 'Valor Total'])

  return parsed.rows.map((row, i) => ({
    id: `card-${i}`,
    data: dataCol ? (row[dataCol] ?? '') : '',
    estabelecimento: estabelecimentoCol ? (row[estabelecimentoCol] ?? '') : '',
    categoria: categoriaCol ? (row[categoriaCol] ?? '') : '',
    valor: valorCol ? (parseBrazilianNumber(row[valorCol] ?? '') ?? 0) : 0,
  }))
}
