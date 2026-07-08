import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []

  const sysRemaining = [...systemRecords]
  const cardRemaining = [...cardRecords]

  const sysByValue = new Map<number, SystemRecord[]>()
  sysRemaining.forEach((r) => {
    const list = sysByValue.get(r.credito) || []
    list.push(r)
    sysByValue.set(r.credito, list)
  })

  const cardByValue = new Map<number, CardRecord[]>()
  cardRemaining.forEach((r) => {
    const list = cardByValue.get(r.valor) || []
    list.push(r)
    cardByValue.set(r.valor, list)
  })

  const allValues = new Set([...sysByValue.keys(), ...cardByValue.keys()])

  for (const val of allValues) {
    const sysList = sysByValue.get(val) || []
    const cardList = cardByValue.get(val) || []

    if (sysList.length > 0 && cardList.length > 0) {
      const matchCount = Math.min(sysList.length, cardList.length)

      for (let i = 0; i < matchCount; i++) {
        const s = sysList[i]
        const c = cardList[i]

        results.push({
          id: `match-${s.id}-${c.id}`,
          data: s.data,
          lancamentoDiario: s.lancamentoDiario,
          parceiro: s.parceiro,
          estabelecimento: c.estabelecimento,
          categoria: s.categoria || c.categoria,
          debito: s.debito,
          credito: s.credito,
          valorFatura: c.valor,
          diferenca: 0,
          status: 'GREEN',
          origem: 'AMBOS',
        })

        sysRemaining.splice(sysRemaining.indexOf(s), 1)
        cardRemaining.splice(cardRemaining.indexOf(c), 1)
      }
    }
  }

  const sysByDate = new Map<string, SystemRecord[]>()
  sysRemaining.forEach((r) => {
    const list = sysByDate.get(r.data) || []
    list.push(r)
    sysByDate.set(r.data, list)
  })

  const cardByDate = new Map<string, CardRecord[]>()
  cardRemaining.forEach((r) => {
    const list = cardByDate.get(r.data) || []
    list.push(r)
    cardByDate.set(r.data, list)
  })

  const allDates = new Set([...sysByDate.keys(), ...cardByDate.keys()])

  for (const date of allDates) {
    const sysList = sysByDate.get(date) || []
    const cardList = cardByDate.get(date) || []

    const matchCount = Math.min(sysList.length, cardList.length)

    for (let i = 0; i < matchCount; i++) {
      const s = sysList[i]
      const c = cardList[i]

      results.push({
        id: `div-${s.id}-${c.id}`,
        data: s.data,
        lancamentoDiario: s.lancamentoDiario,
        parceiro: s.parceiro,
        estabelecimento: c.estabelecimento,
        categoria: s.categoria || c.categoria,
        debito: s.debito,
        credito: s.credito,
        valorFatura: c.valor,
        diferenca: s.credito - c.valor,
        status: 'YELLOW',
        origem: 'AMBOS',
      })

      sysRemaining.splice(sysRemaining.indexOf(s), 1)
      cardRemaining.splice(cardRemaining.indexOf(c), 1)
    }
  }

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
