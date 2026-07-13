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

function computeScore(s: SystemRecord, c: CardRecord): number {
  let score = 0
  if (s.data && c.data && s.data === c.data) score++
  if (
    s.parceiro &&
    c.estabelecimento &&
    s.parceiro !== '-' &&
    c.estabelecimento !== '-' &&
    normalizeStr(s.parceiro) === normalizeStr(c.estabelecimento)
  )
    score++
  if (valuesMatch(s.credito, c.valor)) score++
  return score
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
    categoria: s.categoria || c.categoria,
    debito: s.debito,
    credito: s.credito,
    valorFatura: c.valor,
    diferenca: status === 'GREEN' ? 0 : s.credito - c.valor,
    status,
    origem: 'AMBOS',
  }
}

function matchByScore(
  sysRemaining: SystemRecord[],
  cardRemaining: CardRecord[],
  results: ReconciliationResult[],
  targetScore: number,
  status: 'GREEN' | 'YELLOW',
): void {
  for (let i = sysRemaining.length - 1; i >= 0; i--) {
    const s = sysRemaining[i]
    for (let j = 0; j < cardRemaining.length; j++) {
      if (computeScore(s, cardRemaining[j]) === targetScore) {
        results.push(createMatchedResult(s, cardRemaining[j], status))
        sysRemaining.splice(i, 1)
        cardRemaining.splice(j, 1)
        break
      }
    }
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const sysRemaining = [...systemRecords]
  const cardRemaining = [...cardRecords]

  matchByScore(sysRemaining, cardRemaining, results, 3, 'GREEN')
  matchByScore(sysRemaining, cardRemaining, results, 2, 'YELLOW')
  matchByScore(sysRemaining, cardRemaining, results, 1, 'YELLOW')

  sysRemaining.forEach((s) => {
    results.push({
      id: `sys-${s.id}`,
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
    })
  })

  cardRemaining.forEach((c) => {
    results.push({
      id: `card-${c.id}`,
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
    })
  })

  return results
}
