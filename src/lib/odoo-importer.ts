/**
 * Módulo de Importação Independente do Odoo
 * Grupo EPA - Reconstrução do fluxo contábil
 *
 * Responsabilidades:
 * 1. Processar o Excel (.xlsx) ou CSV original do Odoo sem modificar o arquivo.
 * 2. Mapeamento dinâmico e flexível baseado na estrutura real (Data, Número, Referência, Parceiro, Diário, Total/Crédito).
 * 3. Identificar o campo monetário pela estrutura real (valores numéricos, negativos, separadores brasileiros).
 * 4. Rastrear o número da linha de origem para auditoria completa.
 * 5. Não usar dados fixos nem fictícios: quantidades e totais são computados estritamente dos dados importados.
 */

import { parseExcel } from './excel-parser'
import { parseCSV, parseBrazilianNumber, type ParsedCSV } from './csv-parser'
import { normalizeEntityName, normalizeMoneyValue } from './normalization'

export interface OdooParsedRecord {
  id: string
  /** Linha de origem no arquivo original (para fins de auditoria) */
  linhaOrigem: number
  data: string
  parceiro: string
  parceiroNormalizado: string
  lancamentoDiario?: string
  numero?: string
  referencia?: string
  categoria?: string
  debito: number | null
  credito: number
  total: number
  /** Campo bruto para auditoria */
  rawRow: Record<string, string>
}

export interface OdooImportResult {
  sucesso: boolean
  registros: OdooParsedRecord[]
  detectedRows: number
  totalMonetario: number
  colunaTotalDetectada: string | null
  colunaParceiroDetectada: string | null
  colunaDataDetectada: string | null
  colunasEncontradas: string[]
  avisos: string[]
  erro?: string
}

function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function findColumnByAliases(headers: string[], aliases: string[]): string | null {
  const normHeaders = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }))

  // 1. Busca exata
  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias)
    const match = normHeaders.find((c) => c.norm === normAlias)
    if (match) return match.original
  }

  // 2. Busca parcial
  for (const alias of aliases) {
    const normAlias = normalizeHeader(alias)
    const match = normHeaders.find((c) => c.norm.includes(normAlias) || normAlias.includes(c.norm))
    if (match) return match.original
  }

  return null
}

/**
 * Normaliza datas do Odoo (suporta DD/MM/AAAA, AAAA-MM-DD, e Date do Excel)
 */
