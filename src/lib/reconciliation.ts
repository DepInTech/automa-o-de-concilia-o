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
 * Mapeador Inteligente e Dinâmico de Colunas.
 * Garante compatibilidade automática com Itaú, cartões antigos, CSVs ou planilhas variadas.
 */
function getCardDetails(card: any) {
  const keys = Object.keys(card || {})

  // 1. Busca dinâmica pelo campo do Estabelecimento
  const estKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return (
      n === 'estabelecimento' ||
      n === 'parceiro' ||
      n === 'local' ||
      n === 'descrição' ||
      n === 'descricao'
    )
  })
  const estabelecimento = estKey ? String(card[estKey] || '') : ''

  // 2. Busca dinâmica pelo campo do Valor (aceita "valor", "valor (r$)", "total", etc.)
  const valKey = keys.find((k) => {
    const n = k.toLowerCase().trim()
    return n === 'valor' || n.includes('valor') || n === 'total' || n === 'credito'
  })

  let valor = 0
  if (valKey) {
    const rawVal = card[valKey]
    if (typeof rawVal === 'number') {
      valor = rawVal
    } else if (rawVal) {
      // Limpa formatações de moeda como R$, pontos de milhar e substitui vírgula por ponto decimal
      const cleanStr = String(rawVal)
        .replace(/[^\d,.-]/g, '')
        .trim()
      if (cleanStr.includes(',') && cleanStr.includes('.')) {
        valor = parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'))
      } else if (cleanStr.includes(',')) {
        valor = parseFloat(cleanStr.replace(',', '.'))
      } else {
        valor = parseFloat(cleanStr)
      }
    }
  }

  // 3. Busca dinâmica pela Data
  const dataKey = keys.find((k) => k.toLowerCase().trim() === 'data')
  const data = dataKey ? String(card[dataKey] || '') : ''

  // 4. Busca dinâmica pela Categoria
  const catKey = keys.find((k) => k.toLowerCase().trim() === 'categoria')
  const categoria = catKey ? String(card[catKey] || '') : ''

  return {
    id: card.id || `card-${estabelecimento}-${valor}-${data}`,
    estabelecimento,
    valor: isNaN(valor) ? 0 : valor,
    data,
    categoria,
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedSystem = new Set<string>()
  const matchedCard = new Set<string>()

  // Normaliza e padroniza todos os cartões de forma robusta e dinâmica
  const normalizedCards = (cardRecords || []).map((card) => getCardDetails(card))

  // 1. Processa matches com o Sistema
  for (const sys of systemRecords) {
    if (matchedSystem.has(sys.id)) continue

    const candidates = normalizedCards.filter(
      (card) =>
        !matchedCard.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )

    if (candidates.length === 0) {
      continue
    }

    // Match de Nome + Valor Igual/Uber -> VERDE
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

    // Match de Nome + Valor Divergente -> AMARELO
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
