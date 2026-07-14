import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Validação de nomes para garantir o vínculo correto de estabelecimentos
 */
function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  if (p === e || p.includes(e) || e.includes(p)) {
    return true
  }

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
    'comerci',
    'produtos',
    'vendas',
    'importacao',
    'comercio',
    'distribuidora',
    'loja',
    'lojas',
    'brasil',
    'grupo',
    'solucoes',
    'industria',
  ])

  const wordsP = p.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))
  const wordsE = e.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))

  return wordsP.some((wp) => {
    return wordsE.some((we) => {
      if (wp.length >= 8 || we.length >= 8) {
        return wp.includes(we) || we.includes(wp)
      }
      return wp === we
    })
  })
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedCardIds = new Set<string>()

  // 1. Varrer o Sistema e buscar correspondentes na Fatura pelo nome do Estabelecimento
  for (const sys of systemRecords) {
    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
    )

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)

      results.push({
        id: `RECON-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito, // Valor do Sistema
        valorFatura: cardMatch.valor, // Valor da Fatura
        diferenca: calcDifference(sys.credito, cardMatch.valor), // Exibe a diferença exata na coluna
        status: 'YELLOW', // Mantemos uma string de fallback para não quebrar a tipagem do TypeScript, mas ignoramos no visual
        origem: 'AMBOS',
      })
    } else {
      // Registro existe apenas no Sistema
      results.push({
        id: `ONLY-SYS-${sys.id}`,
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
  }

  // 2. Registros que existem apenas na Fatura
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push({
        id: `ONLY-CARD-${card.id}`,
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
  }

  return results
}
