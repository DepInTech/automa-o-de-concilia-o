import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

// Melhoria: Verifica se há correspondência parcial para evitar que pequenas diferenças textuais quebrem a busca
function samePartner(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false
  return p === e || p.includes(e) || e.includes(p)
}

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

// Auxiliar para verificar se as datas estão próximas (ex: até 5 dias de diferença por atrasos de processamento da fatura)
function datesAreClose(dateStr1?: string, dateStr2?: string, maxDays = 5): boolean {
  if (!dateStr1 || !dateStr2) return true // Se um não tiver data, ignora o filtro de proximidade
  try {
    const d1 = new Date(dateStr1).getTime()
    const d2 = new Date(dateStr2).getTime()
    const diffTime = Math.abs(d1 - d2)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays <= maxDays
  } catch {
    return true // Caso ocorra erro de parse na data
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
    // 1ª Tentativa de busca: Mesma empresa E mesma faixa de data (Evita falsos amarelos quando há compras recorrentes)
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        samePartner(sys.parceiro, card.estabelecimento) &&
        datesAreClose(sys.data, card.data, 5),
    )

    // 2ª Tentativa (fallback): Apenas mesma empresa, caso a compra tenha demorado mais de 5 dias para cair na fatura
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) => !matchedCardIds.has(card.id) && samePartner(sys.parceiro, card.estabelecimento),
      )
    }

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      if (sameValue(sys.credito, cardMatch.valor)) {
        results.push(createGreen(sys, cardMatch))
      } else {
        results.push(createYellow(sys, cardMatch))
      }
    } else {
      results.push(createRedSystem(sys))
    }
  }

  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
