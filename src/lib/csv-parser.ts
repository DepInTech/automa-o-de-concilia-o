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

export function parseBrazilianNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return isNaN(value) ? null : Math.round(value * 100) / 100
  }
  let v = String(value).trim().replace(/R\$/gi, '').replace(/\s/g, '')
  if (!v) return null

  // Se tem parênteses ou sinal negativo
  const isNegative = v.startsWith('-') || v.endsWith('-') || (v.startsWith('(') && v.endsWith(')'))
  v = v.replace(/[()-]/g, '')

  if (v.includes(',') && v.includes('.')) {
    // Determina qual é o separador decimal pela última ocorrência
    const lastComma = v.lastIndexOf(',')
    const lastDot = v.lastIndexOf('.')
    if (lastComma > lastDot) {
      // Formato brasileiro: 1.114,06
      v = v.replace(/\./g, '').replace(',', '.')
    } else {
      // Formato americano/internacional com vírgula de milhar: 1,114.06
      v = v.replace(/,/g, '')
    }
  } else if (v.includes(',')) {
    // Apenas vírgula: 1114,06
    v = v.replace(',', '.')
  }
  const n = Number(v)
  if (isNaN(n)) return null
  const result = Math.round(n * 100) / 100
  return isNegative ? -result : result
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
  const data = findColumn(parsed.headers, ['Data', 'Date', 'Data Contábil', 'Data do Lançamento'])
  const parceiro = findColumn(parsed.headers, [
    'Parceiro',
    'Partner',
    'Fornecedor',
    'Nome',
    'Contato',
    'Razão Social',
  ])
  const lancamento = findColumn(parsed.headers, [
    'Diário',
    'Diario',
    'Lançamento Diário',
    'Lancamento Diario',
    'Lancamento',
    'Journal',
    'Diário de Pagamento',
  ])
  const numero = findColumn(parsed.headers, [
    'Número',
    'Numero',
    'Number',
    'NF',
    'Nota Fiscal',
    'Documento',
    'Doc',
  ])
  const referencia = findColumn(parsed.headers, ['Referência', 'Referencia', 'Reference', 'Ref'])
  const debito = findColumn(parsed.headers, ['Débito', 'Debito', 'Debit'])
  const total = findColumn(parsed.headers, ['Total', 'Valor Total', 'Montante'])
  const credito = findColumn(parsed.headers, [
    'Total',
    'Crédito',
    'Credito',
    'Credit',
    'Valor',
    'Valor Pago',
  ])
  const categoria = findColumn(parsed.headers, [
    'Categoria',
    'Category',
    'Conta',
    'Conta Analítica',
  ])

  const mapped: SystemRecord[] = []

  parsed.rows.forEach((row, index) => {
    // Normalização flexível de número/moeda brasileira ou padrão numérico do Excel
    const rawTotal = total ? row[total] : undefined
    const rawCredito = credito ? row[credito] : undefined
    const totalVal = rawTotal !== undefined ? parseBrazilianNumber(rawTotal) : null
    const parsedCredito = rawCredito !== undefined ? parseBrazilianNumber(rawCredito) : null
    const creditoVal =
      totalVal !== null && totalVal !== 0
        ? totalVal
        : parsedCredito !== null
          ? parsedCredito
          : (totalVal ?? 0)

    // Formata a data se for ISO "AAAA-MM-DD", objeto Date ou formato textual extenso (ex: "Wed Jul 01 2026...")
    let rawDateStr = data ? row[data]?.trim() : ''
    if (rawDateStr) {
      const isoMatch = rawDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        rawDateStr = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
      } else if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawDateStr)) {
        const parsedTs = Date.parse(rawDateStr)
        if (!isNaN(parsedTs)) {
          const d = new Date(parsedTs)
          const day = String(d.getUTCDate()).padStart(2, '0')
          const mon = String(d.getUTCMonth() + 1).padStart(2, '0')
          rawDateStr = `${day}/${mon}/${d.getUTCFullYear()}`
        }
      }
    }

    const partnerName = parceiro ? row[parceiro]?.trim() || '' : ''
    // Ignora linhas totalmente vazias sem parceiro e com valor zero
    if (!partnerName && creditoVal === 0 && !rawDateStr) {
      return
    }

    mapped.push({
      id: `sys-${index}`,
      data: rawDateStr,
      parceiro: partnerName || (row[parceiro || ''] ?? ''),
      lancamentoDiario: lancamento ? row[lancamento] : undefined,
      numero: numero ? row[numero] : undefined,
      referencia: referencia ? row[referencia] : undefined,
      categoria: categoria ? row[categoria] : undefined,
      debito: debito ? parseBrazilianNumber(row[debito]) : null,
      credito: creditoVal,
      total: totalVal !== null ? totalVal : creditoVal,
    })
  })

  return mapped
}

