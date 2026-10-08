import type { BankType, CardRecord } from './types'
import { extractPdfText, type PdfExtractionResult } from './pdf-parser'
import { parseBrazilianNumber } from './csv-parser'

export interface StructuredCardRecord extends CardRecord {
  numero?: string
  referencia?: string
  rawLine?: string
}

export interface CardPdfParseResult {
  records: StructuredCardRecord[]
  detectedRows: number
  unparsedLinesCount: number
  warning?: string
  isScannedOrEmpty: boolean
  numPages: number
}

// Linhas de rodapé, cabeçalho bancário, totalizadores, encargos que a macro descartava
const DISCARD_PATTERNS = [
  /total\s+(da\s+)?fatura/i,
  /total\s+desta\s+fatura/i,
  /pagamento\s+m[ií]nimo/i,
  /limite\s+(de\s+cr[eé]dito|total|dispon[ií]vel)/i,
  /vencimento/i,
  /saldo\s+anterior/i,
  /encargos\s+financeiros/i,
  /iof/i,
  /cet\s+mensal/i,
  /subtotal/i,
  /central\s+de\s+atendimento/i,
  /ouvidoria/i,
  /p[aá]gina\s+\d+(\s+de\s+\d+)?/i,
  /sac\s+\d+/i,
  /itaucard|banco\s+itau|santander\s+brasil/i,
  /data\s+descri[cç][aã]o\s+valor/i,
  /lan[cç]amentos\s+nacionais/i,
  /lan[cç]amentos\s+internacionais/i,
  /movimenta[cç][aã]o/i,
]

// Categorias comuns identificáveis
const KNOWN_CATEGORIES = [
  'Servicos',
  'Serviços',
  'Suprimentos',
  'Operacional',
  'Alimentacao',
  'Alimentação',
  'Transporte',
  'Viagem',
  'Tecnologia',
  'Divergente',
  'Outros',
]

function shouldDiscardLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 5) return true
  return DISCARD_PATTERNS.some((pat) => pat.test(trimmed))
}

function normalizeDate(rawDate: string): string {
  const parts = rawDate.split(/[/.-]/)
  if (parts.length === 2) {
    // Dia/Mês -> assume ano corrente (2024 ou 2025)
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    return `${day}/${month}/2024`
  }
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    let year = parts[2]
    if (year.length === 2) year = `20${year}`
    return `${day}/${month}/${year}`
  }
  return rawDate
}

/**
 * Tenta parsear uma única linha da fatura bancária em PDF.
 * Reproduz as regras da macro bancária tradicional (Itaú / Santander):
 * Padrão A: "DD/MM(/AAAA) [NUMERO/REF] NOME ESTABELECIMENTO [CATEGORIA] R$ 1.234,56"
 * Padrão B: "DD/MM NOME DO ESTABELECIMENTO 123,45"
 * Padrão C: Formato colunar separado por tabulações ou múltiplos espaços
 */
