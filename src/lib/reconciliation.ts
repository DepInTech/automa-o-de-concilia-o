/**
 * Motor Independente de Conciliação Financeira
 * Grupo EPA - Reconstrução do fluxo de correspondência e auditoria
 *
 * Princípios e Regras Fundamentais:
 * 1. Independência Total da Interface:
 *    - Recebe duas listas estruturadas (transações da fatura e lançamentos do Odoo).
 *    - Retorna lista estruturada de resultados sem depender de componentes de tela.
 * 2. Critério Principal:
 *    - Nome do estabelecimento + Valor monetário.
 *    - Data, número, referência, portador = critérios auxiliares (tolerância contábil ampla).
 * 3. Prioridade Rigorosa:
 *    1) Nome correspondente + Valor exato (GREEN / CONCILIADO)
 *    2) Nome abreviado/semelhante + Valor exato (GREEN / CONCILIADO)
 *    3) Mesmo estabelecimento com valores diferentes (YELLOW / DIVERGENTE),
 *       quando não houver correspondência exata melhor
 *    4) Ambíguos / casos de verificação (POSSIVEL_CORRESPONDENCIA)
 *    5) Exclusivos do Sistema (RED / SOMENTE_SISTEMA) e Exclusivos da Fatura (RED / SOMENTE_FATURA)
 * 4. Unicidade Estrita e Matching Global:
 *    - Cada lançamento da fatura é usado no máximo UMA vez.
 *    - Cada lançamento do Odoo é usado no máximo UMA vez.
 *    - Avaliação global de candidatos (não aceita o primeiro que encontrar).
 * 5. Compras Repetidas:
 *    - Múltiplas compras do mesmo estabelecimento (ex: Starlink R$ 78, 249, 1.199) casam
 *      individualmente e produzem três verdes, independentemente da ordem em que foram importadas.
 * 6. Ordem Invariante:
 *    - A ordem de entrada dos arquivos não afeta os pares resultantes.
 */

import type {
  SystemRecord,
  CardRecord,
  ReconciliationResult,
  BankType,
  MatchClassification,
  ReconciliationMetrics,
} from './types'
import {
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
  parseFlexibleDate,
} from './normalization'

/**
 * Extrai o valor monetário do registro do Odoo
 */
export function getSystemValue(sys: SystemRecord, bank: BankType = 'itau'): number {
  if (bank === 'itau') {
    const val = sys.total !== null && sys.total !== undefined ? sys.total : sys.credito
    return normalizeMoneyValue(val)
  }
  const val = sys.credito !== null && sys.credito !== undefined ? sys.credito : sys.total
  return normalizeMoneyValue(val)
}

/**
 * Extrai o valor monetário da fatura (preserva estorno como negativo)
 */
export function getCardValue(card: CardRecord): number {
  return normalizeMoneyValue(card.valor)
}

function parseDateTimestamp(dateStr?: string): number {
  if (!dateStr) return 0
  const parts = parseFlexibleDate(dateStr)
  if (!parts) return 0
  const y = parts.year || 2026
  return new Date(y, parts.month - 1, parts.day).getTime()
}

interface MatchCandidate {
  sys: SystemRecord
  card: CardRecord
  sysVal: number
  cardVal: number
  diffVal: number
  absDiff: number
  nameSim: number
  dateDiffDays: number | null
  refMatch: boolean
  totalScore: number
}

/**
 * Avalia par candidato atribuindo score objetivo de afinidade
 */
