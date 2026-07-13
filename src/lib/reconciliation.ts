import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string) {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function valuesMatch(a: number, b: number) {
  return Math.abs(a - b) < 0.01
}

function roundCurrency(value: number) {
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

  //
  // ===========================
  // VERDE
  // mesmo estabelecimento
  // mesmo valor
  // ===========================
  //

  for (let i = 0; i < systemRecords.length; i++) {
    if (usedSystem.has(i)) continue

    const s = systemRecords[i]

    for (let j = 0; j < cardRecords.length; j++) {
      if (usedCard.has(j)) continue

      const c = cardRecords[j]

      if (normalize(s.parceiro) !== normalize(c.estabelecimento)) {
        continue
      }

      if (!valuesMatch(s.credito, c.valor)) {
        continue
      }

      results.push(createMatchedResult(s, c, 'GREEN'))

      usedSystem.add(i)
      usedCard.add(j)

      break
    }
  }

  //
  // ===========================
  // AMARELO
  // mesmo estabelecimento
  // valor diferente
  // ===========================
  //

  for (let i = 0; i < systemRecords.length; i++) {
    if (usedSystem.has(i)) continue

    const s = systemRecords[i]

    for (let j = 0; j < cardRecords.length; j++) {
      if (usedCard.has(j)) continue

      const c = cardRecords[j]

      if (normalize(s.parceiro) !== normalize(c.estabelecimento)) {
        continue
      }

      results.push(createMatchedResult(s, c, 'YELLOW'))

      usedSystem.add(i)
      usedCard.add(j)

      break
    }
  }

  //
  // ===========================
  // VERMELHO
  // somente sistema
  // ===========================
  //

  for (let i = 0; i < systemRecords.length; i++) {
    if (!usedSystem.has(i)) {
      results.push(createSystemOnlyResult(systemRecords[i]))
    }
  }

  //
  // ===========================
  // VERMELHO
  // somente fatura
  // ===========================
  //

  for (let j = 0; j < cardRecords.length; j++) {
    if (!usedCard.has(j)) {
      results.push(createCardOnlyResult(cardRecords[j]))
    }
  }

  return results
}
