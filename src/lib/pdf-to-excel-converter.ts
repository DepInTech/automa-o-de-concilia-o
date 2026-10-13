/**
 * Módulo de Conversor de Fatura PDF para Excel
 * Grupo EPA - Reconstrução organizada de fluxo
 *
 * Responsabilidades:
 * 1. Extrair todas as transações válidas de faturas Itaú em PDF (várias páginas, nacionais e internacionais).
 * 2. Gerar uma planilha Excel (.xlsx real) com:
 *    - Aba 1 "Transações": Data, Descrição original, Nome normalizado, Valor original, Moeda original, Valor em reais, Portador, Parcela, Tipo, Página, Indicador de confiança.
 *    - Aba 2 "Resumo da Extração": Nome do arquivo, Quantidade de páginas, Quantidade de transações, Revisões necessárias, Total em R$, Avisos.
 * 3. Garantir que valores monetários sejam numéricos reais no Excel.
 * 4. Permitir conferência visual e download do Excel convertido antes da conciliação.
 */

import { extractPdfText, type ExtractedPdfPage } from './pdf-parser'
import {
  normalizeMoneyValue,
  normalizeEntityName,
  isFiscalIdentifierSequence,
} from './normalization'
import { generateXlsxBlob, type ExcelSheet } from './xlsx-generator'

export interface InvoiceExtractedRecord {
  id: string
  /** Data no formato DD/MM/AAAA */
  data: string
  /** Descrição original exatamente como impressa na fatura */
  descricaoOriginal: string
  /** Nome normalizado em campo separado para correspondência */
  nomeNormalizado: string
  /** Valor original informado (ex: 20.00 em USD ou 108.40) */
  valorOriginal?: number
  /** Moeda original (ex: 'BRL', 'USD', 'EUR') */
  moedaOriginal: string
  /** Valor em reais efetivamente cobrado na fatura (referência contábil) */
  valorReais: number
  /** Portador do cartão, quando identificado */
  portador?: string
  /** Parcela, se informada (ex: '01/03') */
  parcela?: string
  /** Observação manual presente na conferência */
  observacaoManual?: string
  /** 'Nacional' | 'Internacional' | 'Tarifa' | 'Estorno' */
  tipo: 'Nacional' | 'Internacional' | 'Tarifa' | 'Estorno'
  /** Página de origem onde o lançamento foi encontrado */
  paginaOrigem: number
  /** Indicador de confiança da extração (0 a 100) */
  confianca: number
  /** Linha bruta original */
  rawLine?: string
}

export interface InvoiceConversionSummary {
  nomeArquivo: string
  quantidadePaginas: number
  quantidadeTransacoes: number
  quantidadeRevisao: number
  registrosComFalha: number
  totalValorReais: number
  totalDeclaradoChecksum?: number
  divergenciaChecksum?: number
  paginasComFalha: number[]
  avisos: string[]
  isDigitalizadoOuVazio: boolean
}

export interface InvoiceConversionResult {
  sucesso: boolean
  registros: InvoiceExtractedRecord[]
  resumo: InvoiceConversionSummary
  excelBlob?: Blob
  nomeArquivoExcel: string
  erroCritico?: string
}

