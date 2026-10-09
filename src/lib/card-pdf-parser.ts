import type { BankType, CardRecord } from './types'
import { extractPdfText } from './pdf-parser'
import { normalizeMoneyValue } from './normalization'

export interface StructuredCardRecord extends CardRecord {
  numero?: string
  referencia?: string
  rawLine?: string
  isInternacional?: boolean
  moedaLocal?: string
  moedaGlobal?: string
  cotacao?: number
}

export interface CardPdfParseResult {
  records: StructuredCardRecord[]
  detectedRows: number
  unparsedLinesCount: number
  warning?: string
  isScannedOrEmpty: boolean
  numPages: number
  totalValorNacional?: number
  totalValorInternacional?: number
}

/**
 * Textos que delimitam rodapés, cabeçalhos ou totalizadores bancários que JAMAIS devem ser lançamentos
 */
const SUMMARY_OR_FOOTER_PATTERNS = [
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
  /ag[eê]ncia\s+contacorrente/i,
  /fatura\s+do\s+cart[aã]o:/i,
  /vencimento:/i,
  /data\s+de\s+fechamento:/i,
  /produtos,\s+servi[cç]os\s+e\s+encargos/i,
]

/**
 * Verifica se um texto corresponde a totalizadores ou rodapés bancários
 */
function isFooterOrTotalLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length < 3) return true
  return SUMMARY_OR_FOOTER_PATTERNS.some((pat) => pat.test(trimmed))
}

/**
 * Normaliza data de dois dígitos DD/MM para DD/MM/AAAA (ano 2026 como referência de faturas atuais)
 */
function normalizeCardDate(raw: string, referenceYear = 2026): string {
  const parts = raw.split(/[/.-]/)
  if (parts.length === 2) {
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    return `${d}/${m}/${referenceYear}`
  }
  if (parts.length === 3) {
    const d = parts[0].padStart(2, '0')
    const m = parts[1].padStart(2, '0')
    let y = parts[2]
    if (y.length === 2) y = `20${y}`
    return `${d}/${m}/${y}`
  }
  return raw
}

/**
 * Tenta parsear linha única no formato clássico "DD/MM DESCRIÇÃO R$ 123,45"
 */
