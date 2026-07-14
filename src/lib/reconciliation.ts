import type { SystemRecord, CardRecord, ReconciliationResult } from './types'
import type { BankType } from './types'

function parseBrazilianDate(dateStr: string): number {
  if (!dateStr) return 0
  const parts = dateStr.trim().split(/[/\-.]/)
  if (parts.length >= 3) {
    const d = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    const y = parseInt(parts[2], 10)
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      return new Date(y, m - 1, d).getTime()
    }
  }
  const parsed = Date.parse(dateStr)
  return isNaN(parsed) ? 0 : parsed
}

function sortSystemRecordsByValueDesc(records: SystemRecord[], bank: BankType): SystemRecord[] {
  return [...records].sort((a, b) => {
    const valA = bank === 'itau' ? (a.total ?? a.credito) : a.credito
    const valB = bank === 'itau' ? (b.total ?? b.credito) : b.credito
    return valB - valA
  })
}

function sortCardRecordsByValueDesc(records: CardRecord[]): CardRecord[] {
  return [...records].sort((a, b) => b.valor - a.valor)
}

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[*]/g, ' ')
    .replace(/\s+/g, ' ')
}

const IGNORE_WORDS = new Set([
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

function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  const wordsP = p.split(/[\s-]+/).filter((w) => w.length > 3 && !IGNORE_WORDS.has(w))
  const wordsE = e.split(/[\s-]+/).filter((w) => w.length > 3 && !IGNORE_WORDS.has(w))
  return wordsP.filter((w) => wordsE.includes(w)).length > 0
}

function isExactMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001
}

function calcDifference(credito: number, valor: number): number {
  return Number((valor - credito).toFixed(2))
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
  bank: BankType = 'itau',
): ReconciliationResult[] {
  // Ordena as planilhas inteiras de forma decrescente antes de qualquer outra ação
  const sortedSystemRecords = sortSystemRecordsByValueDesc(systemRecords, bank)
  const sortedCardRecords = sortCardRecordsByValueDesc(cardRecords)

  const results: ReconciliationResult[] = []
  const matchedSystem = new Set<string>()
  const matchedCard = new Set<string>()

  for (const sys of sortedSystemRecords) {
    if (matchedSystem.has(sys.id)) continue

    // CORREÇÃO: Filtrando a partir do array devidamente ordenado (sortedCardRecords)
    const candidates = sortedCardRecords.filter(
      (card) =>
        !matchedCard.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )
    if (candidates.length === 0) continue

    const exactMatch = sortedCardRecords.find(
      (card) =>
        !matchedCard.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isExactMatch(sys.credito, card.valor),
    )

    if (exactMatch) {
      matchedSystem.add(sys.id)
      matchedCard.add(exactMatch.id)
      results.push({
        id: `GREEN-${sys.id}-${exactMatch.id}`,
        data: sys.data,
        numero: sys.numero,
        referencia: sys.referencia,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: exactMatch.estabelecimento,
        categoria: exactMatch.categoria || sys.categoria || '',
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: exactMatch.valor,
        diferenca: calcDifference(sys.credito, exactMatch.valor),
        status: 'GREEN',
        origem: 'AMBOS',
      })
      continue
    }

    // Como candidates agora vem de sortedCardRecords, yellowMatch herda a ordem decrescente correta
    let yellowMatch = candidates[0]
    let minDiff = Math.abs(sys.credito - yellowMatch.valor)
    for (const c of candidates) {
      const d = Math.abs(sys.credito - c.valor)
      if (d < minDiff) {
        minDiff = d
        yellowMatch = c
      }
    }
    matchedSystem.add(sys.id)
    matchedCard.add(yellowMatch.id)
    results.push({
      id: `YELLOW-${sys.id}-${yellowMatch.id}`,
      data: sys.data,
      numero: sys.numero,
      referencia: sys.referencia,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
      estabelecimento: yellowMatch.estabelecimento,
      categoria: yellowMatch.categoria || sys.categoria || '',
      debito: sys.debito,
      credito: sys.credito,
      valorFatura: yellowMatch.valor,
      diferenca: calcDifference(sys.credito, yellowMatch.valor),
      status: 'YELLOW',
      origem: 'AMBOS',
    })
  }

  for (const sys of sortedSystemRecords) {
    if (matchedSystem.has(sys.id)) continue
    results.push({
      id: `RED-SYS-${sys.id}`,
      data: sys.data,
      numero: sys.numero,
      referencia: sys.referencia,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
      estabelecimento: '-',
      categoria: sys.categoria || '',
      debito: sys.debito,
      credito: sys.credito,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
      origem: 'SISTEMA',
    })
  }

  for (const card of sortedCardRecords) {
    if (matchedCard.has(card.id)) continue
    results.push({
      id: `RED-CARD-${card.id}`,
      data: card.data,
      parceiro: '-',
      estabelecimento: card.estabelecimento,
      categoria: card.categoria || '',
      debito: null,
      credito: null,
      valorFatura: card.valor,
      diferenca: null,
      status: 'RED',
      origem: 'FATURA',
    })
  }

  // Ao final, organiza o output decrescente por data para exibição na tela
  return results.sort((a, b) => parseBrazilianDate(b.data) - parseBrazilianDate(a.data))
}
