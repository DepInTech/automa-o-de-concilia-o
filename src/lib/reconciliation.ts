import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Validação de nomes estrita.
 */
function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  if (p === e || p.includes(e) || e.includes(p)) {
    return true
  }

  const ignoreWords = new Set([
    'ltda',
    'servicos',
    'equipamentos',
    'me',
    'eireli',
    's/a',
    'sa',
    'vindi',
    'pag',
    'recorrente',
    'material',
    'materia',
    'laboratorios',
    'laboratorio',
    'comercial',
    'comerci',
    'produtos',
    'vendas',
    'importacao',
    'comercio',
    'distribuidora',
    'loja',
    'lojas',
    'brasil',
    'grupo',
    'solucoes',
    'industria',
  ])

  const wordsP = p.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))
  const wordsE = e.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))

  return wordsP.some((wp) => {
    return wordsE.some((we) => {
      if (wp.length >= 8 || we.length >= 8) {
        return wp.includes(we) || we.includes(wp)
      }
      return wp === we
    })
  })
}

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * Valida se as datas estão próximas (tolerância máxima de 15 dias)
 * para evitar cruzar compras de meses diferentes.
 */
function isDateMatchValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const d1 = new Date(dataCompraStr).getTime()
    const d2 = new Date(dataPagamentoStr).getTime()
    const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)
    return diffDays <= 15 // Ajuste para até 15 dias de diferença
  } catch {
    return true
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedCardIds = new Set<string>()

  for (const sys of systemRecords) {
    // 1. Procurar correspondente de Nome + Valor Exato + Proximidade de Data -> VERDE
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isDateMatchValid(card.data, sys.data),
    )

    // 2. Se não achou, procurar correspondente de Nome + Proximidade de Data (mas valor diferente) -> AMARELO
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isSameEstablishment(sys.parceiro, card.estabelecimento) &&
          isDateMatchValid(card.data, sys.data),
      )
    }

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)

      const isGreen = sameValue(sys.credito, cardMatch.valor)

      results.push({
        id: `${isGreen ? 'GREEN' : 'YELLOW'}-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        // Exibe de forma transparente os dois nomes na tela para você ver o cruzamento:
        parceiro: `[SYS] ${sys.parceiro}`,
        estabelecimento: `[CARD] ${cardMatch.estabelecimento}`,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: isGreen ? 0 : calcDifference(sys.credito, cardMatch.valor),
        status: isGreen ? 'GREEN' : 'YELLOW',
        origem: 'AMBOS',
      })
    } else {
      // Vermelho: Apenas no Sistema
      results.push({
        id: `RED-SYS-${sys.id}`,
        data: sys.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: `[SYS] ${sys.parceiro}`,
        estabelecimento: '-',
        categoria: sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: null,
        diferenca: null,
        status: 'RED',
        origem: 'SISTEMA',
      })
    }
  }

  // Vermelho: Apenas na Fatura
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push({
        id: `RED-CARD-${card.id}`,
        data: card.data,
        lancamentoDiario: '-',
        parceiro: '-',
        estabelecimento: `[CARD] ${card.estabelecimento}`,
        categoria: card.categoria,
        debito: null,
        credito: null,
        valorFatura: card.valor,
        diferenca: null,
        status: 'RED',
        origem: 'FATURA',
      })
    }
  }

  return results
}