function parseInlineInvoiceLine(line: string, index: number): StructuredCardRecord | null {
  if (isFooterOrTotalLine(line)) return null

  // Normaliza múltiplos espaços, quebras e separadores de tabela (ex: markdown "|" ou tabs)
  const cleanLine = line
    .replace(/\|/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Começa com data DD/MM ou DD/MM/AAAA (com tolerância a ponto, hífen ou barra e espaçamento após delimitador)
  const dateMatch = cleanLine.match(/^(\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?)\b/)
  if (!dateMatch) return null

  const rawDate = dateMatch[1].replace(/\s+/g, '')
  const remainder = cleanLine.slice(dateMatch[0].length).trim()

  // Procura valor no formato R$ ou numérico no final:
  // Aceita: "-R$ 18,75", "-18,75", "R$ 1.114,06", "R$1.954,12", "1.199,00", "1199,00", "- 18,75", "108,40"
  // Também lida com sufixo opcional de parcela ex: "(01/03)" ou "01/02" se vier depois ou antes do valor
  const valMatch = remainder.match(
    /(?:-?\s*R\$\s*|-?\s*US\$\s*|-?\s*USD\s*)?(-?\s*R?\$?\s*[\d.,]+\d{2})\s*$/i,
  )
  if (!valMatch) return null

  const rawValueStr = valMatch[0].trim()
  const parsedMoney = normalizeMoneyValue(rawValueStr)
  // Preserva estornos como valores negativos, mas exclui zero
  if (isNaN(parsedMoney) || parsedMoney === 0) return null

  let desc = remainder
    .slice(0, remainder.length - rawValueStr.length)
    .replace(/^[-:| ]+|[-:| ]+$/g, '')
    .trim()
  if (!desc || desc.length < 2 || isFooterOrTotalLine(desc)) return null

  // Ignora se for cabeçalho de coluna
  if (/^(descri[cç][aã]o|valor|data|lan[cç]amentos|total)$/i.test(desc)) return null

  // Verifica se há informação de parcela no estabelecimento (ex: "LOJA XYZ 02/06")
  let parcela: string | undefined
  const parcelaMatch = desc.match(/\b(\d{1,2}\/\d{1,2})\b$/)
  if (parcelaMatch) {
    parcela = parcelaMatch[1]
  }

  return {
    id: `pdf-rec-${index}`,
    data: normalizeCardDate(rawDate),
    estabelecimento: desc,
    valor: parsedMoney,
    parcela,
    rawLine: line,
  }
}

/**
 * Reconstrução robusta a partir de texto colunar de página de fatura Itaú / Santander.
 * Na fatura do Itaú, o extrator pode agrupar os tokens em colunas verticais:
 * Coluna 1: Lista de datas (ex.: 11/06, 11/06, 01/04...)
 * Coluna 2: Lista de descrições (ex.: SWIFT PIRACUAMA, DL *Starlink...)
 * Coluna 3: Lista de valores (ex.: R$1.821,14, R$149,00...)
 *
 * Esta função detecta se uma seção está disposta em blocos colunares e realiza o zip sincronizado,
 * além de lidar com lançamentos internacionais que possuem moeda local, global e cotação.
 */
function parseInvoicePageBlocks(
  lines: string[],
  pageNumber: number,
  globalIdx: { current: number },
): StructuredCardRecord[] {
  const records: StructuredCardRecord[] = []

  // Se a página contiver a seção de Lançamentos Internacionais
  const hasIntl = lines.some((l) => /lan[cç]amentos\s+internacionais/i.test(l))
  if (hasIntl) {
    const intlRecords = parseInternacionaisSection(lines, globalIdx)
    records.push(...intlRecords)
  }

  // Extrai lançamentos nacionais (passa todas as linhas ou apenas da seção nacional)
  const nacionaisRecords = parseNacionais(lines, globalIdx)
  records.push(...nacionaisRecords)

  return records
}

/**
 * Parser especializado para Lançamentos Internacionais
 * Exemplo real:
 * data: 05/06 | descrição: OPENAI *CHATGPT SUBSCR | moeda local: USD20,00 | moeda global: US$20,00 | cotação: R$5,42 | valor: R$108,40
 * data: 12/06 | descrição: OPENAI *CHATGPT SUBSCR | moeda local: USD20,00 | moeda global: US$20,00 | cotação: R$5,41 | valor: R$108,20
 */
function parseInternacionaisSection(
  lines: string[],
  globalIdx: { current: number },
): StructuredCardRecord[] {
  const records: StructuredCardRecord[] = []

  // Localiza o início de "Lançamentos internacionais"
  const startIdx = lines.findIndex((l) => /lan[cç]amentos\s+internacionais/i.test(l))
  if (startIdx === -1) return records

  // Localiza o fim (ex: "Total de lançamentos internacionais" ou "Produtos, serviços e encargos")
  let endIdx = lines.findIndex(
    (l, idx) =>
      idx > startIdx &&
      (/total\s+de\s+lan[cç]amentos\s+internacionais/i.test(l) ||
        /produtos,\s*servi[cç]os/i.test(l) ||
        /encargos\s+desta/i.test(l)),
  )
  if (endIdx === -1) endIdx = lines.length

  const slice = lines.slice(startIdx + 1, endIdx)

  // Coleta datas (DD/MM), descrições, moedas locais (USD...), moedas globais (US$...), cotações e valores (R$...)
  const dates: string[] = []
  const descs: string[] = []
  const localCurrs: string[] = []
  const globalCurrs: string[] = []
  const cotacoes: number[] = []
  const valores: number[] = []

  for (const raw of slice) {
    const l = raw.trim()
    if (!l || isFooterOrTotalLine(l)) continue
    if (/^(data|descri[cç][aã]o|moeda\s*local|moeda\s*global|cota[cç][aã]o|valor)$/i.test(l)) {
      continue
    }

    // Se for linha de tabela Markdown: | 05/06 | OPENAI *CHATGPT SUBSCR | USD20,00 | US$20,00 | R$5,42 | R$108,40 |
    if (l.includes('|')) {
      const parts = l
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length >= 4 && /^\d{1,2}[/.-]\d{1,2}/.test(parts[0])) {
        // O último valor geralmente é o valor final em R$
        const lastPart = parts[parts.length - 1]
        const valorReal = normalizeMoneyValue(lastPart)
        if (valorReal !== 0) {
          const desc = parts[1]
          const cotacaoVal =
            parts.length >= 6 ? normalizeMoneyValue(parts[parts.length - 2]) : undefined
          records.push({
            id: `pdf-rec-intl-${globalIdx.current++}`,
            data: normalizeCardDate(parts[0]),
            estabelecimento: desc,
            moedaLocal: parts[2],
            moedaGlobal: parts.length >= 5 ? parts[3] : undefined,
            cotacao: cotacaoVal && cotacaoVal < 50 ? cotacaoVal : undefined,
            valor: valorReal,
            isInternacional: true,
            rawLine: l,
          })
          continue
        }
      }
    }

    // Se a linha for completa inline sem pipe:
    // Exemplo: "05/06 OPENAI *CHATGPT SUBSCR USD 20,00 US$ 20,00 5,42 108,40"
    // ou "05/06 OPENAI *CHATGPT SUBSCR USD20,00 US$20,00 R$5,42 R$108,40"
    // ou "05/06 OPENAI *CHATGPT SUBSCR USD 20.00 5.42 108.40"
    const fullMatch = l.match(
      /^(\d{1,2}[/.-]\d{1,2})\s+(.+?)\s+([A-Z]{2,4}\s*[\d,.]+)(?:\s+([A-Z$]{1,4}\s*[\d,.]+))?\s+(?:(?:R\$\s*)?([\d,.]+)\s+)?(?:-?R\$\s*|-?\s*BRL\s*)?(-?[\d.,]+\d{2})$/i,
    )
    if (fullMatch) {
      const valorReal = normalizeMoneyValue(fullMatch[6])
      if (valorReal !== 0) {
        records.push({
          id: `pdf-rec-intl-${globalIdx.current++}`,
          data: normalizeCardDate(fullMatch[1]),
          estabelecimento: fullMatch[2].trim(),
          moedaLocal: fullMatch[3].trim(),
          moedaGlobal: fullMatch[4]?.trim(),
          cotacao: fullMatch[5] ? normalizeMoneyValue(fullMatch[5]) : undefined,
          valor: valorReal,
          isInternacional: true,
          rawLine: l,
        })
        continue
      }
    }

    // Linha internacional compacta: "05/06 GITHUB INC USD 21.00 114.50" ou "05/06 GITHUB INC R$ 114,50"
    const simpleIntlMatch = l.match(
      /^(\d{1,2}[/.-]\d{1,2})\s+(.+?)\s+(?:USD\s*[\d,.]+\s+)?(?:-?R\$\s*[\d.,]+\d{2}|[\d.,]+\d{2})\s*$/i,
    )
    if (simpleIntlMatch && !isFooterOrTotalLine(simpleIntlMatch[2])) {
      const inlineParsed = parseInlineInvoiceLine(l, globalIdx.current)
      if (inlineParsed) {
        records.push({
          ...inlineParsed,
          id: `pdf-rec-intl-${globalIdx.current++}`,
          isInternacional: true,
        })
        continue
      }
    }

    // Classificação por token para blocos colunares
    if (/^\d{1,2}[/.-]\d{1,2}$/.test(l)) {
      dates.push(l)
    } else if (/^[A-Z]{3}\s*[\d,.]+$/i.test(l)) {
      localCurrs.push(l)
    } else if (/^[A-Z$]{2,4}\s*[\d,.]+$/i.test(l)) {
      globalCurrs.push(l)
    } else if (
      /^R\$\s*\d{1,2}[,.]\d{2}$/i.test(l) &&
      parseFloat(l.replace(/[^\d,.]/g, '').replace(',', '.')) < 30
    ) {
      // Cotação do dólar geralmente entre 4 e 25
      cotacoes.push(normalizeMoneyValue(l))
    } else if (/^(?:-?\s*R\$\s*)?-?\d{1,3}(?:[.,]\d{3})*[,.]\d{2}$/i.test(l)) {
      valores.push(normalizeMoneyValue(l))
    } else if (l.length >= 3 && !/^(repasse\s+de\s+iof|iof)/i.test(l)) {
      descs.push(l)
    }
  }

  // Se foram agregados em blocos de mesmo tamanho ou correspondentes
  if (descs.length > 0 && (valores.length > 0 || dates.length > 0)) {
    const count = Math.max(descs.length, dates.length, valores.length)
    for (let i = 0; i < count; i++) {
      const dt = dates[i] || dates[0] || '01/01'
      const desc = descs[i] || `Lançamento Internacional ${i + 1}`
      const val = valores[i] !== undefined ? valores[i] : 0
      if (val > 0) {
        records.push({
          id: `pdf-rec-intl-${globalIdx.current++}`,
          data: normalizeCardDate(dt),
          estabelecimento: desc,
          moedaLocal: localCurrs[i],
          moedaGlobal: globalCurrs[i],
          cotacao: cotacoes[i],
          valor: val,
          isInternacional: true,
        })
      }
    }
  }

  return records
}

