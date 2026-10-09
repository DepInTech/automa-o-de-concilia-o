import type {
  SystemRecord,
  CardRecord,
  ReconciliationResult,
  BankType,
  MatchClassification,
} from './types'
import {
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
  parseFlexibleDate,
} from './normalization'

/**
 * Extrai o valor do sistema com prioridade para Total e Crédito
 */
export function getSystemValue(sys: SystemRecord, bank: BankType): number {
  if (bank === 'itau') {
    const val = sys.total !== null && sys.total !== undefined ? sys.total : sys.credito
    return normalizeMoneyValue(val)
  }
  const val = sys.credito !== null && sys.credito !== undefined ? sys.credito : sys.total
  return normalizeMoneyValue(val)
}

/**
 * Extrai o valor da fatura de forma tolerante (preservando sinal de estorno)
 */
export function getCardValue(card: CardRecord): number {
  return normalizeMoneyValue(card.valor)
}

function parseBrazilianDateTimestamp(dateStr: string): number {
  const parts = parseFlexibleDate(dateStr)
  if (!parts) return 0
  const y = parts.year || 2026
  return new Date(y, parts.month - 1, parts.day).getTime()
}

/**
 * Estrutura interna para avaliar o par candidato (SystemRecord x CardRecord)
 */
interface MatchCandidate {
  sys: SystemRecord
  card: CardRecord
  sysVal: number
  cardVal: number
  diffVal: number
  nameSim: number
  dateDiffDays: number | null
  refMatch: boolean
  totalScore: number
  classification: MatchClassification
  reason: string
}

/**
 * Avalia a compatibilidade de um par (Sistema x Fatura) atribuindo uma pontuação de 0 a 100
 * Critérios combinados com pontuação, prioridade:
 * 1) VALOR (peso dominante — valores iguais são pré-requisito forte, mas nunca suficientes sozinhos)
 * 2) ESTABELECIMENTO/PARCEIRO (similaridade de tokens, normalização de prefixos/sufixos)
 * 3) DATA/PERÍODO (tolerância de até 30 dias entre data de compra e lançamento contábil)
 * 4) REFERÊNCIA / NÚMERO quando disponível
 */
function evaluatePair(
  sys: SystemRecord,
  card: CardRecord,
  sysVal: number,
  cardVal: number,
): MatchCandidate {
  const diffVal = Math.round((cardVal - sysVal) * 100) / 100
  const absDiff = Math.abs(diffVal)
  const isValueExact = absDiff < 0.01
  const isValueClose = absDiff <= 2.0 // Diferença pequena até R$ 2,00 (ex: taxas ou arredondamentos)

  const nameSim = calculateNameSimilarity(sys.parceiro, card.estabelecimento)
  const dateDiffDays = calculateDateDifferenceInDays(sys.data, card.data)

  // Checagem de referência ou número no nome ou campo
  let refMatch = false
  if (sys.referencia && sys.referencia.length >= 3) {
    if (
      card.estabelecimento.toLowerCase().includes(sys.referencia.toLowerCase()) ||
      (card as any).referencia?.toLowerCase().includes(sys.referencia.toLowerCase())
    ) {
      refMatch = true
    }
  }
  if (sys.numero && sys.numero.length >= 4) {
    if (card.estabelecimento.toLowerCase().includes(sys.numero.toLowerCase())) {
      refMatch = true
    }
  }

  // CÁLCULO DO SCORE (0 a 100)
  let score = 0

  // 1. Componente Valor (até 45 pontos)
  if (isValueExact) {
    score += 45
  } else if (isValueClose) {
    score += 30 - absDiff * 5
  } else if (absDiff < 20.0) {
    score += 15
  }

  // 2. Componente Nome / Estabelecimento (até 40 pontos)
  // Regra crítica: se o nome tiver similaridade quase nula (estabelecimentos totalmente diferentes),
  // a pontuação de nome é 0 e penaliza
  if (nameSim >= 0.85) {
    score += 40
  } else if (nameSim >= 0.6) {
    score += 30
  } else if (nameSim >= 0.4) {
    score += 20
  } else if (nameSim >= 0.2) {
    score += 10
  }

  // 3. Componente Data (até 10 pontos)
  if (dateDiffDays !== null) {
    if (dateDiffDays <= 3) {
      score += 10
    } else if (dateDiffDays <= 10) {
      score += 8
    } else if (dateDiffDays <= 20) {
      score += 5
    } else if (dateDiffDays <= 35) {
      score += 2
    }
  } else {
    // Se não há data clara, pontuação neutra
    score += 4
  }

  // 4. Componente Referência (até 5 pontos extras)
  if (refMatch) {
    score += 5
  }

  // CLASSIFICAÇÃO E MOTIVO
  let classification: MatchClassification
  let reason = ''

  // Data é critério AUXILIAR: tolerância contábil ampla até 60 dias (ou null)
  const isDateAcceptable = dateDiffDays === null || dateDiffDays <= 60

  if (isValueExact && nameSim >= 0.35 && isDateAcceptable) {
    // CONCILIADO: valor idêntico + estabelecimento compatível
    classification = 'CONCILIADO'
    reason = 'Valor e estabelecimento compatíveis'
  } else if (isValueExact && nameSim >= 0.35 && !isDateAcceptable) {
    // Mesmo estabelecimento e mesmo valor, porém datas extremamente distantes (> 60 dias)
    classification = 'DIVERGENTE'
    reason = `Data fora da tolerância contábil (${dateDiffDays} dias)`
  } else if (isValueExact && nameSim < 0.2) {
    // Valores iguais mas estabelecimentos totalmente diferentes NÃO devem ser casados automaticamente
    classification = 'POSSIVEL_CORRESPONDENCIA'
    reason = 'Mesmo valor, mas estabelecimentos não relacionados'
    score = Math.min(score, 25)
  } else if (isValueExact && nameSim >= 0.2 && nameSim < 0.35) {
    // Possível correspondência: mesmo valor mas similaridade de nome limítrofe
    classification = 'POSSIVEL_CORRESPONDENCIA'
    reason = 'Possível correspondência (verificar parceiro)'
  } else if (!isValueExact && nameSim >= 0.4) {
    // DIVERGENTE: mesmo estabelecimento (ou semelhante), mas valores DIFERENTES
    const difStr = absDiff > 0 ? `dif. R$ ${absDiff.toFixed(2).replace('.', ',')}` : ''
    classification = 'DIVERGENTE'
    reason = `Mesmo estabelecimento com valor diferente (${difStr})`
  } else {
    classification = 'POSSIVEL_CORRESPONDENCIA'
    reason = 'Verificação manual recomendada'
  }

  return {
    sys,
    card,
    sysVal,
    cardVal,
    diffVal,
    nameSim,
    dateDiffDays,
    refMatch,
    totalScore: score,
    classification,
    reason,
  }
}

