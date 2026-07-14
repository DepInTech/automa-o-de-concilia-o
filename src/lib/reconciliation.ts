import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

// Normaliza o texto removendo acentos, espaços extras e deixando em minúsculo
function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Verifica se dois estabelecimentos compartilham alguma palavra significativa (com mais de 3 letras).
 * Isso resolve casos como "BIOVERA EQUIPAMENTOS" e "VINDI *7LABBIOVERAEQU" (ambos contêm "biovera").
 */
function shareCommonWord(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  // Divide em palavras e filtra palavras muito curtas (ex: "e", "de", "da", "ltda", "me")
  const ignoreWords = new Set(['ltda', 'servicos', 'equipamentos', 'me', 'eireli', 's/a', 'sa'])
  const wordsP = p.split(' ').filter((w) => w.length > 3 && !ignoreWords.has(w))
  const wordsE = e.split(/[\s*]+/).filter((w) => w.length > 3 && !ignoreWords.has(w)) // Divide por espaços ou asteriscos

  // Procura se alguma palavra de 'P' está contida em alguma palavra de 'E' ou vice-versa
  return wordsP.some((wp) => wordsE.some((we) => we.includes(wp) || wp.includes(we)))
}

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * A data de pagamento (Sistema) deve ser posterior à data de compra (Fatura),
 * tipicamente em até 45 dias.
 */
function isPaymentWindowValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const dataCompra = new Date(dataCompraStr).getTime()
    const dataPagamento = new Date(dataPagamentoStr).getTime()
    if (dataPagamento < dataCompra) return false
    const diffDays = Math.ceil((dataPagamento - dataCompra) / (1000 * 60 * 60 * 24))
    return diffDays <= 45
  } catch {
    return true
  }
}

function createGreen(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `GREEN-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria || sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: fatura.valor,
    diferenca: 0,
    status: 'GREEN',
    origem: 'AMBOS',
  }
}

function createYellow(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `YELLOW-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria || sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: fatura.valor,
    diferenca: calcDifference(sistema.credito, fatura.valor),
    status: 'YELLOW',
    origem: 'AMBOS',
  }
}

function createRedSystem(sistema: SystemRecord): ReconciliationResult {
  return {
    id: `RED-SYS-${sistema.id}`,
    data: sistema.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: '-',
    categoria: sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: null,
    diferenca: null,
    status: 'RED',
    origem: 'SISTEMA',
  }
}

function createRedCard(fatura: CardRecord): ReconciliationResult {
  return {
    id: `RED-CARD-${fatura.id}`,
    data: fatura.data,
    lancamentoDiario: '-',
    parceiro: '-',
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria,
    debito: null,
    credito: null,
    valorFatura: fatura.valor,
    diferenca: null,
    status: 'RED',
    origem: 'FATURA',
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedCardIds = new Set<string>()

  for (const sys of systemRecords) {
    // 1ª Tentativa (MÁXIMA PRIORIDADE): Valor exato + Janela de Data válida + Nome com palavra parecida
    // Exemplo: R$ 1850,23 + datas corretas + "BIOVERA" presente nos dois lados.
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data) &&
        shareCommonWord(sys.parceiro, card.estabelecimento),
    )

    // 2ª Tentativa: Mesmo valor + Janela de Data válida (Se não houver nomes parecidos, mas for o único valor correspondente na janela)
    // Útil se o nome na fatura for completamente diferente, ex: "PAG*NomeFantasia" vs "Razao Social Ltda"
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          sameValue(sys.credito, card.valor) &&
          isPaymentWindowValid(card.data, sys.data),
      )
    }

    // 3ª Tentativa (Fallback de texto): Se não bater o valor exato, mas os nomes tiverem relação e data aceitável (Gera Amarelo)
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isPaymentWindowValid(card.data, sys.data) &&
          shareCommonWord(sys.parceiro, card.estabelecimento),
      )
    }

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      if (sameValue(sys.credito, cardMatch.valor)) {
        results.push(createGreen(sys, cardMatch))
      } else {
        results.push(createYellow(sys, cardMatch)) // Se caiu na 3ª tentativa, a diferença de valor gerará Amarelo
      }
    } else {
      results.push(createRedSystem(sys))
    }
  }

  // Registros que sobraram na fatura viram Vermelho
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
