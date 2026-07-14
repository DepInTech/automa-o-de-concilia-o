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

function isWithinGreenTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= 2.0
}

function calcDifference(credito: number, valor: number): number {
  return Number((valor - credito).toFixed(2))
}

/**
 * Converte qualquer valor em texto/número para um decimal válido
 */
function parseCurrency(val: any): number {
  if (typeof val === 'number') return val
  if (!val) return 0

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
 * Normaliza os dados vindos do sistema (Odoo, Diário, etc.)
 */
function getSystemDetails(sys: any) {
  const keys = Object.keys(sys || {})

  const parceiroKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return n === 'parceiro' || n === 'nome' || n === 'fornecedor'
  })

  const totalKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return n === 'total' || n === 'credito' || n === 'valor'
  })

  const numKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return (
      n === 'numero' ||
      n === 'número' ||
      n === 'lancamentodiario' ||
      n === 'referencia' ||
      n === 'referência'
    )
  })

  const dataKey = keys.find((k) => k.toLowerCase().trim() === 'data')

  return {
    id: sys.id || String(sys[numKey || ''] || Math.random()),
    data: dataKey ? String(sys[dataKey] || '') : '',
    lancamentoDiario: numKey ? String(sys[numKey] || '') : '',
    parceiro: parceiroKey ? String(sys[parceiroKey] || '') : '',
    categoria: sys.categoria || '',
    debito: sys.debito || null,
    credito: totalKey ? parseCurrency(sys[totalKey]) : 0,
  }
}

/**
 * Normaliza os dados vindos de QUALQUER Cartão (Santander, Itaú, etc.)
 */
function getCardDetails(card: any) {
  const keys = Object.keys(card || {})

  const estKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return (
      n === 'estabelecimento' ||
      n === 'parceiro' ||
      n === 'local' ||
      n === 'descricao' ||
      n === 'descrição'
    )
  })

  const valKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return n === 'valor' || n.includes('valor') || n === 'total'
  })

  const dataKey = keys.find((k) => k.toLowerCase().trim() === 'data')
  const catKey = keys.find((k) => k.toLowerCase().trim() === 'categoria')

  return {
    id: card.id || `card-${card[estKey || '']}-${card[valKey || '']}-${card[dataKey || '']}`,
    estabelecimento: estKey ? String(card[estKey] || '') : '',
    valor: valKey ? parseCurrency(card[valKey]) : 0,
    data: dataKey ? String(card[dataKey] || '') : '',
    categoria: catKey ? String(card[catKey] || '') : '',
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedSystem = new Set<string>()
  const matchedCard = new Set<string>()

  // Normaliza de forma inteligente as duas listas recebidas
  const normalizedSystem = (systemRecords || []).map((sys) => getSystemDetails(sys))
  const normalizedCards = (cardRecords || []).map((card) => getCardDetails(card))

  // 1. Processa matches com o Sistema
  for (const sys of normalizedSystem) {
    if (matchedSystem.has(sys.id)) continue

    const candidates = normalizedCards.filter(
      (card) =>
        !matchedCard.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )

    if (candidates.length === 0) {
      continue
    }

    // Match de Nome + Valor com tolerância de R$ 2,00 (Verde)
    const exactMatch = candidates.find((card) => isWithinGreenTolerance(sys.credito, card.valor))

    if (exactMatch) {
      matchedSystem.add(sys.id)
      matchedCard.add(exactMatch.id)

      results.push({
        id: `GREEN-${sys.id}-${exactMatch.id}`,
        data: sys.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: exactMatch.estabelecimento,
        categoria: exactMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: exactMatch.valor,
        diferenca: calcDifference(sys.credito, exactMatch.valor),
        status: 'GREEN',
        origem: 'AMBOS',
      })
      continue
    }

    // Match de Nome + Valores divergentes (Amarelo)
    let yellowMatch = candidates[0]
    let menorDiferenca = Math.abs(sys.credito - yellowMatch.valor)

    for (const candidate of candidates) {
      const diferenca = Math.abs(sys.credito - candidate.valor)
      if (diferenca < menorDiferenca) {
        menorDiferenca = diferenca
        yellowMatch = candidate
      }
    }

    matchedSystem.add(sys.id)
    matchedCard.add(yellowMatch.id)

    results.push({
      id: `YELLOW-${sys.id}-${yellowMatch.id}`,
      data: sys.data,
      lancamentoDiario: sys.lancamentoDiario,
      parceiro: sys.parceiro,
      estabelecimento: yellowMatch.estabelecimento,
      categoria: yellowMatch.categoria || sys.categoria,
      debito: sys.debito,
      credito: sys.credito,
      valorFatura: yellowMatch.valor,
      diferenca: calcDifference(sys.credito, yellowMatch.valor),
      status: 'YELLOW',
      origem: 'AMBOS',
    })
  }

  // 2. Apenas no Sistema -> RED
  for (const sys of normalizedSystem) {
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

  // 3. Apenas na Fatura -> RED
  for (const card of normalizedCards) {
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
