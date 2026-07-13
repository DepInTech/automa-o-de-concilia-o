import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\bltda\b/g, '')
    .replace(/\bsa\b/g, '')
    .replace(/\bs\/a\b/g, '')
    .replace(/\beireli\b/g, '')
    .replace(/\bme\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function samePartner(system: string, card: string): boolean {
  const a = normalize(system)
  const b = normalize(card)

  return a.includes(b) || b.includes(a)
}

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
    id: `${status}-${s.id}-${c.id}`,

    data: s.data,

    lancamentoDiario: s.lancamentoDiario,

    parceiro: s.parceiro,

    estabelecimento: c.estabelecimento,

    categoria: c.categoria || s.categoria,

    debito: s.debito,

    credito: s.credito,

    valorFatura: c.valor,

    diferenca: status === 'GREEN' ? 0 : roundCurrency(c.valor - s.credito),

    status,

    origem: 'AMBOS',
  }
}

function createSystemOnlyResult(s: SystemRecord): ReconciliationResult {
  return {
    id: `SYS-${s.id}`,

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
    id: `CARD-${c.id}`,

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
  // Mesmo parceiro + mesmo valor
  // =====================================================

  for (let i = 0; i < systemRecords.length; i++) {
    if (usedSystem.has(i)) continue

    const s = systemRecords[i]

    for (let j = 0; j < cardRecords.length; j++) {
      if (usedCard.has(j)) continue

      const c = cardRecords[j]

      if (!samePartner(s.parceiro, c.estabelecimento)) continue

      if (!valuesMatch(s.credito, c.valor)) continue

      results.push(createMatchedResult(s, c, 'GREEN'))

      usedSystem.add(i)
      usedCard.add(j)

      break
    }
  }

  // =====================================================
  // AMARELO
  // Mesmo parceiro
  // Valor diferente
  // =====================================================

  for (let i = 0; i < systemRecords.length; i++) {
    if (usedSystem.has(i)) continue

    const s = systemRecords[i]

    for (let j = 0; j < cardRecords.length; j++) {
      if (usedCard.has(j)) continue

      const c = cardRecords[j]

      if (!samePartner(s.parceiro, c.estabelecimento)) continue

      results.push(createMatchedResult(s, c, 'YELLOW'))

      usedSystem.add(i)
      usedCard.add(j)

      break
    }
  }

  // =====================================================
  // SOMENTE SISTEMA
  // =====================================================

  for (let i = 0; i < systemRecords.length; i++) {
    if (!usedSystem.has(i)) {
      results.push(createSystemOnlyResult(systemRecords[i]))
    }
  }

  // =====================================================
  // SOMENTE FATURA
  // =====================================================

  for (let j = 0; j < cardRecords.length; j++) {
    if (!usedCard.has(j)) {
      results.push(createCardOnlyResult(cardRecords[j]))
    }
  }

  // =====================================================
  // Ordenação por data
  // =====================================================

  results.sort((a, b) => {
    const da = new Date(a.data.split('/').reverse().join('-')).getTime()
    const db = new Date(b.data.split('/').reverse().join('-')).getTime()
    return da - db
  })

  return results
}
