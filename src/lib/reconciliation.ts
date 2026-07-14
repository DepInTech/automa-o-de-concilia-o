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
 * Validação de nomes para o match perfeito (Verde)
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

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * Valida proximidade de datas (até 15 dias)
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

  // Passo 1: Encontrar todos os Matches Perfeitos primeiro (Nome Igual + Valor Igual) -> VERDE
  for (const sys of systemRecords) {
    const cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
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
        diferenca: 0,
        status: 'GREEN',
        origem: 'AMBOS',
      })
    }
  }

  // Passo 2: Para o que sobrou, tentar conciliar por Valor Único + Data -> AMARELO
  // Isso resolve perfeitamente o caso da LOJADOMECANICO de R$ 3055,88 vs MERCADOLIVRE*LOJABELG
  for (const sys of systemRecords) {
    // Pula se esse registro do sistema já foi conciliado no Passo 1
    const jáConciliado = results.some(
      (r) => r.id.includes(`-${sys.id}-`) || r.id.includes(`-${sys.id}`),
    )
    if (jáConciliado) continue

    const valorProcurado = sys.credito

    // Conta quantas faturas ainda disponíveis têm exatamente este valor
    const faturasComMesmoValor = cardRecords.filter(
      (c) =>
        !matchedCardIds.has(c.id) &&
        sameValue(valorProcurado, c.valor) &&
        isDateMatchValid(c.data, sys.data),
    )

    // Conta quantos registros do sistema têm exatamente este valor
    const sistemasComMesmoValor = systemRecords.filter((s) => sameValue(valorProcurado, s.credito))

    // Segurança contra duplicidade: Só concilia se o valor for exclusivo (1 para 1) naquela faixa de data
    if (faturasComMesmoValor.length === 1 && sistemasComMesmoValor.length === 1) {
      const cardMatch = faturasComMesmoValor[0]
      matchedCardIds.add(cardMatch.id)

      results.push({
        id: `YELLOW-${sys.id}-${cardMatch.id}`,
        data: sys.data || cardMatch.data,
        lancamentoDiario: sys.lancamentoDiario,
        parceiro: `${sys.parceiro} (Conciliado por Valor)`,
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
      // Se não achou match seguro por valor, fica como Vermelho (Só no Sistema)
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

  // Passo 3: O que sobrou na fatura sem conciliação nenhuma vira Vermelho (Só na Fatura)
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