function normalizeOdooDate(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
  }

  const brMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/)
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0')
    const m = brMatch[2].padStart(2, '0')
    let y = brMatch[3] || '2026'
    if (y.length === 2) y = `20${y}`
    return `${d}/${m}/${y}`
  }

  const ts = Date.parse(trimmed)
  if (!isNaN(ts)) {
    const d = new Date(ts)
    const day = String(d.getUTCDate()).padStart(2, '0')
    const mon = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${day}/${mon}/${d.getUTCFullYear()}`
  }

  return trimmed
}

/**
 * Importa e valida independentemente a planilha do Odoo (.xlsx ou .csv)
 */
export async function importOdooFile(
  fileOrBuffer: File | ArrayBuffer,
  fileName = 'odoo.xlsx',
): Promise<OdooImportResult> {
  const avisos: string[] = []
  let parsed: ParsedCSV

  try {
    if (fileOrBuffer instanceof File) {
      const lower = fileOrBuffer.name.toLowerCase()
      if (lower.endsWith('.xlsx')) {
        const buffer = await fileOrBuffer.arrayBuffer()
        parsed = await parseExcel(buffer)
      } else if (lower.endsWith('.csv')) {
        const text = await fileOrBuffer.text()
        parsed = parseCSV(text)
      } else {
        return {
          sucesso: false,
          registros: [],
          detectedRows: 0,
          totalMonetario: 0,
          colunaTotalDetectada: null,
          colunaParceiroDetectada: null,
          colunaDataDetectada: null,
          colunasEncontradas: [],
          avisos: [],
          erro: 'Formato não suportado para o Sistema Odoo. Envie um arquivo Excel (.xlsx) ou CSV (.csv).',
        }
      }
    } else {
      parsed = await parseExcel(fileOrBuffer)
    }
  } catch (err) {
    return {
      sucesso: false,
      registros: [],
      detectedRows: 0,
      totalMonetario: 0,
      colunaTotalDetectada: null,
      colunaParceiroDetectada: null,
      colunaDataDetectada: null,
      colunasEncontradas: [],
      avisos: [],
      erro: err instanceof Error ? err.message : 'Falha ao ler arquivo do Odoo.',
    }
  }

  const { headers, rows } = parsed
  if (!headers.length || !rows.length) {
    return {
      sucesso: false,
      registros: [],
      detectedRows: 0,
      totalMonetario: 0,
      colunaTotalDetectada: null,
      colunaParceiroDetectada: null,
      colunaDataDetectada: null,
      colunasEncontradas: headers,
      avisos: ['Arquivo está vazio ou não possui linhas legíveis.'],
      erro: 'Nenhum dado encontrado no arquivo do Odoo.',
    }
  }

  // Identificação inteligente das colunas
  const colData = findColumnByAliases(headers, [
    'Data',
    'Date',
    'Data Contábil',
    'Data do Lançamento',
    'Data Lançamento',
  ])
  const colParceiro = findColumnByAliases(headers, [
    'Parceiro',
    'Partner',
    'Fornecedor',
    'Nome',
    'Contato',
    'Razão Social',
    'Razao Social',
    'Empresa',
  ])
  const colDiario = findColumnByAliases(headers, [
    'Diário',
    'Diario',
    'Lançamento Diário',
    'Lancamento Diario',
    'Journal',
  ])
  const colNumero = findColumnByAliases(headers, [
    'Número',
    'Numero',
    'Number',
    'NF',
    'Nota Fiscal',
    'Documento',
    'Doc',
  ])
  const colReferencia = findColumnByAliases(headers, [
    'Referência',
    'Referencia',
    'Reference',
    'Ref',
  ])
  const colTotal = findColumnByAliases(headers, [
    'Total',
    'Valor Total',
    'Montante',
    'Valor',
    'Crédito',
    'Credito',
    'Credit',
    'Montante Pago',
    'Valor Pago',
  ])
  const colDebito = findColumnByAliases(headers, ['Débito', 'Debito', 'Debit'])
  const colCredito = findColumnByAliases(headers, ['Crédito', 'Credito', 'Credit'])
  const colCategoria = findColumnByAliases(headers, [
    'Categoria',
    'Category',
    'Conta',
    'Conta Analítica',
  ])

  // Se a coluna de total não foi identificada por nome, analisa as colunas buscando campos numéricos
  let colMonetaria = colTotal || colCredito
  if (!colMonetaria) {
    for (const h of headers) {
      let numCount = 0
      for (const r of rows.slice(0, 10)) {
        const val = r[h]
        if (val && !isNaN(normalizeMoneyValue(val)) && normalizeMoneyValue(val) !== 0) {
          numCount++
        }
      }
      if (numCount >= 3) {
        colMonetaria = h
        avisos.push(`Coluna monetária inferida automaticamente pela estrutura: "${h}".`)
        break
      }
    }
  }

  if (!colParceiro && !colMonetaria) {
    return {
      sucesso: false,
      registros: [],
      detectedRows: rows.length,
      totalMonetario: 0,
      colunaTotalDetectada: null,
      colunaParceiroDetectada: null,
      colunaDataDetectada: colData,
      colunasEncontradas: headers,
      avisos,
      erro: 'Não foi possível identificar as colunas mínimas do Odoo (Parceiro e Total/Montante). Verifique se o arquivo enviado é a planilha correta.',
    }
  }

  const mappedRecords: OdooParsedRecord[] = []
  let somaTotal = 0

  rows.forEach((row, idx) => {
    const rawParceiro = colParceiro ? row[colParceiro]?.trim() || '' : ''
    const rawVal = colMonetaria ? row[colMonetaria] : undefined
    const parsedVal = rawVal !== undefined ? normalizeMoneyValue(rawVal) : 0

    // Ignora linhas sem parceiro e com valor zero
    if (!rawParceiro && parsedVal === 0) {
      return
    }

    const rawDate = colData ? row[colData]?.trim() || '' : ''
    const normDate = normalizeOdooDate(rawDate)
    const normParceiro = normalizeEntityName(rawParceiro)

    const record: OdooParsedRecord = {
      id: `odoo-row-${idx + 1}`,
      linhaOrigem: idx + 2, // Linha no Excel (linha 1 é cabeçalho)
      data: normDate,
      parceiro: rawParceiro,
      parceiroNormalizado: normParceiro,
      lancamentoDiario: colDiario ? row[colDiario]?.trim() : undefined,
      numero: colNumero ? row[colNumero]?.trim() : undefined,
      referencia: colReferencia ? row[colReferencia]?.trim() : undefined,
      categoria: colCategoria ? row[colCategoria]?.trim() : undefined,
      debito: colDebito ? parseBrazilianNumber(row[colDebito]) : null,
      credito: parsedVal,
      total: parsedVal,
      rawRow: row,
    }

    mappedRecords.push(record)
    somaTotal += parsedVal
  })

  // Ordenação crescente por valor por padrão (sem alterar os dados originais)
  mappedRecords.sort((a, b) => a.total - b.total)
  somaTotal = Math.round(somaTotal * 100) / 100

  return {
    sucesso: true,
    registros: mappedRecords,
    detectedRows: mappedRecords.length,
    totalMonetario: somaTotal,
    colunaTotalDetectada: colMonetaria,
    colunaParceiroDetectada: colParceiro,
    colunaDataDetectada: colData,
    colunasEncontradas: headers,
    avisos,
  }
}