/**
 * Parser para lançamentos nacionais: suporta linhas inline, markdown de tabela ou blocos colunares.
 */
function parseNacionais(lines: string[], globalIdx: { current: number }): StructuredCardRecord[] {
  const records: StructuredCardRecord[] = []

  // Verifica se há demarcação explícita "Lançamentos nacionais"
  const hasNacionaisHeader = lines.some((l) => /lan[cç]amentos\s+nacionais/i.test(l))
  let inNacionais = !hasNacionaisHeader // se não houver cabeçalho explícito, aceita por padrão até encontrar seções proibidas
  const candidateLines: string[] = []

  for (const raw of lines) {
    const l = raw.trim()
    if (!l) continue

    if (/lan[cç]amentos\s+nacionais/i.test(l)) {
      inNacionais = true
      continue
    }

    if (/lan[cç]amentos\s+internacionais/i.test(l)) {
      inNacionais = false
      continue
    }

    if (
      /produtos,\s*servi[cç]os\s+e\s+encargos/i.test(l) ||
      /encargos\s+desta\s+fatura/i.test(l) ||
      /encargos\s+e\s+custo\s+efetivo/i.test(l) ||
      /resumo\s+da\s+fatura/i.test(l) ||
      /saldo\s+da\s+fatura\s+anterior/i.test(l) ||
      /rotativo\s*\(pagamento/i.test(l) ||
      /compras\s+parceladas/i.test(l)
    ) {
      inNacionais = false
      continue
    }

    if (inNacionais) {
      candidateLines.push(l)
    }
  }

  const targetLines = candidateLines.length > 0 ? candidateLines : lines

  // 1. Tenta formato inline em cada linha
  const colunarDates: string[] = []
  const colunarDescs: string[] = []
  const colunarValues: number[] = []

  for (const raw of targetLines) {
    const l = raw.trim()
    if (!l) continue
    if (isFooterOrTotalLine(l)) continue
    if (/^(data|descri[cç][aã]o|valor)$/i.test(l)) continue
    if (/^[A-Z\s]{4,}\s*-\s*FINAL\s*\d{4}$/i.test(l)) continue
    if (/^total\s+de\s+lan[cç]amentos/i.test(l)) continue

    // Checa formato de linha de tabela Markdown: | 19/08 | MERCADOLIVRE*TITAN11/12 | R$112,32 |
    if (l.includes('|')) {
      const parts = l
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean)
      if (parts.length >= 3 && /^\d{1,2}[/.-]\d{1,2}/.test(parts[0])) {
        const d = parts[0]
        const desc = parts[1]
        // Se houver mais colunas, o valor em reais costuma ser a última
        const valStr = parts[parts.length - 1]
        const num = normalizeMoneyValue(valStr)
        if (!isFooterOrTotalLine(desc) && !isFooterOrTotalLine(valStr) && num !== 0) {
          records.push({
            id: `pdf-rec-nat-${globalIdx.current++}`,
            data: normalizeCardDate(d),
            estabelecimento: desc,
            valor: num,
          })
          continue
        }
      }
    }

    const inline = parseInlineInvoiceLine(l, globalIdx.current)
    if (inline) {
      records.push(inline)
      globalIdx.current++
      continue
    }

    // Se não bateu inline, armazena para possível recomposição colunar
    if (/^\d{1,2}[/.-]\d{1,2}$/.test(l)) {
      colunarDates.push(l)
    } else if (/^(?:-?\s*R\$\s*)?-?\s*[\d.,]+\d{2}$/i.test(l)) {
      colunarValues.push(normalizeMoneyValue(l))
    } else if (l.length >= 3 && !/total\s+de\s+lan[cç]amentos/i.test(l)) {
      colunarDescs.push(l)
    }
  }

  // Se não obteve registros suficientes via inline, e há dados colunares, sincroniza
  if (records.length === 0 && colunarDescs.length > 0 && colunarValues.length > 0) {
    const pairCount = Math.min(colunarDescs.length, colunarValues.length)
    for (let i = 0; i < pairCount; i++) {
      const desc = colunarDescs[i]
      const val = colunarValues[i]
      const dt =
        colunarDates[i] ||
        (colunarDates.length > 0 ? colunarDates[colunarDates.length - 1] : '01/06')

      if (val !== 0) {
        records.push({
          id: `pdf-rec-nat-${globalIdx.current++}`,
          data: normalizeCardDate(dt),
          estabelecimento: desc,
          valor: val,
        })
      }
    }
  }

  return records
}

