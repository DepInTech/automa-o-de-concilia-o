import type { SystemRecord, CardRecord } from './types'

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, string>[]
  detectedRows: number
}

function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function parseBrazilianNumber(value: string): number | null {
  if (!value) return null
  let v = value.trim().replace(/R\$/g, '').replace(/\s/g, '')
  if (v.includes(',') && v.includes('.')) {
    v = v.replace(/\./g, '').replace(',', '.')
  } else if (v.includes(',')) {
    v = v.replace(',', '.')
  }
  const n = Number(v)
  return isNaN(n) ? null : n
}

function detectDelimiter(line: string): string {
  const semicolon = (line.match(/;/g) || []).length
  const comma = (line.match(/,/g) || []).length
  const tab = (line.match(/\t/g) || []).length
  if (tab > semicolon && tab > comma) return '\t'
  return semicolon >= comma ? ';' : ','
}

function splitCSV(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      quoted = !quoted
      continue
    }
    if (c === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseCSV(text: string): ParsedCSV {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.trim() !== '')
  if (!lines.length) return { headers: [], rows: [], detectedRows: 0 }
  const delimiter = detectDelimiter(lines[0])
  const headers = splitCSV(lines[0], delimiter)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSV(lines[i], delimiter)
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows, detectedRows: rows.length }
}

function findColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map((h) => ({ original: h, normalized: normalizeHeader(h) }))
  for (const alias of aliases) {
    const a = normalizeHeader(alias)
    const exact = normalized.find((c) => c.normalized === a)
    if (exact) return exact.original
  }
  for (const alias of aliases) {
    const a = normalizeHeader(alias)
    const partial = normalized.find((c) => c.normalized.includes(a) || a.includes(c.normalized))
    if (partial) return partial.original
  }
  return null
}

export function mapSystemRecords(parsed: ParsedCSV): SystemRecord[] {
  const data = findColumn(parsed.headers, ['Data'])
  const parceiro = findColumn(parsed.headers, ['Parceiro', 'Fornecedor', 'Partner', 'Nome'])
  const lancamento = findColumn(parsed.headers, [
    'Lançamento Diário',
    'Lancamento Diario',
    'Lancamento',
    'Diario',
  ])
  const numero = findColumn(parsed.headers, ['Número', 'Numero', 'NF', 'Nota Fiscal'])
  const referencia = findColumn(parsed.headers, ['Referência', 'Referencia', 'Ref'])
  const debito = findColumn(parsed.headers, ['Débito', 'Debito'])
  const total = findColumn(parsed.headers, ['Total'])
  const credito = findColumn(parsed.headers, ['Crédito', 'Credito', 'Valor', 'Total'])
  const categoria = findColumn(parsed.headers, ['Categoria'])

  return parsed.rows.map((row, index) => {
    const totalVal = total ? parseBrazilianNumber(row[total]) : null
    const creditoVal = credito ? (parseBrazilianNumber(row[credito]) ?? 0) : 0
    return {
      id: String(index),
      data: data ? row[data] : '',
      parceiro: parceiro ? row[parceiro] : '',
      lancamentoDiario: lancamento ? row[lancamento] : undefined,
      numero: numero ? row[numero] : undefined,
      referencia: referencia ? row[referencia] : undefined,
      categoria: categoria ? row[categoria] : undefined,
      debito: debito ? parseBrazilianNumber(row[debito]) : null,
      credito: creditoVal,
      total: totalVal,
    }
  })
}

export function mapCardRecords(parsed: ParsedCSV): CardRecord[] {
  const data = findColumn(parsed.headers, ['Data'])
  const estabelecimento = findColumn(parsed.headers, [
    'Estabelecimento',
    'Parceiro',
    'Fornecedor',
    'Nome',
    'Descrição',
    'Descricao',
  ])
  const categoria = findColumn(parsed.headers, ['Categoria'])
  const valor = findColumn(parsed.headers, ['Valor (R$)', 'Valor', 'Crédito', 'Credito', 'Total'])

  return parsed.rows.map((row, index) => ({
    id: String(index),
    data: data ? row[data] : '',
    estabelecimento: estabelecimento ? row[estabelecimento] : '',
    categoria: categoria ? row[categoria] : undefined,
    valor: valor ? (parseBrazilianNumber(row[valor]) ?? 0) : 0,
  }))
}
