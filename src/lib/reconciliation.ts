import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*]/g, ' ')
    .replace(/\s+/g, ' ')
}

function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)

  if (!p || !e) return false

  if (p === e) return true

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
    'comercio',
    'comerci',
    'produtos',
    'vendas',
    'importacao',
    'distribuidora',
    'loja',
    'lojas',
    'brasil',
    'grupo',
    'solucoes',
    'industria',
    'de',
    'da',
    'do',
    'dos',
    'das',
    'e',
  ])

  const wordsP = p.split(/[\s-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))

  const wordsE = e.split(/[\s-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))

  const common = wordsP.filter((w) => wordsE.includes(w))

  return common.length > 0
}

function isWithinGreenTolerance(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) <= 2
}

function calcDifference(credito: number, valor: number): number {
  return Number((valor - credito).toFixed(2))
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []

  const matchedSystem = new Set<string>()
  const matchedCard = new Set<string>()

  for (const sys of systemRecords) {
    const candidates = cardRecords.filter(
      (card) =>
        !matchedCard.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )

    if (candidates.length === 0) {
      continue
    }

    let cardMatch = candidates.find((card) => isWithinGreenTolerance(sys.credito, card.valor))

    let status: 'GREEN' | 'YELLOW'

    if (cardMatch) {
      status = 'GREEN'
    } else {
      candidates.sort((a, b) => Math.abs(sys.credito - a.valor) - Math.abs(sys.credito - b.valor))

      cardMatch = candidates[0]
      status = 'YELLOW'
    }

    matchedSystem.add(sys.id)
    matchedCard.add(cardMatch.id)

    results.push({
      id: `${status}-${sys.id}-${cardMatch.id}`,
      data: sys.data || cardMatch.data,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
      estabelecimento: cardMatch.estabelecimento,
      categoria: cardMatch.categoria || sys.categoria,
      debito: sys.debito,
      credito: sys.credito,
      valorFatura: cardMatch.valor,
      diferenca: calcDifference(sys.credito, cardMatch.valor),
      status,
      origem: 'AMBOS',
    })
  }

  for (const sys of systemRecords) {
    if (matchedSystem.has(sys.id)) continue

    results.push({
      id: `RED-SYS-${sys.id}`,
      data: sys.data,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
      estabelecimento: '-',
      categoria: sys.categoria,
      debito: sys.debito,
      credito: sys.credito,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
      origem: 'SISTEMA',
    })
  }

  for (const card of cardRecords) {
    if (matchedCard.has(card.id)) continue

    results.push({
      id: `RED-CARD-${card.id}`,
      data: card.data,
      lancamentoDiario: '-',
      parceiro: '-',
      estabelecimento: card.estabelecimento,
      categoria: card.categoria,
      debito: null,
      credito: null,
      valorFatura: card.valor,
      diferenca: null,
      status: 'RED',
      origem: 'FATURA',
    })
  }

  return results
}
