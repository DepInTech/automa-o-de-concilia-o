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
 * Validação de nomes (usada para matches perfeitos)
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
 * Janela de tempo aceitável para conciliação automática por valor único (ex: até 10 dias)
 */
function isPaymentWindowValid(
  dataCompraStr?: string,
  dataPagamentoStr?: string,
  maxDays = 10,
): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true
  try {
    const dataCompra = new Date(dataCompraStr).getTime()
    const dataPagamento = new Date(dataPagamentoStr).getTime()
    if (dataPagamento < dataCompra) return false
    const diffDays = Math.ceil((dataPagamento - dataCompra) / (1000 * 60 * 60 * 24))
    return diffDays <= maxDays
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

function createYellow(
  sistema: SystemRecord,
  fatura: CardRecord,
  motivo: string,
): ReconciliationResult {
  return {
    id: `YELLOW-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data,
    lancamentoDiario: sistema.lancamentoDiario,
    parceiro: `${sistema.parceiro} (${motivo})`,
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

  // Para cada registro do sistema
  for (const sys of systemRecords) {
    // REGRA 1: Match Perfeito (Mesmo estabelecimento + Mesmo valor + Janela lógica) -> VERDE
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data, 45),
    )

    // REGRA 2: Mesmo Estabelecimento, mas com Valor Diferente -> AMARELO (Divergência de Preço)
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isSameEstablishment(sys.parceiro, card.estabelecimento) &&
          isPaymentWindowValid(card.data, sys.data, 45),
      )
      if (cardMatch) {
        matchedCardIds.add(cardMatch.id)
        results.push(createYellow(sys, cardMatch, 'Valor Divergente'))
        continue
      }
    }

    // REGRA 3: Valores Iguais + Janela de tempo curta (máx 10 dias) + O valor deve ser ÚNICO
    // Se os nomes não batem de jeito nenhum, só juntamos se esse valor não se repetir na fatura nem no sistema
    if (!cardMatch) {
      const valorProcurado = sys.credito

      // Conta quantas vezes esse valor aparece nas faturas restantes disponíveis
      const faturasComMesmoValor = cardRecords.filter(
        (c) => !matchedCardIds.has(c.id) && sameValue(valorProcurado, c.valor),
      )

      // Conta quantas vezes esse valor aparece no sistema
      const sistemasComMesmoValor = systemRecords.filter((s) =>
        sameValue(valorProcurado, s.credito),
      )

      // Só concilia se for estritamente um registro único de cada lado para este valor
      if (faturasComMesmoValor.length === 1 && sistemasComMesmoValor.length === 1) {
        const candidata = faturasComMesmoValor[0]

        if (isPaymentWindowValid(candidata.data, sys.data, 10)) {
          cardMatch = candidata
          matchedCardIds.add(cardMatch.id)
          results.push(createYellow(sys, cardMatch, 'Nomes Incompatíveis'))
          continue
        }
      }
    }

    // Se passou por todas as regras e não achou par seguro
    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      results.push(createGreen(sys, cardMatch))
    } else {
      results.push(createRedSystem(sys))
    }
  }

  // O que sobrou na fatura sem nenhum vínculo seguro vira Vermelho
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
