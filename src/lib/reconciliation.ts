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

/**
 * Função utilitária para extrair e normalizar valores monetários de qualquer formato (Texto ou Número)
 */
function safeParseValue(val: any): number {
  if (typeof val === 'number') return val
  if (!val) return 0

  // Remove R$, espaços e pontos de milhar, ajustando a vírgula para ponto decimal
  const cleanStr = String(val)
    .replace(/[^\d,.-]/g, '')
    .trim()
  if (cleanStr.includes(',') && cleanStr.includes('.')) {
    return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'))
  } else if (cleanStr.includes(',')) {
    return parseFloat(cleanStr.replace(',', '.'))
  }
  return parseFloat(cleanStr) || 0
}

/**
 * Retorna o valor de crédito do registro do Sistema de forma flexível (suporta "total" ou "credito")
 */
function getSystemValue(sys: any, bank: BankType): number {
  if (bank === 'itau') {
    // No Itaú, o valor do sistema está na coluna "Total" (que pode vir como .total ou .credito após o upload)
    return safeParseValue(sys.total ?? sys.credito ?? sys.Total)
  }
  return safeParseValue(sys.credito ?? sys.total ?? sys.Credito)
}

/**
 * Retorna o valor da fatura do Cartão de forma flexível (suporta "valor" ou "Valor (R$)")
 */
function getCardValue(card: any): number {
  // Procura por qualquer variação de propriedade que contenha "valor"
  const keys = Object.keys(card || {})
  const valueKey = keys.find((k) => k.toLowerCase().includes('valor'))
  if (valueKey) {
    return safeParseValue(card[valueKey])
  }
  return safeParseValue(card.valor ?? card.total)
}

function sortSystemRecordsByValueDesc(records: SystemRecord[], bank: BankType): SystemRecord[] {
  return [...records].sort((a, b) => {
    return getSystemValue(b, bank) - getSystemValue(a, bank)
  })
}

function sortCardRecordsByValueDesc(records: CardRecord[]): CardRecord[] {
  return [...records].sort((a, b) => getCardValue(b) - getCardValue(a))
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
  // 1. Aplica a ordenação decrescente completa por valor/total antes de iniciar o cruzamento
  const sortedSystemRecords = sortSystemRecordsByValueDesc(systemRecords, bank)
  const sortedCardRecords = sortCardRecordsByValueDesc(cardRecords)

  const results: ReconciliationResult[] = []
  const matchedSystem = new Set<string>()
  const matchedCard = new Set<string>()

  for (const sys of sortedSystemRecords) {
    if (matchedSystem.has(sys.id)) continue

    const sysVal = getSystemValue(sys, bank)

    // Filtra os candidatos usando a lista devidamente ordenada de cartões
    const candidates = sortedCardRecords.filter(
      (card) =>
        !matchedCard.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )
    if (candidates.length === 0) continue

    // Busca exata (Verde) utilizando o array ordenado por valor
    const exactMatch = sortedCardRecords.find(
      (card) =>
        !matchedCard.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isExactMatch(sysVal, getCardValue(card)),
    )

    if (exactMatch) {
      const matchVal = getCardValue(exactMatch)
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
        credito: sysVal,
        valorFatura: matchVal,
        diferenca: calcDifference(sysVal, matchVal),
        status: 'GREEN',
        origem: 'AMBOS',
      })
      continue
    }

    // Se não encontrou exato, pega o de menor diferença (Amarelo) mantendo a prioridade da ordenação
    let yellowMatch = candidates[0]
    let minDiff = Math.abs(sysVal - getCardValue(yellowMatch))
    for (const c of candidates) {
      const d = Math.abs(sysVal - getCardValue(c))
      if (d < minDiff) {
        minDiff = d
        yellowMatch = c
      }
    }

    const yellowVal = getCardValue(yellowMatch)
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
      credito: sysVal,
      valorFatura: yellowVal,
      diferenca: calcDifference(sysVal, yellowVal),
      status: 'YELLOW',
      origem: 'AMBOS',
    })
  }

  // Registros que ficaram só no sistema
  for (const sys of sortedSystemRecords) {
    if (matchedSystem.has(sys.id)) continue
    const sysVal = getSystemValue(sys, bank)
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
      credito: sysVal,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
      origem: 'SISTEMA',
    })
  }

  // Registros que ficaram só na fatura
  for (const card of sortedCardRecords) {
    if (matchedCard.has(card.id)) continue
    const cardVal = getCardValue(card)
    results.push({
      id: `RED-CARD-${card.id}`,
      data: card.data,
      parceiro: '-',
      estabelecimento: card.estabelecimento,
      categoria: card.categoria || '',
      debito: null,
      credito: null,
      valorFatura: cardVal,
      diferenca: null,
      status: 'RED',
      origem: 'FATURA',
    })
  }

  // Ao final, organiza o output decrescente por data para exibição na tela
  return results.sort((a, b) => parseBrazilianDate(b.data) - parseBrazilianDate(a.data))
}