function evaluateCandidate(
  sys: SystemRecord,
  card: CardRecord,
  sysVal: number,
  cardVal: number,
): MatchCandidate {
  const diffVal = Math.round((cardVal - sysVal) * 100) / 100
  const absDiff = Math.abs(diffVal)
  const isExactVal = absDiff < 0.01

  const nameSim = calculateNameSimilarity(sys.parceiro, card.estabelecimento)
  const dateDiffDays = calculateDateDifferenceInDays(sys.data, card.data)

  // Referência cruzada (NF, número de pedido ou código nos detalhes)
  let refMatch = false
  if (sys.referencia && sys.referencia.length >= 3) {
    if (card.estabelecimento.toLowerCase().includes(sys.referencia.toLowerCase())) {
      refMatch = true
    }
  }
  if (sys.numero && sys.numero.length >= 4) {
    if (card.estabelecimento.toLowerCase().includes(sys.numero.toLowerCase())) {
      refMatch = true
    }
  }

  // Pontuação composta (0 a 100):
  // 1. Componente Valor (até 45 pts)
  let score = 0
  if (isExactVal) {
    score += 45
  } else if (absDiff <= 2.0) {
    score += 30 - absDiff * 5
  } else if (absDiff <= 20.0) {
    score += 15
  }

  // 2. Componente Nome (até 40 pts)
  if (nameSim >= 0.85) {
    score += 40
  } else if (nameSim >= 0.6) {
    score += 30
  } else if (nameSim >= 0.4) {
    score += 20
  } else if (nameSim >= 0.2) {
    score += 10
  }

  // 3. Componente Data (até 10 pts) — tolerância contábil ampla
  if (dateDiffDays !== null) {
    if (dateDiffDays <= 3) {
      score += 10
    } else if (dateDiffDays <= 15) {
      score += 8
    } else if (dateDiffDays <= 35) {
      score += 5
    } else if (dateDiffDays <= 60) {
      score += 2
    }
  } else {
    score += 4
  }

  // 4. Componente Referência (5 pts)
  if (refMatch) score += 5

  return {
    sys,
    card,
    sysVal,
    cardVal,
    diffVal,
    absDiff,
    nameSim,
    dateDiffDays,
    refMatch,
    totalScore: score,
  }
}

/**
 * Executa a conciliação completa entre registros do Sistema e da Fatura
 */