/**
 * Motor de Conciliação Financeira com Matching Inteligente
 * Garante Unicidade Estrita (1 registro do Sistema <-> no máximo 1 da Fatura e vice-versa)
 */
export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
  bank: BankType = 'itau',
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []

  const matchedSystemIds = new Set<string>()
  const matchedCardIds = new Set<string>()

  // REQUISITO 3: ETAPA INTERNA DE ORGANIZAÇÃO DOS LANÇAMENTOS POR VALOR CRESCENTE EM CADA FONTE
  // Organiza os lançamentos por valor crescente para facilitar a busca e otimização
  const sysWithVals = systemRecords
    .map((sys) => ({
      sys,
      val: getSystemValue(sys, bank),
    }))
    .sort((a, b) => a.val - b.val)

  const cardWithVals = cardRecords
    .map((card) => ({
      card,
      val: getCardValue(card),
    }))
    .sort((a, b) => a.val - b.val)

  // Gera todos os pares possíveis candidatos
  const candidates: MatchCandidate[] = []
  for (const s of sysWithVals) {
    for (const c of cardWithVals) {
      const candidate = evaluatePair(s.sys, c.card, s.val, c.val)
      candidates.push(candidate)
    }
  }

  // PRIORIDADE DE CORRESPONDÊNCIA (Requisitos 4, 5 e 6):
  // 1) Estabelecimento correspondente e valor igual (nameSim alto + isExactVal)
  // 2) Nome abreviado / semelhante e valor igual (isExactVal + nameSim razoável)
  // 3) Estabelecimento correspondente com valor diferente (DIVERGENTE)
  // Ordena os candidatos por score decrescente, priorizando valor exato e nameSim
  candidates.sort((a, b) => {
    const aExact = Math.abs(a.diffVal) < 0.01
    const bExact = Math.abs(b.diffVal) < 0.01
    if (aExact && !bExact) return -1
    if (!aExact && bExact) return 1

    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
    if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
    return Math.abs(a.diffVal) - Math.abs(b.diffVal)
  })

  // FASE 1: Correspondências Exatas de Valor com Alta/Média Similaridade de Estabelecimento
  // (Requisito 6: compras repetidas de mesmo estabelecimento associam individualmente 1-para-1)
  for (const cand of candidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    const isExactVal = Math.abs(cand.diffVal) < 0.01
    if (isExactVal && cand.nameSim >= 0.3) {
      matchedSystemIds.add(cand.sys.id)
      matchedCardIds.add(cand.card.id)

      results.push({
        id: `GREEN-${cand.sys.id}-${cand.card.id}`,
        data: cand.sys.data || cand.card.data,
        numero: cand.sys.numero,
        referencia: cand.sys.referencia,
        lancamentoDiario: cand.sys.lancamentoDiario,
        parceiro: cand.sys.parceiro,
        estabelecimento: cand.card.estabelecimento,
        categoria: cand.card.categoria || cand.sys.categoria || '',
        debito: cand.sys.debito,
        credito: cand.sysVal,
        valorFatura: cand.cardVal,
        diferenca: 0,
        status: 'GREEN',
        origem: 'AMBOS',
        classificacao: 'CONCILIADO',
        motivo: 'Estabelecimento e valor conciliados com sucesso',
        scoreConfianca: cand.totalScore,
      })
    }
  }

  // FASE 1b: Pareamento de valor exato com similaridade abreviada/marginal (0.2 a 0.3)
  for (const cand of candidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    const isExactVal = Math.abs(cand.diffVal) < 0.01
    if (isExactVal && (cand.nameSim >= 0.22 || cand.refMatch)) {
      matchedSystemIds.add(cand.sys.id)
      matchedCardIds.add(cand.card.id)

      results.push({
        id: `GREEN-${cand.sys.id}-${cand.card.id}`,
        data: cand.sys.data || cand.card.data,
        numero: cand.sys.numero,
        referencia: cand.sys.referencia,
        lancamentoDiario: cand.sys.lancamentoDiario,
        parceiro: cand.sys.parceiro,
        estabelecimento: cand.card.estabelecimento,
        categoria: cand.card.categoria || cand.sys.categoria || '',
        debito: cand.sys.debito,
        credito: cand.sysVal,
        valorFatura: cand.cardVal,
        diferenca: 0,
        status: 'GREEN',
        origem: 'AMBOS',
        classificacao: 'CONCILIADO',
        motivo: 'Estabelecimento abreviado e valor conciliados',
        scoreConfianca: cand.totalScore,
      })
    }
  }

  // FASE 2: Pareamento de "DIVERGENTE" (AMARELO)
  // Regra obrigatória: "Antes de classificar como divergente, verificar se existe outra compra do mesmo
  // estabelecimento que corresponda exatamente ao valor." Como as Fases 1 e 1b já consumiram todas as
  // correspondências exatas possíveis, aqui restam apenas os registros do mesmo estabelecimento que
  // legitimamente possuem valores diferentes.
  for (const cand of candidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    // Para ser classificado como divergente, deve haver correspondência forte de estabelecimento (nameSim >= 0.45)
    if (cand.nameSim >= 0.45 && Math.abs(cand.diffVal) >= 0.01) {
      matchedSystemIds.add(cand.sys.id)
      matchedCardIds.add(cand.card.id)

      const difAbs = Math.abs(cand.diffVal).toFixed(2).replace('.', ',')
      results.push({
        id: `YELLOW-${cand.sys.id}-${cand.card.id}`,
        data: cand.sys.data || cand.card.data,
        numero: cand.sys.numero,
        referencia: cand.sys.referencia,
        lancamentoDiario: cand.sys.lancamentoDiario,
        parceiro: cand.sys.parceiro,
        estabelecimento: cand.card.estabelecimento,
        categoria: cand.card.categoria || cand.sys.categoria || '',
        debito: cand.sys.debito,
        credito: cand.sysVal,
        valorFatura: cand.cardVal,
        diferenca: cand.diffVal,
        status: 'YELLOW',
        origem: 'AMBOS',
        classificacao: 'DIVERGENTE',
        motivo: `Estabelecimento correspondente, porém valores divergentes (dif. R$ ${difAbs})`,
        scoreConfianca: cand.totalScore,
      })
    }
  }

  // FASE 3: Lançamentos exclusivos do Sistema Odoo (VERMELHO - SOMENTE SISTEMA)
  for (const s of sysWithVals) {
    if (matchedSystemIds.has(s.sys.id)) continue

    results.push({
      id: `RED-SYS-${s.sys.id}`,
      data: s.sys.data,
      numero: s.sys.numero,
      referencia: s.sys.referencia,
      lancamentoDiario: s.sys.lancamentoDiario,
      parceiro: s.sys.parceiro,
      estabelecimento: '-',
      categoria: s.sys.categoria || '',
      debito: s.sys.debito,
      credito: s.val,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
      origem: 'SISTEMA',
      classificacao: 'SOMENTE_SISTEMA',
      motivo: 'Existe no Odoo sem correspondência na fatura',
      scoreConfianca: 0,
    })
  }

  // FASE 4: Lançamentos exclusivos da Fatura (VERMELHO - SOMENTE FATURA)
  // Esperado para parcelas de meses anteriores, taxas e compras sem contraparte no Odoo
  for (const c of cardWithVals) {
    if (matchedCardIds.has(c.card.id)) continue

    results.push({
      id: `RED-CARD-${c.card.id}`,
      data: c.card.data,
      parceiro: '-',
      estabelecimento: c.card.estabelecimento,
      categoria: c.card.categoria || (c.card.isInternacional ? 'Internacional' : ''),
      debito: null,
      credito: null,
      valorFatura: c.val,
      diferenca: null,
      status: 'RED',
      origem: 'FATURA',
      classificacao: 'SOMENTE_FATURA',
      motivo: 'Existe na fatura sem correspondência no lançamento contábil do Odoo',
      scoreConfianca: 0,
    })
  }

  // REQUISITO 9: Ordenação crescente por valor por padrão
  // "Ordenação crescente por valor por padrão, permitindo ordenar também pelos valores do Odoo ou da fatura"
  return results.sort((a, b) => {
    const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
    const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
    if (valA !== valB) return valA - valB
    return parseBrazilianDateTimestamp(a.data) - parseBrazilianDateTimestamp(b.data)
  })
}
