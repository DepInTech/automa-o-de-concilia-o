import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  let sysUnmatched = [...systemRecords]
  let cardUnmatched = [...cardRecords]

  const sysByVal = new Map<number, SystemRecord[]>()
  sysUnmatched.forEach((r) => {
    if (!sysByVal.has(r.valor)) sysByVal.set(r.valor, [])
    sysByVal.get(r.valor)!.push(r)
  })

  const cardByVal = new Map<number, CardRecord[]>()
  cardUnmatched.forEach((r) => {
    if (!cardByVal.has(r.valor)) cardByVal.set(r.valor, [])
    cardByVal.get(r.valor)!.push(r)
  })

  for (const [val, sysList] of sysByVal.entries()) {
    const cardList = cardByVal.get(val) || []

    while (sysList.length > 0 && cardList.length > 0) {
      const s = sysList.shift()!
      const c = cardList.shift()!

      results.push({
        id: `match-${s.id}-${c.id}`,
        data: s.data,
        parceiro: s.parceiro,
        estabelecimentoFatura: c.estabelecimento,
        categoria: s.categoria,
        parcela: s.parcela,
        lancamentoDiario: s.lancamentoDiario,
        valorSistema: s.valor,
        valorFatura: c.valor,
        diferenca: 0,
        status: 'GREEN',
      })

      sysUnmatched = sysUnmatched.filter((r) => r.id !== s.id)
      cardUnmatched = cardUnmatched.filter((r) => r.id !== c.id)
    }
  }

  for (let i = sysUnmatched.length - 1; i >= 0; i--) {
    const s = sysUnmatched[i]
    const cIndex = cardUnmatched.findIndex((c) => c.data === s.data)

    if (cIndex !== -1) {
      const c = cardUnmatched[cIndex]
      results.push({
        id: `div-${s.id}-${c.id}`,
        data: s.data,
        parceiro: s.parceiro,
        estabelecimentoFatura: c.estabelecimento,
        categoria: s.categoria,
        parcela: s.parcela,
        lancamentoDiario: s.lancamentoDiario,
        valorSistema: s.valor,
        valorFatura: c.valor,
        diferenca: s.valor - c.valor,
        status: 'YELLOW',
      })
      sysUnmatched.splice(i, 1)
      cardUnmatched.splice(cIndex, 1)
    }
  }

  sysUnmatched.forEach((s) => {
    results.push({
      id: `sys-${s.id}`,
      data: s.data,
      parceiro: s.parceiro,
      estabelecimentoFatura: '-',
      categoria: s.categoria,
      parcela: s.parcela,
      lancamentoDiario: s.lancamentoDiario,
      valorSistema: s.valor,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
    })
  })

  cardUnmatched.forEach((c) => {
    results.push({
      id: `card-${c.id}`,
      data: c.data,
      parceiro: '-',
      estabelecimentoFatura: c.estabelecimento,
      categoria: '-',
      parcela: '-',
      lancamentoDiario: '-',
      valorSistema: null,
      valorFatura: c.valor,
      diferenca: null,
      status: 'RED',
    })
  })

  results.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
  return results
}