const SUMMARY_PATTERNS = [
  /resumo\s+da\s+fatura/i,
  /saldo\s+da\s+fatura\s+anterior/i,
  /total\s+fatura\s+anterior/i,
  /total\s+(da|desta)\s+fatura/i,
  /pagamento\s+m[ií]nimo/i,
  /total\s+de\s+produtos[,\s]+servi[cç]os\s+e\s+encargos/i,
  /total\s+de\s+lan[cç]amentos\s+nacionais/i,
  /total\s+de\s+lan[cç]amentos\s+internacionais/i,
  /total\s+de\s+lan[cç]amentos/i,
  /encargos\s+desta\s+fatura/i,
  /mora/i,
  /taxa\s+de\s+juros/i,
  /multa\s+por\s+atraso/i,
  /repasse\s+de\s+iof/i,
  /encargos\s+e\s+custo\s+efetivo/i,
  /rotativo\s*\(pagamento/i,
  /compras\s+parceladas/i,
  /parcelamento\s+da\s+fatura/i,
  /demais\s+taxas\s+de\s+juros/i,
  /fique\s+atento\s+aos\s+encargos/i,
  /juros\s+m[aá]ximos\s+do\s+contrato/i,
  /cet\s+da\s+compra/i,
  /valor\s+total\s+financiado/i,
  /valor\s+total\s+a\s+pagar/i,
  /atualizado\s+em\s+\d{2}\/\d{2}/i,
  /em\s+caso\s+de\s+d[uú]vidas/i,
  /ouvidoria/i,
  /sac\s+\d+/i,
  /sac\b/i,
  /fale\s+conosco/i,
  /central\s+de\s+atendimento/i,
  /ag[eê]ncia\s+contacorrente/i,
  /fatura\s+do\s+cart[aã]o:/i,
  /vencimento:/i,
  /data\s+de\s+fechamento:/i,
  /produtos,\s+servi[cç]os\s+e\s+encargos/i,
  /limite\s+de\s+cr[eé]dito/i,
  /limite\s+total/i,
  // Padrões cadastrais e institucionais universais (cabeçalhos fiscais de fatura)
  /^(?:cnpj|cpf)[\s:]*[\d.-]+/i,
  /^(?:inscri[cç][aã]o\s+estadual|i\.?e\.?)[\s:]*[\d.-]+/i,
  /^raz[aã]o\s+social[\s:]*/i,
  /^nome\s+empresarial[\s:]*/i,
  /^titular\s+(?:da\s+conta|do\s+cart[aã]o)[\s:]*/i,
  /^endere[cç]o[\s:]+/i,
  /^cep[\s:]*\d{5}-?\d{3}/i,
  /^banco\s+(?:m[uú]ltiplo|s\.?a\.?)\b/i,
]

function isSummaryOrFooter(line: string): boolean {
  const t = line.trim()
  if (!t || t.length < 3) return true
  if (isFiscalIdentifierSequence(t)) return true
  return SUMMARY_PATTERNS.some((pat) => pat.test(t))
}

function normalizeCardDateYear(raw: string, refYear = 2026): string {
  if (!raw) return ''
  const trimmed = raw.trim()

  // Se for string de Date do Excel (ex.: "Fri Jun 19 2026 00:00:00 GMT+0000...")
  const ts = Date.parse(trimmed)
  if (!isNaN(ts) && /[a-zA-Z]{3}/.test(trimmed)) {
    const d = new Date(ts)
    const day = String(d.getUTCDate()).padStart(2, '0')
    const mon = String(d.getUTCMonth() + 1).padStart(2, '0')
    return `${day}/${mon}/${d.getUTCFullYear()}`
  }

  // Se for formato ISO "AAAA-MM-DD"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
  }

  const parts = trimmed.split(/[/.-]/)
  if (parts.length === 2) {
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    return `${d}/${m}/${refYear}`
  }
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    let y = parts[2]
    if (y.length === 2) y = `20${y}`
    return `${d}/${m}/${y}`
  }
  return trimmed
}

/**
 * Converte linha inline de fatura em registro estruturado
 */
