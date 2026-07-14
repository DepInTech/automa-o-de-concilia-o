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
 * Validação estrita de nomes de estabelecimentos.
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

/**
 * Validação de valor igual (com tolerância máxima de R$ 0,05 para dízimas e taxas de centavos)
 */
function isValueExactlyEqual(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) <= 0.05
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * Validação temporal lógica (compras e faturas devem estar na mesma janela de até 45 dias)
 */
function isPaymentWindowValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const d1 = new Date(dataCompraStr).getTime()
    const d2 = new Date(dataPagamentoStr).getTime()
    const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)
    return diffDays <= 45
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

  // PASSO 1: Buscar correspondências perfeitas de Nome + Valor Exato -> VERDE
  for (const sys of systemRecords) {
    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isValueExactlyEqual(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data),
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
        credito: sys.credito, // Puxa o valor real do sistema
        valorFatura: cardMatch.valor, // Puxa o valor real da fatura
        diferenca: calcDifference(sys.credito, cardMatch.valor),
        status: 'GREEN',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 2: Buscar correspondências de Nome com valores diferentes -> AMARELO
  for (const sys of systemRecords) {
    // Pula se este registro do sistema já foi conciliado no PASSO 1
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isPaymentWindowValid(card.data, sys.data),
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
        credito: sys.credito, // Mantém o valor do sistema
        valorFatura: cardMatch.valor, // Puxa o valor da fatura
        diferenca: calcDifference(sys.credito, cardMatch.valor), // Calcula a diferença real na tela
        status: 'YELLOW',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 3: Tudo que sobrou no Sistema sem par de nome -> VERMELHO
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

  // PASSO 4: Tudo que sobrou na Fatura sem par de nome -> VERMELHO
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
