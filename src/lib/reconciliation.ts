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
 * Validação de nomes de estabelecimentos.
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

// Tolerância estrita de R$ 2,00 para o VERDE (apenas para Uber e taxas de centavos)
function isWithinGreenTolerance(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) <= 2.0
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedCardIds = new Set<string>()

  // PASSO 1: Match de Nome + Valor Praticamente Igual (Tolerância máx de R$ 2,00) -> VERDE
  for (const sys of systemRecords) {
    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isWithinGreenTolerance(sys.credito, card.valor),
    )

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      results.push({
        id: `GREEN-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: calcDifference(sys.credito, cardMatch.valor),
        status: 'GREEN',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 2: Match de Nome + Qualquer outro valor diferente -> AMARELO
  // (Qualquer diferença maior que R$ 2,00 cai obrigatoriamente aqui!)
  for (const sys of systemRecords) {
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      results.push({
        id: `YELLOW-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: calcDifference(sys.credito, cardMatch.valor),
        status: 'YELLOW',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 3: Somente no Sistema -> VERMELHO
  for (const sys of systemRecords) {
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    results.push({
      id: `RED-SYS-${sys.id}`,
      data: sys.data,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
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

  // PASSO 4: Somente na Fatura -> VERMELHO
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push({
        id: `RED-CARD-${card.id}`,
        data: card.data,
        lancamentoDiario: '-',
        parceiro: '-',
        estabelecimento: card.estabelecimento,
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