function parseInvoiceLine(
  line: string,
  pageNum: number,
  idx: number,
): InvoiceExtractedRecord | null {
  if (isSummaryOrFooter(line)) return null

  const clean = line
    .replace(/\|/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const dateMatch = clean.match(/^(\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?)\b/)
  if (!dateMatch) return null

  // Rejeita linha inteira se tiver identificador fiscal (CNPJ, CPF, I.E.)
  if (isFiscalIdentifierSequence(clean)) return null

  const rawDate = dateMatch[1].replace(/\s+/g, '')
  const remainder = clean.slice(dateMatch[0].length).trim()

  // Procura valor no final da linha (ex: "-18,75", "R$ 1.114,06", "1.199,00", "108,40")
  // Tolerante a colunas adicionais no final ou intermediárias (como cotação, IOF, parcelamento)
  let valMatch = remainder.match(
    /(?:-?\s*R\$\s*|-?\s*US\$\s*|-?\s*USD\s*)?(-?\s*R?\$?\s*[\d.,]+\d{2})\s*$/i,
  )

  // Se não casou no final exato (ex: há texto residual de cotação ou parcela após o valor),
  // busca o último valor monetário presente na linha
  if (!valMatch) {
    const allVals = Array.from(
      remainder.matchAll(/(?:-?\s*R\$\s*|-?\s*US\$\s*|-?\s*USD\s*)?(-?\s*R?\$?\s*[\d.,]+\d{2})/gi),
    )
    if (allVals.length > 0) {
      valMatch = allVals[allVals.length - 1] as RegExpMatchArray
    }
  }

  if (!valMatch) return null

  const rawValStr = valMatch[0].trim()

  // Se o valor for adjacente a barra '/', como em '48.045.090/', rejeita
  const valPos = remainder.lastIndexOf(rawValStr)
  const afterValStr = remainder.slice(valPos + rawValStr.length).trim()
  const beforeValChar = valPos > 0 ? remainder[valPos - 1] : ''
  if (afterValStr.startsWith('/') || beforeValChar === '/') {
    return null
  }

  const valReais = normalizeMoneyValue(rawValStr)
  if (isNaN(valReais) || valReais === 0) return null

  const valIndex = remainder.lastIndexOf(rawValStr)
  let desc = remainder
    .slice(0, valIndex !== -1 ? valIndex : remainder.length - rawValStr.length)
    .replace(/^[-:| ]+|[-:| ]+$/g, '')
    .trim()
  if (!desc || desc.length < 2 || isSummaryOrFooter(desc)) return null

  // Se for cabeçalho
  if (/^(descri[cç][aã]o|valor|data|lan[cç]amentos|total)$/i.test(desc)) return null

  // Parcela (ex: "01/03")
  let parcela: string | undefined
  const pMatch = desc.match(/\b(\d{1,2}\/\d{1,2})\b$/)
  if (pMatch) {
    parcela = pMatch[1]
  }

  // Verifica se a linha contém dados internacionais (USD, US$, cotação)
  const isIntl = /usd|us\$|moeda\s*local|cota[cç][aã]o/i.test(line)
  let valOriginal = Math.abs(valReais)
  let moedaOriginal = 'BRL'

  if (isIntl) {
    const usdMatch = line.match(/(?:USD|US\$)\s*([\d,.]+)/i)
    if (usdMatch) {
      valOriginal = normalizeMoneyValue(usdMatch[1])
      moedaOriginal = 'USD'
    }
  }

  const isEstorno = valReais < 0 || /estorno|reembolso|desconto/i.test(desc)
  const tipo: InvoiceExtractedRecord['tipo'] = isEstorno
    ? 'Estorno'
    : isIntl
      ? 'Internacional'
      : /tarifa|anuidade|iof|encargos/i.test(desc)
        ? 'Tarifa'
        : 'Nacional'

  const nomeNorm = normalizeEntityName(desc)
  const confianca = nomeNorm.length >= 3 ? 95 : 75

  return {
    id: `fat-${pageNum}-${idx}`,
    data: normalizeCardDateYear(rawDate),
    descricaoOriginal: desc,
    nomeNormalizado: nomeNorm,
    valorOriginal: valOriginal,
    moedaOriginal,
    valorReais: valReais,
    parcela,
    tipo,
    paginaOrigem: pageNum,
    confianca,
    rawLine: line,
  }
}

/**
 * Extrai registros de uma página individual
 */
function extractRecordsFromPage(
  page: ExtractedPdfPage,
  startIdx: { val: number },
): InvoiceExtractedRecord[] {
  const records: InvoiceExtractedRecord[] = []
  const lines = page.lines

  // 1. Tenta linhas com pipe ou inline
  for (const raw of lines) {
    const trimmed = raw.trim()
    if (!trimmed || isSummaryOrFooter(trimmed)) continue

    // Suporte a markdown pipe: | 05/06 | OPENAI *CHATGPT SUBSCR | USD20,00 | US$20,00 | R$5,42 | R$108,40 |
    if (trimmed.includes('|')) {
      const parts = trimmed
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length >= 3 && /^\d{1,2}[/.-]\d{1,2}/.test(parts[0])) {
        const lastPart = parts[parts.length - 1]
        const valReais = normalizeMoneyValue(lastPart)
        if (valReais !== 0) {
          const desc = parts[1]
          if (!isSummaryOrFooter(desc) && !isFiscalIdentifierSequence(desc)) {
            const isIntl = parts.length >= 5 || /usd|us\$/i.test(trimmed)
            records.push({
              id: `fat-${page.pageNumber}-${startIdx.val++}`,
              data: normalizeCardDateYear(parts[0]),
              descricaoOriginal: desc,
              nomeNormalizado: normalizeEntityName(desc),
              valorOriginal:
                isIntl && parts[2] ? normalizeMoneyValue(parts[2]) : Math.abs(valReais),
              moedaOriginal: isIntl ? 'USD' : 'BRL',
              valorReais: valReais,
              tipo: isIntl ? 'Internacional' : 'Nacional',
              paginaOrigem: page.pageNumber,
              confianca: 95,
              rawLine: trimmed,
            })
            continue
          }
        }
      }
    }

    const inline = parseInvoiceLine(trimmed, page.pageNumber, startIdx.val)
    if (inline) {
      records.push(inline)
      startIdx.val++
      continue
    }
  }

  // 2. Se o parsing inline direto não encontrou lançamentos ou encontrou poucos,
  // tenta recomposição por blocos colunares adjacentes (data na linha N, descrição na N+1, valor na N+2/N+3/N+4)
  const isDateOnly = (s: string) => /^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/.test(s.trim())
  const isValueOnly = (s: string) =>
    /^(?:-?\s*R\$\s*|-?\s*US\$\s*|-?\s*USD\s*)?-?\s*[\d.,]+\d{2}$/i.test(s.trim())

  if (lines.length >= 2) {
    // 2a. Recomposição em janela deslizante a partir de cada linha que seja data
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!isDateOnly(line)) continue

      // Se essa data já foi processada em um registro inline exatamente igual, checa
      let combined = line
      for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
        const next = lines[j].trim()
        if (!next || isSummaryOrFooter(next)) continue
        // Se encontrou outra data avulsa antes de achar valor, interrompe a janela
        if (isDateOnly(next)) break

        combined += ' ' + next
        const parsed = parseInvoiceLine(combined, page.pageNumber, startIdx.val)
        if (parsed) {
          // Evita duplicar se já foi pego anteriormente
          const alreadyExists = records.some(
            (r) =>
              r.data === parsed.data &&
              r.nomeNormalizado === parsed.nomeNormalizado &&
              Math.abs(r.valorReais - parsed.valorReais) < 0.01,
          )
          if (!alreadyExists) {
            records.push(parsed)
            startIdx.val++
          }
          i = j
          break
        }
      }
    }

    // 2b. Recomposição colunar por colunas agregadas:
    // Se ainda restarem poucos registros ou nenhum, detecta se o Itaú separou
    // bloco de datas, bloco de descrições e bloco de valores na mesma página
    if (records.length === 0) {
      const colDates: string[] = []
      const colDescs: string[] = []
      const colVals: number[] = []

      for (const raw of lines) {
        const t = raw.trim()
        if (!t || isSummaryOrFooter(t)) continue
        if (/^(data|descri[cç][aã]o|valor|lan[cç]amentos|total)$/i.test(t)) continue
        if (/^[A-Z\s]{4,}\s*-\s*FINAL\s*\d{4}$/i.test(t)) continue

        if (isDateOnly(t)) {
          colDates.push(t)
        } else if (isValueOnly(t) && !isFiscalIdentifierSequence(t)) {
          const v = normalizeMoneyValue(t)
          if (!isNaN(v) && v !== 0) {
            colVals.push(v)
          }
        } else if (
          t.length >= 2 &&
          !/^(iof|repasse\s+de\s+iof|cota[cç][aã]o)/i.test(t) &&
          !isFiscalIdentifierSequence(t)
        ) {
          colDescs.push(t)
        }
      }

      // Se temos descrições e valores colunares (mesmo com tolerância de tamanho)
      if (colDescs.length > 0 && colVals.length > 0) {
        const matchCount = Math.min(colDescs.length, colVals.length)
        for (let k = 0; k < matchCount; k++) {
          const dt = colDates[k] || colDates[colDates.length - 1] || '01/06'
          const desc = colDescs[k]
          const val = colVals[k]
          if (desc && val !== 0) {
            const isEstorno = val < 0 || /estorno|reembolso|desconto/i.test(desc)
            const isIntl = /usd|us\$|moeda\s*local|cota[cç][aã]o/i.test(desc)
            const nomeNorm = normalizeEntityName(desc)
            records.push({
              id: `fat-${page.pageNumber}-${startIdx.val++}`,
              data: normalizeCardDateYear(dt),
              descricaoOriginal: desc,
              nomeNormalizado: nomeNorm,
              valorOriginal: Math.abs(val),
              moedaOriginal: isIntl ? 'USD' : 'BRL',
              valorReais: val,
              tipo: isEstorno ? 'Estorno' : isIntl ? 'Internacional' : 'Nacional',
              paginaOrigem: page.pageNumber,
              confianca: nomeNorm.length >= 3 ? 90 : 70,
              rawLine: `${dt} ${desc} ${val}`,
            })
          }
        }
      }
    }
  }

  return records
}

