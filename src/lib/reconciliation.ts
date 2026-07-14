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
 * Validação de nomes inteligente e estrita.
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

// Checa se o valor é idêntico centavo por centavo
function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

/**
 * Nova Regra: Permite pequenas variações (ex: diferença de 40 centavos no Uber)
 * para ainda conciliar no VERDE (Match Perfeito/Quase Perfeito).
 */
function isMicroDifference(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) <= 2.0 // Margem de tolerância de até R$ 2,00 para o Verde
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * Valida se as datas de lançamento estão em uma janela próxima de até 15 dias.
 */
function isDateMatchValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const d1 = new Date(dataCompraStr).getTime()
    const d2 = new Date(dataPagamentoStr).getTime()
    const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24)
    return diffDays <= 15
  } catch {
    return true
  }
}

export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedCardIds = new Set<string>()

  // PASSO 1: Buscar matches pelo NOME onde o valor seja igual ou com micro diferença (até R$ 2,00) -> VERDE
  for (const sys of systemRecords) {
    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isMicroDifference(sys.credito, card.valor) &&
        isDateMatchValid(card.data, sys.data),
    )

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      results.push({
        id: `GREEN-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: calcDifference(sys.credito, cardMatch.valor), // Mostra a diferençazinha de centavos, se houver
        status: 'GREEN',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 2: Buscar matches pelo NOME onde o valor seja diferente (excedendo R$ 2,00 de diferença, ex: Swift) -> AMARELO
  for (const sys of systemRecords) {
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        isDateMatchValid(card.data, sys.data),
    )

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      results.push({
        id: `YELLOW-NAME-DIFF-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: sys.parceiro,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: calcDifference(sys.credito, cardMatch.valor),
        status: 'YELLOW',
        origem: 'AMBOS',
      })
    }
  }

  // PASSO 3: Buscar matches de nomes incompatíveis pelo VALOR EXCLUSIVO (ex: Gurgelmix vs MercadoLivre) -> AMARELO
  for (const sys of systemRecords) {
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    const valorProcurado = sys.credito

    // Busca faturas sem par com o mesmo valor exato no período
    const faturasComMesmoValor = cardRecords.filter(
      (c) =>
        !matchedCardIds.has(c.id) &&
        sameValue(valorProcurado, c.valor) &&
        isDateMatchValid(c.data, sys.data),
    )

    const sistemasComMesmoValor = systemRecords.filter((s) => sameValue(valorProcurado, s.credito))

    // Sendo um valor exclusivo (ex: R$ 3.055,88), une de forma segura
    if (faturasComMesmoValor.length === 1 && sistemasComMesmoValor.length === 1) {
      const cardMatch = faturasComMesmoValor[0]
      matchedCardIds.add(cardMatch.id)

      results.push({
        id: `YELLOW-VAL-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: `${sys.parceiro} (Valor Equivalente)`,
        estabelecimento: cardMatch.estabelecimento,
        categoria: cardMatch.categoria || sys.categoria,
        debito: sys.debito,
        credito: sys.credito,
        valorFatura: cardMatch.valor,
        diferenca: 0,
        status: 'YELLOW',
        origem: 'AMBOS',
      })
    } else {
      // Se não encontrou match de jeito nenhum, vira Vermelho (Só no Sistema)
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
  }

  // PASSO 4: Tudo o que sobrou na fatura sem correspondência vira Vermelho (Só na Fatura)
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
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
  }

  return results
}