function parseInvoiceLine(
  line: string,
  index: number,
  _bank: BankType,
): StructuredCardRecord | null {
  if (shouldDiscardLine(line)) return null

  // 1. Procurar data no início da linha: dd/mm/aaaa ou dd/mm
  const dateMatch = line.match(/^(\d{2}[/.-]\d{2}(?:[/.-]\d{2,4})?)\b/)
  if (!dateMatch) {
    return null
  }

  const rawDate = dateMatch[1]
  const dateFormatted = normalizeDate(rawDate)
  let remainder = line.slice(dateMatch[0].length).trim()

  // 2. Procurar valor monetário no final ou próximo ao final
  // Formatos aceitos: "R$ 1.234,56", "1.234,56", "-123,45", "123,45-"
  const valueRegex = /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?:\s*([CD-]))?$/i
  const valMatch = remainder.match(valueRegex)

  if (!valMatch) {
    // Tenta achar qualquer valor monetário na string se não estiver estritamente no final
    const altValMatch = remainder.match(
      /(?:R\$\s*)?(-?\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?:\s*([CD-]))?\s*$/i,
    )
    if (!altValMatch) return null
  }

  const matchedValueStr = valMatch ? valMatch[1] : ''
  const isCreditOrNegative =
    valMatch &&
    (valMatch[2] === '-' || valMatch[2]?.toUpperCase() === 'C' || matchedValueStr.startsWith('-'))
  const parsedValue = parseBrazilianNumber(matchedValueStr)
  if (parsedValue === null || isNaN(parsedValue)) return null

  const finalValue = isCreditOrNegative && parsedValue > 0 ? -parsedValue : parsedValue

  // 3. O miolo entre a data e o valor é o estabelecimento, referência, número e categoria
  const endIdx = remainder.lastIndexOf(matchedValueStr)
  let middleText = (endIdx !== -1 ? remainder.substring(0, endIdx) : remainder)
    .replace(/R\$\s*$/, '')
    .trim()

  // Identifica se há número de documento ou referência (ex: DOC-1234, NF-0012, REF-1020, etc.)
  let docNumero: string | undefined
  let docRef: string | undefined

  const numMatch = middleText.match(/\b(NF[- ]?\d+|DOC[- ]?\d+|\d{6,8})\b/i)
  if (numMatch) {
    docNumero = numMatch[1]
    middleText = middleText.replace(numMatch[0], ' ').trim()
  }

  const refMatch = middleText.match(/\b(REF[- ]?[A-Z0-9]+)\b/i)
  if (refMatch) {
    docRef = refMatch[1]
    middleText = middleText.replace(refMatch[0], ' ').trim()
  }

  // Identifica categoria se estiver explícita no miolo
  let detectedCategory: string | undefined
  for (const cat of KNOWN_CATEGORIES) {
    const reg = new RegExp(`\\b${cat}\\b`, 'i')
    if (reg.test(middleText)) {
      detectedCategory = cat
      middleText = middleText.replace(reg, ' ').trim()
      break
    }
  }

  // Limpa espaços extras do nome do estabelecimento
  const cleanEstabelecimento = middleText
    .replace(/\s{2,}/g, ' ')
    .replace(/^[-–—]\s*/, '')
    .replace(/\s*[-–—]$/, '')
    .trim()

  if (!cleanEstabelecimento || cleanEstabelecimento.length < 2) {
    return null
  }

  return {
    id: `pdf-rec-${index}`,
    data: dateFormatted,
    estabelecimento: cleanEstabelecimento,
    categoria: detectedCategory,
    valor: Math.abs(finalValue), // A conciliação compara com os créditos do sistema (valores positivos)
    numero: docNumero,
    referencia: docRef,
    rawLine: line,
  }
}

/**
 * Módulo de parsing isolado da fatura bancária em PDF.
 * Lê o PDF, extrai as páginas, processa os registros linha a linha reproduzindo
 * as transformações que antes eram executadas pela macro.
 */
export async function parseCardPdf(
  file: File | ArrayBuffer,
  bank: BankType = 'itau',
): Promise<CardPdfParseResult> {
  const extraction = await extractPdfText(file)

  if (extraction.isScannedOrEmpty || extraction.pages.length === 0) {
    return {
      records: [],
      detectedRows: 0,
      unparsedLinesCount: 0,
      isScannedOrEmpty: true,
      numPages: extraction.numPages,
      warning:
        'Não foi possível identificar dados de texto estruturado neste arquivo PDF. Ele pode ser uma imagem digitalizada ou estar protegido.',
    }
  }

  const records: StructuredCardRecord[] = []
  let unparsedCount = 0
  let totalCandidates = 0

  // Quebra todo o texto em linhas para análise
  const lines: string[] = []
  for (const p of extraction.pages) {
    lines.push(...p.lines)
  }

  // Se vieram poucas linhas por quebra do motor, divide fullText por quebra de linha
  const candidateLines = lines.length > 5 ? lines : extraction.fullText.split(/\r?\n/)

  let recIdx = 0
  for (const rawLine of candidateLines) {
    const line = rawLine.trim()
    if (!line) continue

    // Verifica se a linha parece com lançamento financeiro (tem data ou valor)
    const hasDateLike = /\b\d{2}[/.-]\d{2}\b/.test(line)
    const hasMoneyLike = /\d+,\d{2}/.test(line)

    if (hasDateLike && hasMoneyLike) {
      totalCandidates++
      const rec = parseInvoiceLine(line, recIdx++, bank)
      if (rec) {
        records.push(rec)
      } else {
        unparsedCount++
      }
    }
  }

  // Caso especial: se não encontrou registros estruturados mas há texto
  let warningMessage: string | undefined
  if (records.length === 0) {
    warningMessage =
      'Não foi possível identificar os dados da fatura neste PDF. Verifique se o arquivo está legível e tente novamente.'
  } else if (unparsedCount > 0 && records.length < 5 && totalCandidates > records.length * 2) {
    warningMessage =
      'Atenção: alguns registros da fatura não puderam ser identificados. Revise os dados antes de iniciar a conciliação.'
  }

  return {
    records,
    detectedRows: records.length,
    unparsedLinesCount: unparsedCount,
    warning: warningMessage,
    isScannedOrEmpty: false,
    numPages: extraction.numPages,
  }
}