/**
 * Converte um PDF de fatura Itaú em dados estruturados e planilha .xlsx real
 */
/**
 * Converte uma fatura fornecida como planilha (.xlsx ou .csv) em InvoiceConversionResult
 */
export async function convertInvoiceSpreadsheetToExcel(
  fileOrBuffer: File | ArrayBuffer,
  fileName = 'fatura.xlsx',
): Promise<InvoiceConversionResult> {
  let parsed: { headers: string[]; rows: Record<string, string>[]; sheetName?: string }
  try {
    if (fileOrBuffer instanceof File) {
      const lower = fileOrBuffer.name.toLowerCase()
      if (lower.endsWith('.xlsx')) {
        const { parseExcel } = await import('./excel-parser')
        const buffer = await fileOrBuffer.arrayBuffer()
        parsed = await parseExcel(buffer)
      } else {
        const { parseCSV } = await import('./csv-parser')
        const text = await fileOrBuffer.text()
        parsed = parseCSV(text)
      }
    } else {
      const { parseExcel } = await import('./excel-parser')
      parsed = await parseExcel(fileOrBuffer)
    }
  } catch (err) {
    return {
      sucesso: false,
      registros: [],
      resumo: {
        nomeArquivo: fileName,
        quantidadePaginas: 1,
        quantidadeTransacoes: 0,
        quantidadeRevisao: 0,
        registrosComFalha: 1,
        totalValorReais: 0,
        paginasComFalha: [1],
        avisos: [
          err instanceof Error
            ? `Erro ao ler planilha de fatura: ${err.message}`
            : 'Erro ao ler arquivo da fatura.',
        ],
        isDigitalizadoOuVazio: false,
      },
      nomeArquivoExcel: fileName.replace(/\.[^/.]+$/, '_convertido.xlsx'),
      erroCritico: 'Não foi possível ler a planilha da fatura enviada.',
    }
  }

  const { headers, rows } = parsed
  if (!headers.length || !rows.length) {
    return {
      sucesso: false,
      registros: [],
      resumo: {
        nomeArquivo: fileName,
        quantidadePaginas: 1,
        quantidadeTransacoes: 0,
        quantidadeRevisao: 0,
        registrosComFalha: 1,
        totalValorReais: 0,
        paginasComFalha: [1],
        avisos: ['A planilha de fatura enviada está vazia ou sem linhas legíveis.'],
        isDigitalizadoOuVazio: false,
      },
      nomeArquivoExcel: fileName.replace(/\.[^/.]+$/, '_convertido.xlsx'),
      erroCritico: 'A planilha de fatura está vazia ou sem transações.',
    }
  }

  // Mapeamento inteligente de colunas da fatura
  const normHeaders = headers.map((h) => ({
    original: h,
    norm: h
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  }))

  const findCol = (aliases: string[]) => {
    for (const a of aliases) {
      const na = a
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      const match = normHeaders.find((h) => h.norm === na || h.norm.includes(na))
      if (match) return match.original
    }
    return null
  }

  const colData = findCol(['data', 'data transacao', 'data compra', 'date'])
  const colDesc = findCol([
    'estabelecimento',
    'descricao',
    'descricao original',
    'parceiro',
    'historico',
    'lancamento',
    'nome',
  ])
  // Na fatura Itaú XLSX, as colunas podem ser "Valor em reais" e "Valor em dólares".
  // Buscamos especificamente "valor em reais" antes de aliases genéricos como "valor" ou "total".
  const colValor = findCol([
    'valor em reais',
    'valor reais',
    'valor r$',
    'valor (r$)',
    'valor_reais',
    'valor',
    'total',
    'montante',
    'credito',
    'debito',
  ])
  const colValorDolar = findCol([
    'valor em dolares',
    'valor em dolar',
    'valor dolares',
    'valor us$',
    'valor usd',
    'valor (us$)',
  ])
  const colCotacao = findCol(['cotacao', 'cotacao us$', 'cotacao usd'])
  const colParcela = findCol(['parcela', 'n parcela', 'numero parcela', 'nro parcela'])
  const colPortador = findCol(['portador', 'titular', 'cartao titular', 'nome portador'])
  const colTipo = findCol(['tipo', 'tipo de lancamento', 'categoria'])
  const colObservacao = findCol([
    'observacao',
    'observacoes',
    'obs',
    'conferencia',
    'nota',
    'status',
  ])

  const records: InvoiceExtractedRecord[] = []
  let rowIdx = 1

  for (const r of rows) {
    const rawDesc = colDesc ? r[colDesc]?.trim() || '' : ''
    const rawVal = colValor ? r[colValor] : undefined
    const rawObs = colObservacao ? r[colObservacao]?.trim() || '' : ''
    const rawParcela = colParcela ? r[colParcela]?.trim() || '' : ''

    // Detecta linha de total no rodapé (ex.: "Parcela: total", ou descrição vazia com valor igual à soma)
    if (
      rawParcela.toLowerCase() === 'total' ||
      /^(total|total\s+geral|saldo\s+atual|total\s+desta\s+fatura|total\s+da\s+fatura)$/i.test(
        rawDesc,
      )
    ) {
      continue
    }

    if (!rawDesc && (!rawVal || rawVal === '')) continue

    // Verifica se a descrição é cabeçalho ou rodapé cadastral
    // Nota: um estabelecimento legítimo que contenha termos corporativos não deve ser descartado
    // Linha cadastral fantasma (ex.: "EPA ENG PROT AMBIENTAL LTDA CNPJ 48.045.090/0001-63") possui CNPJ
    if (isFiscalIdentifierSequence(rawDesc) || isSummaryOrFooter(rawDesc)) continue

    const valReais = rawVal !== undefined ? normalizeMoneyValue(rawVal) : 0
    if (isNaN(valReais) || valReais === 0) continue

    // Se o valor em si for identificador fiscal (ex: 48.045.090/), rejeita
    if (rawVal !== undefined && isFiscalIdentifierSequence(String(rawVal))) continue

    const rawDate = colData ? r[colData]?.trim() || '' : ''
    const normDate = normalizeCardDateYear(rawDate || '01/06')
    const nomeNorm = normalizeEntityName(rawDesc)
    const rawValUs = colValorDolar ? r[colValorDolar] : undefined
    const parsedValUs = rawValUs !== undefined ? normalizeMoneyValue(rawValUs) : 0
    const rawCotacao = colCotacao ? r[colCotacao] : undefined

    const isEstorno = valReais < 0 || /estorno|reembolso|desconto/i.test(rawDesc)
    const isIntl =
      parsedValUs > 0 ||
      (rawCotacao !== undefined && rawCotacao !== '') ||
      /usd|us\$|moeda\s*local|cota[cç][aã]o/i.test(rawDesc) ||
      (colTipo && /internacional/i.test(r[colTipo] || ''))

    const tipoVal = colTipo && r[colTipo]?.trim()
    const tipo: InvoiceExtractedRecord['tipo'] =
      tipoVal === 'Internacional' ||
      tipoVal === 'Estorno' ||
      tipoVal === 'Tarifa' ||
      tipoVal === 'Nacional'
        ? tipoVal
        : isEstorno
          ? 'Estorno'
          : isIntl
            ? 'Internacional'
            : 'Nacional'

    records.push({
      id: `fat-sheet-${rowIdx++}`,
      data: normDate,
      descricaoOriginal: rawDesc,
      nomeNormalizado: nomeNorm,
      valorOriginal: isIntl && parsedValUs > 0 ? parsedValUs : Math.abs(valReais),
      moedaOriginal: isIntl ? 'USD' : 'BRL',
      valorReais: valReais,
      portador: colPortador ? r[colPortador]?.trim() : undefined,
      parcela: colParcela ? r[colParcela]?.trim() : undefined,
      observacaoManual: rawObs || undefined,
      tipo,
      paginaOrigem: 1,
      confianca: nomeNorm.length >= 3 ? 98 : 80,
    })
  }

  if (records.length === 0) {
    return {
      sucesso: false,
      registros: [],
      resumo: {
        nomeArquivo: fileName,
        quantidadePaginas: 1,
        quantidadeTransacoes: 0,
        quantidadeRevisao: 0,
        registrosComFalha: 1,
        totalValorReais: 0,
        paginasComFalha: [1],
        avisos: [
          'Nenhum lançamento válido com descrição e valor monetário foi identificado na planilha enviada.',
        ],
        isDigitalizadoOuVazio: false,
      },
      nomeArquivoExcel: fileName.replace(/\.[^/.]+$/, '_convertido.xlsx'),
      erroCritico:
        'Não foi possível extrair lançamentos da planilha de fatura. Verifique se contém colunas de Estabelecimento/Descrição e Valor.',
    }
  }

  // Procura linha de total declarada na planilha (ex.: "Parcela: total" ou "TOTAL GERAL")
  let totalDeclaradoChecksum: number | undefined
  for (const r of rows) {
    const rawP = colParcela ? r[colParcela]?.trim() || '' : ''
    const rawD = colDesc ? r[colDesc]?.trim() || '' : ''
    const rawV = colValor ? r[colValor] : undefined
    if (rawP.toLowerCase() === 'total' || /^(total|total\s+geral)$/i.test(rawD)) {
      const v = normalizeMoneyValue(rawV)
      if (v > 0) {
        totalDeclaradoChecksum = v
        break
      }
    }
  }

  const totalValorReais = Math.round(records.reduce((sum, r) => sum + r.valorReais, 0) * 100) / 100
  let divergenciaChecksum: number | undefined
  const sheetAvisos: string[] = []
  if (totalDeclaradoChecksum !== undefined) {
    divergenciaChecksum = Math.round((totalValorReais - totalDeclaradoChecksum) * 100) / 100
    if (Math.abs(divergenciaChecksum) > 0.01) {
      sheetAvisos.push(
        `Aviso de Checksum Fatura: Soma extraída (R$ ${totalValorReais}) difere do total declarado na fatura (R$ ${totalDeclaradoChecksum}) por R$ ${divergenciaChecksum}.`,
      )
    }
  }
  const baseName = fileName.replace(/\.[^/.]+$/, '')
  const nomeArquivoExcel = `${baseName}_convertido.xlsx`

  const aba1Headers = [
    'Data da Transação',
    'Descrição Original',
    'Nome Normalizado',
    'Valor Original',
    'Moeda Original',
    'Valor em Reais (R$)',
    'Portador',
    'Parcela',
    'Tipo de Lançamento',
    'Página de Origem',
    'Confiança (%)',
  ]

  const aba1Rows = records.map((r) => [
    r.data,
    r.descricaoOriginal,
    r.nomeNormalizado,
    r.valorOriginal ?? r.valorReais,
    r.moedaOriginal,
    r.valorReais,
    r.portador || '',
    r.parcela || '',
    r.tipo,
    r.paginaOrigem,
    r.confianca,
  ])

  const aba2Headers = ['Campo', 'Valor / Descrição']
  const aba2Rows: (string | number)[][] = [
    ['Nome do Arquivo Original', fileName],
    ['Quantidade de Páginas/Abas', 1],
    ['Quantidade de Transações Extraídas', records.length],
    ['Transações que Necessitam de Revisão', 0],
    ['Total dos Lançamentos em Reais (R$)', totalValorReais],
    ['Avisos Identificados', 'Importado a partir de planilha (.xlsx/.csv)'],
  ]

  const excelBlob = generateXlsxBlob([
    { name: 'Transacoes', headers: aba1Headers, rows: aba1Rows },
    { name: 'Resumo da Extração', headers: aba2Headers, rows: aba2Rows },
  ])

  return {
    sucesso: true,
    registros: records,
    resumo: {
      nomeArquivo: fileName,
      quantidadePaginas: 1,
      quantidadeTransacoes: records.length,
      quantidadeRevisao: 0,
      registrosComFalha: 0,
      totalValorReais,
      totalDeclaradoChecksum,
      divergenciaChecksum,
      paginasComFalha: [],
      avisos: sheetAvisos,
      isDigitalizadoOuVazio: false,
    },
    excelBlob,
    nomeArquivoExcel,
  }
}

