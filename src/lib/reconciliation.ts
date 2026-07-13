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
    diferenca: status === 'GREEN' ? 0 : Math.round((c.valor - s.credito) * 100) / 100,
    status,
    origem: 'AMBOS',
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const sysRemaining = [...systemRecords]
  const cardRemaining = [...cardRecords]

  for (let i = sysRemaining.length - 1; i >= 0; i--) {
    const s = sysRemaining[i]
    const partnerNorm = normalizeStr(s.parceiro)
    if (!partnerNorm || partnerNorm === '-') continue

    const j = cardRemaining.findIndex(
      (c) => normalizeStr(c.estabelecimento) === partnerNorm && valuesMatch(s.credito, c.valor),
    )
    if (j === -1) continue

    results.push(createMatchedResult(s, cardRemaining[j], 'GREEN'))
    sysRemaining.splice(i, 1)
    cardRemaining.splice(j, 1)
  }

  for (let i = sysRemaining.length - 1; i >= 0; i--) {
    const s = sysRemaining[i]
    const partnerNorm = normalizeStr(s.parceiro)
    if (!partnerNorm || partnerNorm === '-') continue

    const j = cardRemaining.findIndex((c) => normalizeStr(c.estabelecimento) === partnerNorm)
    if (j === -1) continue

    results.push(createMatchedResult(s, cardRemaining[j], 'YELLOW'))
    sysRemaining.splice(i, 1)
    cardRemaining.splice(j, 1)
  }

  sysRemaining.forEach((s) => {
    results.push({
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
    })
  })

  cardRemaining.forEach((c) => {
    results.push({
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
    })
  })

  return results
}