/**
 * Função principal para parsing do PDF da Fatura Bancária (Itaú / Santander)
 */
export async function parseCardPdf(
  file: File | ArrayBuffer,
  _bank: BankType = 'itau',
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
        'Não foi possível identificar dados de texto estruturado neste arquivo PDF. Ele pode ser uma imagem digitalizada ou estar protegido. O sistema requer um PDF legível/pesquisável.',
    }
  }

  const allRecords: StructuredCardRecord[] = []
  const globalIdx = { current: 1 }

  for (const page of extraction.pages) {
    const pageRecords = parseInvoicePageBlocks(page.lines, page.pageNumber, globalIdx)
    allRecords.push(...pageRecords)
  }

  // Se o método de blocos colunares por página não encontrou registros suficientes,
  // tenta varrer o texto completo linha a linha e também linhas recompostas
  if (allRecords.length === 0) {
    const candidateLines = extraction.fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const fullRecords = parseInvoicePageBlocks(candidateLines, 1, globalIdx)
    allRecords.push(...fullRecords)
  }

  // Se ainda estiver vazio, tenta reconstruir linhas que possam ter sido quebradas entre data / estabelecimento / valor
  // Ex: Linha 1: 12/06
  //     Linha 2: DL *Starlink Brazil
  //     Linha 3: R$ 1.199,00
  if (allRecords.length === 0 && extraction.pages.length > 0) {
    const allLines = extraction.pages.flatMap((p) => p.lines)
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim()
      if (/^\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?$/.test(line)) {
        // Tenta olhar as próximas 1 a 3 linhas
        let combined = line
        for (let j = i + 1; j < Math.min(i + 5, allLines.length); j++) {
          const next = allLines[j].trim()
          if (!next) continue
          combined += ' ' + next
          const parsed = parseInlineInvoiceLine(combined, globalIdx.current)
          if (parsed) {
            allRecords.push(parsed)
            globalIdx.current++
            i = j
            break
          }
        }
      }
    }
  }

  // Remove eventuais duplicatas acidentais geradas por overlap de cabeçalho
  // mantendo múltiplos lançamentos legítimos de mesmo estabelecimento com valores distintos
  // (ex.: OPENAI *CHATGPT SUBSCR que aparece 2x com R$108,40 e R$108,20 devem ambos existir)
  const dedupedRecords: StructuredCardRecord[] = []
  const seenFingerprints = new Map<string, number>()

  for (const r of allRecords) {
    // Filtro rigoroso: descarta se for termo de resumo ou rodapé residual
    if (isFooterOrTotalLine(r.estabelecimento)) continue

    // Fingerprint: data + estabelecimento normalizado + valor formatado
    const fp = `${r.data}|${r.estabelecimento.toLowerCase().trim()}|${r.valor.toFixed(2)}`
    const count = seenFingerprints.get(fp) || 0
    // Permite repetições legítimas no cartão (ex: múltiplas corridas de Uber ou compras no mesmo dia até 12 ocorrências),
    // mas bloqueia repetições em loop infinito provocadas por falha de quebra de página
    if (count < 12) {
      seenFingerprints.set(fp, count + 1)
      dedupedRecords.push(r)
    }
  }

  let warningMessage: string | undefined
  if (dedupedRecords.length === 0) {
    warningMessage =
      'Não foi possível identificar os dados da fatura neste PDF. Verifique se o arquivo está legível e tente novamente.'
  }

  return {
    records: dedupedRecords,
    detectedRows: dedupedRecords.length,
    unparsedLinesCount: 0,
    warning: warningMessage,
    isScannedOrEmpty: false,
    numPages: extraction.numPages,
  }
}