export async function convertInvoicePdfToExcel(
  fileOrBuffer: File | ArrayBuffer,
  fileName = 'fatura.pdf',
): Promise<InvoiceConversionResult> {
  // Se for arquivo em formato de planilha (.xlsx ou .csv), desvia diretamente para o parser de planilhas
  const effectiveName = fileOrBuffer instanceof File ? fileOrBuffer.name : fileName
  const lowerName = effectiveName.toLowerCase()
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) {
    return convertInvoiceSpreadsheetToExcel(fileOrBuffer, effectiveName)
  }

  const extraction = await extractPdfText(fileOrBuffer)
  const avisos: string[] = []
  const paginasComFalha: number[] = []

  if (extraction.isScannedOrEmpty || extraction.pages.length === 0) {
    return {
      sucesso: false,
      registros: [],
      resumo: {
        nomeArquivo: fileName,
        quantidadePaginas: extraction.numPages || 0,
        quantidadeTransacoes: 0,
        quantidadeRevisao: 0,
        registrosComFalha: 1,
        totalValorReais: 0,
        paginasComFalha: [1],
        avisos: [
          'O arquivo PDF não contém texto pesquisável ou é uma digitalização (imagem escaneada). É necessário um PDF legível com texto digital.',
        ],
        isDigitalizadoOuVazio: true,
      },
      nomeArquivoExcel: fileName.replace(/\.pdf$/i, '_convertido.xlsx'),
      erroCritico:
        'Não foi possível extrair texto do PDF. O arquivo pode ser uma imagem digitalizada ou estar protegido por senha.',
    }
  }

  const allRecords: InvoiceExtractedRecord[] = []
  const startIdx = { val: 1 }

  for (const page of extraction.pages) {
    const pageRecs = extractRecordsFromPage(page, startIdx)
    if (pageRecs.length === 0 && page.text.trim().length > 100) {
      // Página com texto abundante mas nenhum lançamento encontrado pode ser resumo/encargos
      const isPureSummary = page.lines.some((l) =>
        /resumo\s+da\s+fatura|encargos\s+desta|fique\s+atento/i.test(l),
      )
      if (!isPureSummary) {
        paginasComFalha.push(page.pageNumber)
        avisos.push(
          `Página ${page.pageNumber}: nenhum lançamento válido identificado (pode conter apenas resumo ou layout diferenciado).`,
        )
      }
    }
    allRecords.push(...pageRecs)
  }

  // Desduplicação cuidadosa mantendo compras legítimas repetidas
  const deduped: InvoiceExtractedRecord[] = []
  const seenMap = new Map<string, number>()

  for (const r of allRecords) {
    if (isSummaryOrFooter(r.descricaoOriginal)) continue

    const key = `${r.data}|${r.nomeNormalizado}|${r.valorReais.toFixed(2)}`
    const count = seenMap.get(key) || 0
    // Permite repetições legítimas no mesmo dia até 12 vezes
    if (count < 12) {
      seenMap.set(key, count + 1)
      deduped.push(r)
    }
  }

  // Ordenação crescente por valor para a conferência inicial
  deduped.sort((a, b) => a.valorReais - b.valorReais)

  const totalValorReais = Math.round(deduped.reduce((sum, r) => sum + r.valorReais, 0) * 100) / 100
  const quantidadeRevisao = deduped.filter((r) => r.confianca < 85).length
  const registrosComFalha = paginasComFalha.length

  if (deduped.length === 0) {
    return {
      sucesso: false,
      registros: [],
      resumo: {
        nomeArquivo: fileName,
        quantidadePaginas: extraction.numPages,
        quantidadeTransacoes: 0,
        quantidadeRevisao: 0,
        registrosComFalha: Math.max(1, paginasComFalha.length),
        totalValorReais: 0,
        paginasComFalha,
        avisos: [
          'Nenhuma transação foi identificada após a análise de todas as páginas da fatura.',
        ],
        isDigitalizadoOuVazio: false,
      },
      nomeArquivoExcel: fileName.replace(/\.pdf$/i, '_convertido.xlsx'),
      erroCritico: 'Nenhum lançamento identificado nas páginas do PDF.',
    }
  }

  // Construção do Excel Real (.xlsx) com as 2 abas obrigatórias
  const aba1Headers = [
    'Data da Transação',
    'Descrição Original',
    'Nome Normalizado',
    'Valor Original',
    'Moeda Original',
    'Valor em Reais (R$)',
    'Portador',
    'Parcela',
    'Tipo de Lançamento',
    'Página de Origem',
    'Confiança (%)',
  ]

  const aba1Rows = deduped.map((r) => [
    r.data,
    r.descricaoOriginal,
    r.nomeNormalizado,
    r.valorOriginal ?? r.valorReais,
    r.moedaOriginal,
    // VALOR NUMÉRICO REAL NO EXCEL (não texto formatado)
    r.valorReais,
    r.portador || '',
    r.parcela || '',
    r.tipo,
    r.paginaOrigem,
    r.confianca,
  ])

  const aba2Headers = ['Campo', 'Valor / Descrição']
  const aba2Rows: (string | number)[][] = [
    ['Nome do Arquivo Original', fileName],
    ['Quantidade de Páginas no PDF', extraction.numPages],
    ['Quantidade de Transações Extraídas', deduped.length],
    ['Transações que Necessitam de Revisão', quantidadeRevisao],
    ['Total dos Lançamentos em Reais (R$)', totalValorReais],
    [
      'Páginas com Aviso de Extração',
      paginasComFalha.length > 0 ? paginasComFalha.join(', ') : 'Nenhuma',
    ],
    ['Avisos Identificados', avisos.length > 0 ? avisos.join(' | ') : 'Nenhum problema detectado'],
  ]

  const sheets: ExcelSheet[] = [
    {
      name: 'Transacoes',
      headers: aba1Headers,
      rows: aba1Rows,
    },
    {
      name: 'Resumo da Extração',
      headers: aba2Headers,
      rows: aba2Rows,
    },
  ]

  const excelBlob = generateXlsxBlob(sheets)
  const baseName = fileName.replace(/\.[^/.]+$/, '')
  const nomeArquivoExcel = `${baseName}_convertido.xlsx`

  return {
    sucesso: true,
    registros: deduped,
    resumo: {
      nomeArquivo: fileName,
      quantidadePaginas: extraction.numPages,
      quantidadeTransacoes: deduped.length,
      quantidadeRevisao,
      registrosComFalha,
      totalValorReais,
      paginasComFalha,
      avisos,
      isDigitalizadoOuVazio: false,
    },
    excelBlob,
    nomeArquivoExcel,
  }
}
