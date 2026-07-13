import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function valuesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function createMatchedResult(
  s: SystemRecord,
  c: CardRecord,
  status: 'GREEN' | 'YELLOW',
): ReconciliationResult {
  return {
    id: `match-${s.id}-${c.id}`,
    data: s.data,
    lancamentoDiario: s.lancamentoDiario,
    parceiro: s.parceiro,
    estabelecimento: c.estabelecimento,
    categoria: c.categoria || s.categoria,

    debito: s.debito,

    credito: s.credito,
    valorFatura: c.valor,

    diferenca: status === 'YELLOW' ? roundCurrency(c.valor - s.credito) : 0,

    status,

    origem: 'AMBOS',
  }
}

function createSystemOnlyResult(s: SystemRecord): ReconciliationResult {
  return {
    id: `sys-only-${s.id}`,

    data: s.data,

    lancamentoDiario: s.lancamentoDiario,

    parceiro: s.parceiro,

    estabelecimento: '-',

    categoria: s.categoria,

    debito: s.debito,

    credito: s.credito,

    valorFatura: null,

    diferenca: null,

    status: 'RED',

    origem: 'SISTEMA',
  }
}

function createCardOnlyResult(c: CardRecord): ReconciliationResult {
  return {
    id: `card-only-${c.id}`,

    data: c.data,

    lancamentoDiario: '-',

    parceiro: '-',

    estabelecimento: c.estabelecimento,

    categoria: c.categoria,

    debito: null,

    credito: null,

    valorFatura: c.valor,

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

  const usedSystem = new Set<number>()
  const usedCard = new Set<number>()

  // =====================================================
  // VERDE
  // VALOR ENCONTRADO NAS DUAS BASES
  // =====================================================

  for (let i = 0; i < systemRecords.length; i++) {
    const s = systemRecords[i]

    if (usedSystem.has(i)) continue

    for (let j = 0; j < cardRecords.length; j++) {
      const c = cardRecords[j]

      if (usedCard.has(j)) continue

      if (!valuesMatch(s.credito, c.valor)) continue

      results.push(createMatchedResult(s, c, 'GREEN'))

      usedSystem.add(i)
      usedCard.add(j)

      break
    }
  }

  // =====================================================
  // VERMELHO - SOMENTE SISTEMA
  // =====================================================

  for (let i = 0; i < systemRecords.length; i++) {
    if (usedSystem.has(i)) continue

    results.push(createSystemOnlyResult(systemRecords[i]))
  }

  // =====================================================
  // VERMELHO - SOMENTE FATURA
  // =====================================================

  for (let j = 0; j < cardRecords.length; j++) {
    if (usedCard.has(j)) continue

    results.push(createCardOnlyResult(cardRecords[j]))
  }

  return results
}