export function mapCardRecords(parsed: ParsedCSV): CardRecord[] {
  const data = findColumn(parsed.headers, ['Data', 'Data da Compra', 'Data Transação'])
  const estabelecimento = findColumn(parsed.headers, [
    'Estabelecimento',
    'Parceiro',
    'Fornecedor',
    'Nome',
    'Descrição',
    'Descricao',
  ])
  const portador = findColumn(parsed.headers, ['Portador', 'Cartão Titular', 'Titular'])
  const parcela = findColumn(parsed.headers, ['Parcela', 'Nº Parcela', 'Número Parcela'])
  const categoria = findColumn(parsed.headers, ['Categoria'])
  const valor = findColumn(parsed.headers, ['Valor (R$)', 'Valor', 'Crédito', 'Credito', 'Total'])
  const valorUs = findColumn(parsed.headers, ['Valor (US$)', 'Valor US$', 'Valor USD'])
  const cotacaoUs = findColumn(parsed.headers, ['Cotacao US$', 'Cotação US$', 'Cotacao', 'Cotação'])
  const observacao = findColumn(parsed.headers, ['Observacao', 'Observação', 'Obs'])

  const records: CardRecord[] = []

  parsed.rows.forEach((row, index) => {
    const rawDesc = estabelecimento ? row[estabelecimento]?.trim() || '' : ''
    const rawVal = valor ? row[valor] : undefined
    const parsedVal = rawVal !== undefined ? parseBrazilianNumber(rawVal) : null

    // Ignora linhas sem estabelecimento ou cabeçalho residual
    if (!rawDesc || /^(estabelecimento|descri[cç][aã]o|total\s+geral)$/i.test(rawDesc)) {
      return
    }

    const valNum = parsedVal ?? 0
    let dateStr = data ? row[data]?.trim() || '' : ''
    // Normaliza data DD/MM para DD/MM com ano inferido se necessário
    if (dateStr) {
      const brMatch = dateStr.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/)
      if (brMatch) {
        const d = brMatch[1].padStart(2, '0')
        const m = brMatch[2].padStart(2, '0')
        const y = brMatch[3] ? (brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3]) : '2026'
        dateStr = `${d}/${m}/${y}`
      }
    }

    const valUsNum = valorUs && row[valorUs] ? parseBrazilianNumber(row[valorUs]) : null
    const cotacaoNum = cotacaoUs && row[cotacaoUs] ? parseBrazilianNumber(row[cotacaoUs]) : null
    const isInternacional =
      (valUsNum !== null && valUsNum > 0) ||
      (observacao && /internacional/i.test(row[observacao] || ''))

    records.push({
      id: `card-${index}`,
      data: dateStr,
      estabelecimento: rawDesc,
      categoria: categoria ? row[categoria]?.trim() || undefined : undefined,
      valor: valNum,
      isInternacional: !!isInternacional,
      moedaGlobal: isInternacional ? 'US$' : undefined,
      moedaLocal: isInternacional ? 'BRL' : undefined,
      cotacao: cotacaoNum ?? undefined,
      cartaoTitular: portador ? row[portador]?.trim() || undefined : undefined,
      parcela: parcela ? row[parcela]?.trim() || undefined : undefined,
      observacao: observacao ? row[observacao]?.trim() || undefined : undefined,
    } as CardRecord)
  })

  return records
}