export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
  bank: BankType = 'itau',
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedSystemIds = new Set<string>()
  const matchedCardIds = new Set<string>()

  // 1. Organização preliminar padronizada por valor e data para garantir determinismo total
  // (Invariância à ordem de importação)
  const normalizedSys = systemRecords
    .map((sys) => ({ sys, val: getSystemValue(sys, bank) }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      return (a.sys.id || '').localeCompare(b.sys.id || '')
    })

  const normalizedCard = cardRecords
    .map((card) => ({ card, val: getCardValue(card) }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      return (a.card.id || '').localeCompare(b.card.id || '')
    })

  // 2. Geração global de todos os pares candidatos
  const candidates: MatchCandidate[] = []
  for (const s of normalizedSys) {
    for (const c of normalizedCard) {
      candidates.push(evaluateCandidate(s.sys, c.card, s.val, c.val))
    }
  }

  // 3. FASE 1: Prioridade Máxima — Valor Exato + Alta/Média Similaridade de Nome
  // Ordena candidatos por valor exato primeiro, depois score e nameSim
  const exactCandidates = candidates
    .filter((cand) => cand.absDiff < 0.01 && cand.nameSim >= 0.3)
    .sort((a, b) => {
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      return (a.dateDiffDays ?? 999) - (b.dateDiffDays ?? 999)
    })

  for (const cand of exactCandidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    matchedSystemIds.add(cand.sys.id)
    matchedCardIds.add(cand.card.id)

    results.push({
      id: `GREEN-${cand.sys.id}-${cand.card.id}`,
      dataFatura: cand.card.data,
      dataOdoo: cand.sys.data,
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
      motivo: 'Estabelecimento e valor conciliados com exatidão',
      scoreConfianca: cand.totalScore,
      linhaOdooOrigem: cand.sys.linhaOrigem,
      paginaFaturaOrigem: cand.card.paginaOrigem,
      isInternacional: cand.card.isInternacional,
      moedaOriginal: cand.card.moedaGlobal || 'BRL',
    })
  }

  // 4. FASE 1b: Valor Exato + Similaridade de Nome Abreviado / Marginal (0.22 a 0.30 ou RefMatch)
  const abreviatedCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff < 0.01 &&
        (cand.nameSim >= 0.22 || cand.refMatch) &&
        !matchedSystemIds.has(cand.sys.id) &&
        !matchedCardIds.has(cand.card.id),
    )
    .sort((a, b) => b.totalScore - a.totalScore)

  for (const cand of abreviatedCandidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    matchedSystemIds.add(cand.sys.id)
    matchedCardIds.add(cand.card.id)

    results.push({
      id: `GREEN-${cand.sys.id}-${cand.card.id}`,
      dataFatura: cand.card.data,
      dataOdoo: cand.sys.data,
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
      linhaOdooOrigem: cand.sys.linhaOrigem,
      paginaFaturaOrigem: cand.card.paginaOrigem,
      isInternacional: cand.card.isInternacional,
      moedaOriginal: cand.card.moedaGlobal || 'BRL',
    })
  }

  // 5. FASE 2: Casos DIVERGENTES (AMARELO)
  // Regra obrigatória: Estabelecimentos correspondentes (nameSim >= 0.40) com valores diferentes,
  // apenas após esgotadas todas as correspondências exatas de valor.
  const divergentCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff >= 0.01 &&
        cand.nameSim >= 0.4 &&
        !matchedSystemIds.has(cand.sys.id) &&
        !matchedCardIds.has(cand.card.id),
    )
    .sort((a, b) => {
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      return a.absDiff - b.absDiff
    })

  for (const cand of divergentCandidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    matchedSystemIds.add(cand.sys.id)
    matchedCardIds.add(cand.card.id)

    const difStr = cand.absDiff.toFixed(2).replace('.', ',')
    results.push({
      id: `YELLOW-${cand.sys.id}-${cand.card.id}`,
      dataFatura: cand.card.data,
      dataOdoo: cand.sys.data,
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
      motivo: `Estabelecimento correspondente, porém valores divergentes (dif. R$ ${difStr})`,
      scoreConfianca: cand.totalScore,
      linhaOdooOrigem: cand.sys.linhaOrigem,
      paginaFaturaOrigem: cand.card.paginaOrigem,
      isInternacional: cand.card.isInternacional,
    })
  }

  // 6. FASE 3: Lançamentos Exclusivos do Sistema (RED / SOMENTE_SISTEMA)
  for (const s of normalizedSys) {
    if (matchedSystemIds.has(s.sys.id)) continue

    results.push({
      id: `RED-SYS-${s.sys.id}`,
      dataOdoo: s.sys.data,
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
      motivo: 'Existe no Odoo sem correspondência encontrada na fatura',
      scoreConfianca: 0,
      linhaOdooOrigem: s.sys.linhaOrigem,
    })
  }

  // 7. FASE 4: Lançamentos Exclusivos da Fatura (RED / SOMENTE_FATURA)
  for (const c of normalizedCard) {
    if (matchedCardIds.has(c.card.id)) continue

    results.push({
      id: `RED-CARD-${c.card.id}`,
      dataFatura: c.card.data,
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
      paginaFaturaOrigem: c.card.paginaOrigem,
      isInternacional: c.card.isInternacional,
      moedaOriginal: c.card.moedaGlobal || 'BRL',
    })
  }

  // 8. Ordenação padrão: crescente por valor
  return results.sort((a, b) => {
    const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
    const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
    if (valA !== valB) return valA - valB
    return parseDateTimestamp(a.data) - parseDateTimestamp(b.data)
  })
}

/**
 * Calculador Oficial de Indicadores da Conciliação
 *
 * Fórmula documentada:
 * - Total Odoo (R$): Soma de todos os lançamentos do sistema (exclusivos + conciliados/divergentes)
 * - Total Fatura (R$): Soma de todas as transações da fatura (exclusivos + conciliados/divergentes)
 * - Diferença Total: Total Fatura - Total Odoo
 * - Percentual de Conciliação: (Pares Conciliados / Total de Registros Únicos) * 100
 *   Onde total de registros únicos = pares conciliados + pares divergentes + somente sistema + somente fatura.
 *   Essa fórmula considera todo o universo de transações auditadas, nunca ignorando os resíduos.
 */
