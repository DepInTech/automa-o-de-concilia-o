import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

// Normaliza o texto removendo acentos, espaços extras e deixando em minúsculo
function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Valida de forma altamente segura se o parceiro do sistema e o estabelecimento da fatura são o mesmo.
 * Evita matches falsos limpando palavras comerciais genéricas e aplicando regras estritas para palavras curtas.
 */
function isSameEstablishment(parceiro: string, estabelecimento: string): boolean {
  const p = normalize(parceiro)
  const e = normalize(estabelecimento)
  if (!p || !e) return false

  // 1. Caso simples: nomes idênticos ou um contido inteiramente no outro
  if (p === e || p.includes(e) || e.includes(p)) {
    return true
  }

  // 2. Lista robusta de palavras comuns que NÃO devem causar matches (Stopwords)
  // Isso impede que "NETLAB EQUIPAMENTOS..." case com "BIOCENTRIX MATERIA" (por causa de "Material/Materia")
  const ignoreWords = new Set([
    // Termos societários / operacionais de cartões
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
    // Palavras comerciais genéricas que causavam falsos positivos
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

  // Divide o texto por espaços, asteriscos ou hífens
  const wordsP = p.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))
  const wordsE = e.split(/[\s*-]+/).filter((w) => w.length > 3 && !ignoreWords.has(w))

  // 3. Comparação Estrita de Palavras (Exige correspondência exata para nomes próprios médios/curtos)
  return wordsP.some((wp) => {
    return wordsE.some((we) => {
      // Se for uma palavra muito grande (ex: 8+ letras, como "biocentrix"), permite variação parcial leve
      if (wp.length >= 8 || we.length >= 8) {
        return wp.includes(we) || we.includes(wp)
      }
      // Se for palavra de tamanho normal (ex: "netlab", "muddar"), exige correspondência 100% exata
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
 * Valida a janela temporal: a data de pagamento (Sistema) deve ser posterior à data de compra (Fatura),
 * aceitando uma janela realista de ciclo de cartão de até 45 dias.
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
    // 1ª Tentativa (Prioridade Máxima): Mesmo estabelecimento + Mesma Janela de Datas + Valor Idêntico (Vira VERDE)
    let cardMatch = cardRecords.find(
      (card) =>
        !matchedCardIds.has(card.id) &&
        isSameEstablishment(sys.parceiro, card.estabelecimento) &&
        sameValue(sys.credito, card.valor) &&
        isPaymentWindowValid(card.data, sys.data),
    )

    // 2ª Tentativa: Mesmo estabelecimento + Mesma Janela de Datas (Mesmo que com valor divergente, vira AMARELO)
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) &&
          isSameEstablishment(sys.parceiro, card.estabelecimento) &&
          isPaymentWindowValid(card.data, sys.data),
      )
    }

    // 3ª Tentativa (Fallback de atraso): Apenas mesmo estabelecimento em qualquer data
    if (!cardMatch) {
      cardMatch = cardRecords.find(
        (card) =>
          !matchedCardIds.has(card.id) && isSameEstablishment(sys.parceiro, card.estabelecimento),
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

  // Registros que ficaram órfãos na fatura vão para Vermelho
  for (const card of cardRecords) {
    if (!matchedCardIds.has(card.id)) {
      results.push(createRedCard(card))
    }
  }

  return results
}
