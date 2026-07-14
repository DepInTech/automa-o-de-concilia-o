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
 * Retorna true se houver uma correspondência clara de nome próprio entre as partes.
 */
function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  // 1. Caso simples: nomes idênticos ou um contido inteiramente no outro (ex: "vindi *swiftrecorren" vs "swift recorrente")
  if (p === e || p.includes(e) || e.includes(p)) {
    return true
  }

  // 2. Lista de termos genéricos ignorados para focar no nome real da empresa
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

  // 3. Comparação Estrita de Palavras
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
 * Janela de tempo lógica máxima entre a compra e o registro no sistema (padrão 45 dias)
 */
function isPaymentWindowValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const dataCompra = new Date(dataCompraStr).getTime()
    const dataPagamento = new Date(dataPagamentoStr).getTime()
    if (dataPagamento < dataCompra) return false
    const diffDays = Math.ceil((dataPagamento - dataCompra) / (1000 * 60 * 60 * 24))
    return diffDays <= 45
  } catch {
    return true
  }
}

function createGreen(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `GREEN-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria || sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: fatura.valor,
    diferenca: 0,
    status: 'GREEN',
    origem: 'AMBOS',
  }
}

function createYellow(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `YELLOW-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria || sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: fatura.valor,
    diferenca: calcDifference(sistema.credito, fatura.valor),
    status: 'YELLOW',
    origem: 'AMBOS',
  }
}

function createRedSystem(sistema: SystemRecord): ReconciliationResult {
  return {
    id: `RED-SYS-${sistema.id}`,
    data: sistema.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: sistema.parceiro,
    estabelecimento: '-',
    categoria: sistema.categoria,
    debito: sistema.debito,
    credito: sistema.credito,
    valorFatura: null,
    diferenca: null,
    status: 'RED',
    origem: 'SISTEMA',
  }
}

function createRedCard(fatura: CardRecord): ReconciliationResult {
  return {
    id: `RED-CARD-${fatura.id}`,
    data: fatura.data,
    lancamentoDiario: '-',
    parceiro: '-',
    estabelecimento: fatura.estabelecimento,
    categoria: fatura.categoria,
    debito: null,
    credito: null,
    valorFatura: fatura.valor,
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
  const matchedCardIds = new Set<string>()

  for (const sys of systemRecords) {
    // REGRA 1: Match de Nome + Mesmo Valor + Janela de Tempo -> VERDE (Conciliado Perfeitamente)
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data),
    )

    // REGRA 2: Match de Nome + Janela de Tempo (Valor é diferente! Ex: Swift R$ 1475,25 vs R$ 1484,23) -> AMARELO
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isSameEstablishment(sys.parceiro, card.estabelecimento) &&
          isPaymentWindowValid(card.data, sys.data),
      )
    }

    // REGRA 3: Match de Nome (Qualquer data - Fallback de segurança para atrasos de conciliação) -> AMARELO/VERDE
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
      )
    }

    // Se encontramos correspondência pelo nome do estabelecimento:
    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      if (sameValue(sys.credito, cardMatch.valor)) {
        results.push(createGreen(sys, cardMatch))
      } else {
        results.push(createYellow(sys, cardMatch)) // Vira amarelo mostrando a diferença de valor calculada!
      }
    } else {
      // Se não houver correspondência nenhuma do nome, vai separado para Vermelho no painel
      results.push(createRedSystem(sys))
    }
  }

  // Tudo o que sobrou na fatura sem nenhum match de nome vai para Vermelho
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
