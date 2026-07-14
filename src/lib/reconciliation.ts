import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function samePartner(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false
  return p === e || p.includes(e) || e.includes(p)
}

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

/**
 * Valida se a data de pagamento (Sistema) faz sentido em relação à data de compra (Fatura).
 * A data de pagamento deve ser posterior à data de compra, tipicamente em até 45 dias.
 */
function isPaymentWindowValid(dataCompraStr?: string, dataPagamentoStr?: string): boolean {
  if (!dataCompraStr || !dataPagamentoStr) return true // Se um dos lados não tiver data, não bloqueia

  try {
    const dataCompra = new Date(dataCompraStr).getTime()
    const dataPagamento = new Date(dataPagamentoStr).getTime()

    // O pagamento não pode acontecer ANTES da compra
    if (dataPagamento < dataCompra) return false

    // Calcula a diferença em dias
    const diffTime = dataPagamento - dataCompra
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    // Retorna true se o pagamento ocorreu dentro do ciclo esperado de faturamento (até 45 dias)
    return diffDays <= 45
  } catch {
    return true // Fallback em caso de erro de parse de data
  }
}

function createGreen(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `GREEN-${sistema.id}-${fatura.id}`,
    data: sistema.data || fatura.data, // Prioriza a data de lançamento ou compra
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
    // 1ª Tentativa: Procura transações do mesmo parceiro, cujo valor seja igual
    // E onde o pagamento ocorra em até 45 dias após a data da compra.
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        samePartner(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data),
    )

    // 2ª Tentativa (Se não achou o valor perfeito): Procura apenas o mesmo parceiro na mesma janela de datas
    // (Isso gerará o alerta Amarelo para diferença de valor na mesma transação temporal)
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          samePartner(sys.parceiro, card.estabelecimento) &&
          isPaymentWindowValid(card.data, sys.data),
      )
    }

    // 3ª Tentativa (Último recurso): Se não houver correspondência temporal, tenta achar apenas pelo nome
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) => !matchedCardIds.has(card.id) && samePartner(sys.parceiro, card.estabelecimento),
      )
    }

    if (cardMatch) {
      matchedCardIds.add(cardMatch.id)
      if (sameValue(sys.credito, cardMatch.valor)) {
        results.push(createGreen(sys, cardMatch))
      } else {
        results.push(createYellow(sys, cardMatch))
      }
    } else {
      results.push(createRedSystem(sys))
    }
  }

  // Registros sobressalentes da fatura que não foram mapeados vão para Vermelho
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
