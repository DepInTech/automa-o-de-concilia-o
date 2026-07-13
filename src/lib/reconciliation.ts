import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
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
    id: status === 'GREEN' ? `match-${s.id}-${c.id}` : `div-${s.id}-${c.id}`,
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
  const sysMatched = new Set<number>()
  const cardMatched = new Set<number>()

  for (let i = 0; i < systemRecords.length; i++) {
    if (sysMatched.has(i)) continue
    const s = systemRecords[i]
    const partnerNorm = normalizeStr(s.parceiro)
    if (!partnerNorm || partnerNorm === '-') continue

    for (let j = 0; j < cardRecords.length; j++) {
      if (cardMatched.has(j)) continue
      const c = cardRecords[j]
      if (normalizeStr(c.estabelecimento) !== partnerNorm) continue
      if (!valuesMatch(s.credito, c.valor)) continue

      results.push(createMatchedResult(s, c, 'GREEN'))
      sysMatched.add(i)
      cardMatched.add(j)
      break
    }
  }

  const yellowCandidates: { sysIdx: number; cardIdx: number; diff: number }[] = []
  for (let i = 0; i < systemRecords.length; i++) {
    if (sysMatched.has(i)) continue
    const s = systemRecords[i]
    const partnerNorm = normalizeStr(s.parceiro)
    if (!partnerNorm || partnerNorm === '-') continue

    for (let j = 0; j < cardRecords.length; j++) {
      if (cardMatched.has(j)) continue
      const c = cardRecords[j]
      if (normalizeStr(c.estabelecimento) !== partnerNorm) continue
      yellowCandidates.push({ sysIdx: i, cardIdx: j, diff: Math.abs(c.valor - s.credito) })
    }
  }

  yellowCandidates.sort((a, b) => a.diff - b.diff)

  for (const { sysIdx, cardIdx } of yellowCandidates) {
    if (sysMatched.has(sysIdx) || cardMatched.has(cardIdx)) continue
    results.push(createMatchedResult(systemRecords[sysIdx], cardRecords[cardIdx], 'YELLOW'))
    sysMatched.add(sysIdx)
    cardMatched.add(cardIdx)
  }

  for (let i = 0; i < systemRecords.length; i++) {
    if (!sysMatched.has(i)) results.push(createSystemOnlyResult(systemRecords[i]))
  }

  for (let j = 0; j < cardRecords.length; j++) {
    if (!cardMatched.has(j)) results.push(createCardOnlyResult(cardRecords[j]))
  }

  return results
}