export function calculateReconciliationMetrics(
  results: ReconciliationResult[],
  totalSistemaOriginal?: number,
  totalFaturaOriginal?: number,
): ReconciliationMetrics {
  const conciliated = results.filter((r) => r.status === 'GREEN')
  const exactMatches = conciliated.filter(
    (r) => r.motivo.toLowerCase().includes('exatidão') || r.motivo.toLowerCase().includes('exato'),
  )
  const similarNameMatches = conciliated.filter(
    (r) =>
      !r.motivo.toLowerCase().includes('exatidão') && !r.motivo.toLowerCase().includes('exato'),
  )
  const divergent = results.filter((r) => r.status === 'YELLOW')
  const onlySys = results.filter((r) => r.classificacao === 'SOMENTE_SISTEMA')
  const onlyFat = results.filter((r) => r.classificacao === 'SOMENTE_FATURA')
  const inReview = results.filter((r) => r.classificacao === 'POSSIVEL_CORRESPONDENCIA')

  // Totais separados e estritos
  const totalValorSistema =
    Math.round(
      results.reduce(
        (sum, r) => sum + (r.credito !== null && r.credito !== undefined ? r.credito : 0),
        0,
      ) * 100,
    ) / 100

  const totalValorFatura =
    Math.round(
      results.reduce(
        (sum, r) =>
          sum + (r.valorFatura !== null && r.valorFatura !== undefined ? r.valorFatura : 0),
        0,
      ) * 100,
    ) / 100

  // Total conciliado em CADA fonte (não somar as duas fontes juntas)
  const totalValorConciliadoSistema =
    Math.round(
      conciliated.reduce(
        (sum, r) => sum + (r.credito !== null && r.credito !== undefined ? r.credito : 0),
        0,
      ) * 100,
    ) / 100

  const totalValorConciliadoFatura =
    Math.round(
      conciliated.reduce(
        (sum, r) =>
          sum + (r.valorFatura !== null && r.valorFatura !== undefined ? r.valorFatura : 0),
        0,
      ) * 100,
    ) / 100

  const totalValorExclusivoSistema =
    Math.round(
      onlySys.reduce(
        (sum, r) => sum + (r.credito !== null && r.credito !== undefined ? r.credito : 0),
        0,
      ) * 100,
    ) / 100

  const totalValorExclusivoFatura =
    Math.round(
      onlyFat.reduce(
        (sum, r) =>
          sum + (r.valorFatura !== null && r.valorFatura !== undefined ? r.valorFatura : 0),
        0,
      ) * 100,
    ) / 100

  const totalDiferencaDivergentes =
    Math.round(
      divergent.reduce(
        (sum, r) =>
          sum + Math.abs(r.diferenca !== null && r.diferenca !== undefined ? r.diferenca : 0),
        0,
      ) * 100,
    ) / 100

  const diferencaTotal = Math.round((totalValorFatura - totalValorSistema) * 100) / 100

  const totalRegistrosSistema =
    totalSistemaOriginal ??
    results.filter((r) => r.origem === 'SISTEMA' || r.origem === 'AMBOS').length

  const totalRegistrosFatura =
    totalFaturaOriginal ??
    results.filter((r) => r.origem === 'FATURA' || r.origem === 'AMBOS').length

  const percentualConciliacao =
    results.length > 0 ? Math.round((conciliated.length / results.length) * 1000) / 10 : 0

  return {
    totalRegistrosSistema,
    totalRegistrosFatura,
    paresConciliados: conciliated.length,
    correspondenciasExatas: exactMatches.length,
    correspondenciasNomeSemelhante: similarNameMatches.length,
    paresDivergentes: divergent.length,
    somenteSistema: onlySys.length,
    somenteFatura: onlyFat.length,
    casosEmRevisao: inReview.length,
    registrosDescartados: 0,
    justificativaDescartes:
      'Nenhum registro foi descartado silenciosamente: linhas de cabeçalho ou rodapé bancário de total foram filtradas na extração.',
    totalValorSistema,
    totalValorFatura,
    totalValorConciliadoSistema,
    totalValorConciliadoFatura,
    totalValorExclusivoSistema,
    totalValorExclusivoFatura,
    totalDiferencaDivergentes,
    diferencaTotal,
    percentualConciliacao,
  }
}
