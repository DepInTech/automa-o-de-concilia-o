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
 * Validação de nomes estrita para garantir que o parceiro (Sistema)
 * e o estabelecimento (Fatura) são de fato a mesma entidade comercial.
 */
function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  // 1. Caso simples: nomes idênticos ou um contido inteiramente no outro
  if (p === e || p.includes(e) || e.includes(p)) {
    return true
  }

  // 2. Lista de palavras comuns que devem ser ignoradas para focar no nome principal
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

  // 3. Comparação de termos principais
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
 * Valida se a janela temporal entre a transação da fatura e o lançamento do sistema faz sentido (até 45 dias)
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
    // REGRA 1: Estabelecimento/Parceiro Iguais + Valor Igual -> VERDE
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data),
    )

    // REGRA 2: Estabelecimento/Parceiro Iguais + Valor Diferente -> AMARELO
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isSameEstablishment(sys.parceiro, card.estabelecimento) &&
          isPaymentWindowValid(card.data, sys.data),
      )
    }

    // REGRA 3: Fallback de segurança para prazos estendidos (Apenas se o Estabelecimento/Parceiro coincidir) -> AMARELO/VERDE
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
      )
    }

    // Processamento da correspondência
    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      if (sameValue(sys.credito, cardMatch.valor)) {
        results.push(createGreen(sys, cardMatch))
      } else {
        results.push(createYellow(sys, cardMatch))
      }
    } else {
      // REGRA 3 (Vermelho): Encontrado apenas no Sistema (sem par de nome correspondente)
      results.push(createRedSystem(sys))
    }
  }

  // REGRA 3 (Vermelho): Encontrado apenas na Fatura (sem par de nome correspondente)
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
