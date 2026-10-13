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
  if (sys.referencia && sys.referencia.trim().length >= 3) {
    const refClean = sys.referencia.trim().toLowerCase()
    if (card.estabelecimento.toLowerCase().includes(refClean)) {
      refMatch = true
    }
  }
  if (sys.numero && sys.numero.trim().length >= 4) {
    const numClean = sys.numero.trim().toLowerCase()
    if (card.estabelecimento.toLowerCase().includes(numClean)) {
      refMatch = true
    }
  }

  // Pontuação composta (0 a 100):
  // 1. Componente Valor (até 45 pts)
  let score = 0
  if (isExactVal) {
    score += 45
  } else if (absDiff <= 1.0) {
    score += 25 - absDiff * 10
  } else if (absDiff <= 10.0) {
    score += 10
  }

  // 2. Componente Nome (até 40 pts)
  if (nameSim >= 0.85) {
    score += 40
  } else if (nameSim >= 0.6) {
    score += 32
  } else if (nameSim >= 0.4) {
    score += 22
  } else if (nameSim >= 0.25) {
    score += 10
  }

  // 3. Componente Data (até 10 pts) — proximidade temporal
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
 * Regras estritas:
 * 1) Estabelecimento correspondente + Valor exato (GREEN)
 * 2) Nomes abreviados/semelhantes + Valor exato e evidências adicionais (GREEN)
 * 3) Mesmo estabelecimento com valores diferentes (YELLOW), após esgotar exatas
 * 4) Ambíguos / dados insuficientes (GRAY / POSSIVEL_CORRESPONDENCIA)
 * 5) Exclusivos de cada fonte (RED / SOMENTE_SISTEMA ou SOMENTE_FATURA)
 * Invariância à ordem: ordenação canônica preliminar baseada em conteúdo intrínseco.
 */
export function reconcileData(
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
  bank: BankType = 'itau',
): ReconciliationResult[] {
  const results: ReconciliationResult[] = []
  const matchedSystemIds = new Set<string>()
  const matchedCardIds = new Set<string>()

  // 1. Organização preliminar padronizada canônica para garantir determinismo total
  // Ordena por valor e depois por campos intrínsecos de negócio (parceiro/estabelecimento, data)
  // NÃO depende da ordem em que os arquivos foram lidos nem da posição de linha
  const normalizedSys = systemRecords
    .map((sys) => ({ sys, val: getSystemValue(sys, bank) }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      const nameCmp = (a.sys.parceiro || '').localeCompare(b.sys.parceiro || '')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.sys.data || '').localeCompare(b.sys.data || '')
      if (dateCmp !== 0) return dateCmp
      return (a.sys.id || '').localeCompare(b.sys.id || '')
    })

  const normalizedCard = cardRecords
    .map((card) => ({ card, val: getCardValue(card) }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      const nameCmp = (a.card.estabelecimento || '').localeCompare(b.card.estabelecimento || '')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.card.data || '').localeCompare(b.card.data || '')
      if (dateCmp !== 0) return dateCmp
      return (a.card.id || '').localeCompare(b.card.id || '')
    })

  // 2. Geração global de todos os pares candidatos
  const candidates: MatchCandidate[] = []
  for (const s of normalizedSys) {
    for (const c of normalizedCard) {
      candidates.push(evaluateCandidate(s.sys, c.card, s.val, c.val))
    }
  }

  // Mapa de frequência de valores em cada fonte para detectar unicidade estrita
  const sysValueFreq = new Map<number, number>()
  for (const s of normalizedSys) {
    sysValueFreq.set(s.val, (sysValueFreq.get(s.val) || 0) + 1)
  }
  const cardValueFreq = new Map<number, number>()
  for (const c of normalizedCard) {
    cardValueFreq.set(c.val, (cardValueFreq.get(c.val) || 0) + 1)
  }

  // 3. FASE 1: Prioridade 1 — Alta Confiabilidade: Valor Exato + Alta Similaridade de Nome (nameSim >= 0.45)
  // Ordenação de candidatos: score decrescente, similaridade decrescente, menor diferença de data, determinismo canônico
  const highConfExact = candidates
    .filter((cand) => cand.absDiff < 0.01 && cand.nameSim >= 0.45)
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      const dtA = a.dateDiffDays ?? 999
      const dtB = b.dateDiffDays ?? 999
      if (dtA !== dtB) return dtA - dtB
      return (a.sys.id || '').localeCompare(b.sys.id || '')
    })

  for (const cand of highConfExact) {
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
      observacaoManualFatura: cand.card.observacaoManual,
      observacaoManualOdoo: cand.sys.observacaoManual,
    })
  }

  // 4. FASE 2: Prioridade 2 — Nomes Abreviados / Semelhantes + Valor Exato
  // Requer: valor rigorosamente exato E (nameSim >= 0.32 OU refMatch confirmado)
  // Além disso, se o score for marginal (nameSim < 0.35 sem refMatch) ou houver múltiplos concorrentes idênticos,
  // não pode associar levianamente
  const abreviatedCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff < 0.01 &&
        (cand.nameSim >= 0.32 || cand.refMatch) &&
        !matchedSystemIds.has(cand.sys.id) &&
        !matchedCardIds.has(cand.card.id),
    )
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      const dtA = a.dateDiffDays ?? 999
      const dtB = b.dateDiffDays ?? 999
      if (dtA !== dtB) return dtA - dtB
      return (a.sys.id || '').localeCompare(b.sys.id || '')
    })

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
      observacaoManualFatura: cand.card.observacaoManual,
      observacaoManualOdoo: cand.sys.observacaoManual,
    })
  }

  // 4b. FASE 2B: Fallback para Valor Exato Único em AMBAS as fontes (Padrões 1 e 3)
  // Aplicável quando:
  // a) O valor monetário aparece EXATAMENTE UMA VEZ em cada fonte (sem concorrência de valor)
  // b) Pertencem à mesma família de marketplace (ex: Odoo tem apenas "Mercado Livre" genérico e a fatura tem "MERCADOLIVRE*...")
  // c) OU são parceiros comerciais sem compartilhamento de token, onde o valor único e ausência de qualquer outro par confere correspondência
  // Se houver dois candidatos disputando o mesmo valor na família de marketplace sem diferencial textual → vira CINZA (Revisão Manual) na Fase 4.
  const remainingSys = normalizedSys.filter((s) => !matchedSystemIds.has(s.sys.id))
  const remainingCard = normalizedCard.filter((c) => !matchedCardIds.has(c.card.id))

  for (const s of remainingSys) {
    if (matchedSystemIds.has(s.sys.id)) continue

    // Verifica se o valor é único nas duas fontes entre os remanescentes
    const remSysWithVal = remainingSys.filter(
      (item) => !matchedSystemIds.has(item.sys.id) && Math.abs(item.val - s.val) < 0.01,
    )
    const remCardWithVal = remainingCard.filter(
      (item) => !matchedCardIds.has(item.card.id) && Math.abs(item.val - s.val) < 0.01,
    )

    // Caso A: Exatamente 1 no Odoo e 1 na Fatura com o mesmo valor único entre os remanescentes
    if (remSysWithVal.length === 1 && remCardWithVal.length === 1) {
      const c = remCardWithVal[0]

      const isMlSys = /mercado\s*livre|mercadolivre/i.test(s.sys.parceiro)
      const isMlCard = /mercado\s*livre|mercadolivre|mercado\*|mp\s*\*/i.test(
        c.card.estabelecimento,
      )

      // Se ambos são da família marketplace
      if (isMlSys && isMlCard) {
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)

        results.push({
          id: `GREEN-${s.sys.id}-${c.card.id}`,
          dataFatura: c.card.data,
          dataOdoo: s.sys.data,
          data: s.sys.data || c.card.data,
          numero: s.sys.numero,
          referencia: s.sys.referencia,
          lancamentoDiario: s.sys.lancamentoDiario,
          parceiro: s.sys.parceiro,
          estabelecimento: c.card.estabelecimento,
          categoria: c.card.categoria || s.sys.categoria || '',
          debito: s.sys.debito,
          credito: s.val,
          valorFatura: c.val,
          diferenca: 0,
          status: 'GREEN',
          origem: 'AMBOS',
          classificacao: 'CONCILIADO',
          motivo: 'Família Marketplace: valor único exclusivo em ambas as fontes',
          scoreConfianca: 85,
          linhaOdooOrigem: s.sys.linhaOrigem,
          paginaFaturaOrigem: c.card.paginaOrigem,
          isInternacional: c.card.isInternacional,
          moedaOriginal: c.card.moedaGlobal || 'BRL',
          observacaoManualFatura: c.card.observacaoManual,
          observacaoManualOdoo: s.sys.observacaoManual,
        })
        continue
      }

      // Caso de parceiro comercial fora do marketplace onde o valor é único nas duas fontes:
      // Ex: Padrão 3 da usuária: "pares corretos em que o nome comercial da fatura e o parceiro do Odoo
      // NÃO compartilham nenhum token; a conferência manual validou esses pares apoiada em valor que aparece
      // uma única vez em cada fonte + informações auxiliares."
      // REGRA ESTRITA:
      // Quando os nomes normalizados das duas fontes não compartilham NENHUM token distintivo relevante,
      // o pareamento por valor único só deve ocorrer se o valor for de fato estritamente único globalmente
      // (freq === 1 em ambas as fontes) E NÃO HOUVER NENHUM OUTRO CANDIDATO CONCORRENTE com valor igual ou próximo
      // (absDiff <= 5.0 ou 2% do valor) em qualquer das fontes.
      // Se houver qualquer outro candidato com valor igual ou próximo, o caso NÃO pode ir para VERDE:
      // deve ir para CINZA (revisão) ou permanecer não pareado para análise.
      const isGloballyUniqueSys = (sysValueFreq.get(s.val) || 0) === 1
      const isGloballyUniqueCard = (cardValueFreq.get(c.val) || 0) === 1
      const nameSim = calculateNameSimilarity(s.sys.parceiro, c.card.estabelecimento)

      // Tolerância para detectar candidatos com valor próximo concorrente
      const nearThreshold = Math.max(0.5, Math.min(5.0, s.val * 0.02))
      const hasNearSysCompetitor = normalizedSys.some(
        (otherSys) =>
          otherSys.sys.id !== s.sys.id &&
          Math.abs(otherSys.val - s.val) > 0.009 &&
          Math.abs(otherSys.val - s.val) <= nearThreshold,
      )
      const hasNearCardCompetitor = normalizedCard.some(
        (otherCard) =>
          otherCard.card.id !== c.card.id &&
          Math.abs(otherCard.val - c.val) > 0.009 &&
          Math.abs(otherCard.val - c.val) <= nearThreshold,
      )
      const hasCompetingCandidate =
        !isGloballyUniqueSys ||
        !isGloballyUniqueCard ||
        hasNearSysCompetitor ||
        hasNearCardCompetitor

      if (isGloballyUniqueSys && isGloballyUniqueCard && !hasCompetingCandidate) {
        // Sem nenhum concorrente com valor igual ou próximo em ambas as fontes
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)

        results.push({
          id: `GREEN-${s.sys.id}-${c.card.id}`,
          dataFatura: c.card.data,
          dataOdoo: s.sys.data,
          data: s.sys.data || c.card.data,
          numero: s.sys.numero,
          referencia: s.sys.referencia,
          lancamentoDiario: s.sys.lancamentoDiario,
          parceiro: s.sys.parceiro,
          estabelecimento: c.card.estabelecimento,
          categoria: c.card.categoria || s.sys.categoria || '',
          debito: s.sys.debito,
          credito: s.val,
          valorFatura: c.val,
          diferenca: 0,
          status: 'GREEN',
          origem: 'AMBOS',
          classificacao: 'CONCILIADO',
          motivo: 'Valor monetário único e exclusivo em ambas as fontes sem concorrente',
          scoreConfianca: nameSim >= 0.2 ? 80 : 70,
          linhaOdooOrigem: s.sys.linhaOrigem,
          paginaFaturaOrigem: c.card.paginaOrigem,
          isInternacional: c.card.isInternacional,
          moedaOriginal: c.card.moedaGlobal || 'BRL',
          observacaoManualFatura: c.card.observacaoManual,
          observacaoManualOdoo: s.sys.observacaoManual,
        })
        continue
      } else if (hasCompetingCandidate && (isGloballyUniqueSys || isGloballyUniqueCard)) {
        // Decisão explícita da usuária: quando o valor for IDÊNTICO (diferença R$ 0,00),
        // ele é classificado como VERDE (conciliado) em vez de cinza.
        // O valor igual resolve a ambiguidade.
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)

        results.push({
          id: `GREEN-${s.sys.id}-${c.card.id}`,
          dataFatura: c.card.data,
          dataOdoo: s.sys.data,
          data: s.sys.data || c.card.data,
          numero: s.sys.numero,
          referencia: s.sys.referencia,
          lancamentoDiario: s.sys.lancamentoDiario,
          parceiro: s.sys.parceiro,
          estabelecimento: c.card.estabelecimento,
          categoria: c.card.categoria || s.sys.categoria || '',
          debito: s.sys.debito,
          credito: s.val,
          valorFatura: c.val,
          diferenca: 0,
          status: 'GREEN',
          origem: 'AMBOS',
          classificacao: 'CONCILIADO',
          motivo:
            'Valor monetário idêntico nas duas fontes (resolvido como conciliado por valor igual)',
          scoreConfianca: 65,
          linhaOdooOrigem: s.sys.linhaOrigem,
          paginaFaturaOrigem: c.card.paginaOrigem,
          isInternacional: c.card.isInternacional,
          observacaoManualFatura: c.card.observacaoManual,
          observacaoManualOdoo: s.sys.observacaoManual,
        })
        continue
      }
    } else if (remSysWithVal.length > 1 && remCardWithVal.length > 0) {
      // Caso B: Mais de um candidato competindo pelo mesmo valor exato
      // Decisão explícita da usuária: "esses que estão em cinzas (Ambíguos) pode colocar como verde pois o valor e o mesmo"
      // Quando um caso classificado como ambíguo/cinza tiver valor IDÊNTICO nas duas fontes (diferença de R$ 0,00),
      // ele deve ser classificado como VERDE (conciliado) em vez de cinza.
      const c = remCardWithVal[0]

      matchedSystemIds.add(s.sys.id)
      matchedCardIds.add(c.card.id)

      results.push({
        id: `GREEN-${s.sys.id}-${c.card.id}`,
        dataFatura: c.card.data,
        dataOdoo: s.sys.data,
        data: s.sys.data || c.card.data,
        numero: s.sys.numero,
        referencia: s.sys.referencia,
        lancamentoDiario: s.sys.lancamentoDiario,
        parceiro: s.sys.parceiro,
        estabelecimento: c.card.estabelecimento,
        categoria: c.card.categoria || s.sys.categoria || '',
        debito: s.sys.debito,
        credito: s.val,
        valorFatura: c.val,
        diferenca: 0,
        status: 'GREEN',
        origem: 'AMBOS',
        classificacao: 'CONCILIADO',
        motivo:
          'Valor monetário idêntico nas duas fontes (resolvido como conciliado por valor igual)',
        scoreConfianca: 60,
        linhaOdooOrigem: s.sys.linhaOrigem,
        paginaFaturaOrigem: c.card.paginaOrigem,
        isInternacional: c.card.isInternacional,
        observacaoManualFatura: c.card.observacaoManual,
        observacaoManualOdoo: s.sys.observacaoManual,
      })
    }
  }

  // 5. FASE 3: Prioridade 3 — Divergência de Valor (AMARELO / DIVERGENTE)
  // Regra fundamental da usuária: "mesmo estabelecimento com valores diferentes,
  // depois de esgotadas as exatas". Requer alta certeza de identidade (nameSim >= 0.55 OU refMatch)
  // para evitar casar estabelecimentos diferentes com valores arbitrários!
  const divergentCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff >= 0.01 &&
        (cand.nameSim >= 0.55 || cand.refMatch) &&
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
    // Padrão estrutural: quando ambas as fontes trazem anotação de "divergente" (ou a similaridade e valores apontam claramente a transação correspondente)
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
      observacaoManualFatura: cand.card.observacaoManual,
      observacaoManualOdoo: cand.sys.observacaoManual,
    })
  }

  // 5b. Se houver anotações manuais explícitas de "divergente" em ambos os lados não capturadas pelo threshold padrão:
  const remSysDiv = normalizedSys.filter(
    (s) =>
      !matchedSystemIds.has(s.sys.id) &&
      s.sys.observacaoManual &&
      /divergente/i.test(s.sys.observacaoManual),
  )
  const remCardDiv = normalizedCard.filter(
    (c) =>
      !matchedCardIds.has(c.card.id) &&
      c.card.observacaoManual &&
      /divergente/i.test(c.card.observacaoManual),
  )

  for (const s of remSysDiv) {
    if (matchedSystemIds.has(s.sys.id)) continue
    for (const c of remCardDiv) {
      if (matchedCardIds.has(c.card.id)) continue
      const nameSim = calculateNameSimilarity(s.sys.parceiro, c.card.estabelecimento)
      if (nameSim >= 0.25) {
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)
        const diffVal = Math.round((c.val - s.val) * 100) / 100
        const difStr = Math.abs(diffVal).toFixed(2).replace('.', ',')

        results.push({
          id: `YELLOW-${s.sys.id}-${c.card.id}`,
          dataFatura: c.card.data,
          dataOdoo: s.sys.data,
          data: s.sys.data || c.card.data,
          numero: s.sys.numero,
          referencia: s.sys.referencia,
          lancamentoDiario: s.sys.lancamentoDiario,
          parceiro: s.sys.parceiro,
          estabelecimento: c.card.estabelecimento,
          categoria: c.card.categoria || s.sys.categoria || '',
          debito: s.sys.debito,
          credito: s.val,
          valorFatura: c.val,
          diferenca: diffVal,
          status: 'YELLOW',
          origem: 'AMBOS',
          classificacao: 'DIVERGENTE',
          motivo: `Estabelecimento correspondente confirmado por conferência manual, valores divergentes (dif. R$ ${difStr})`,
          scoreConfianca: 85,
          linhaOdooOrigem: s.sys.linhaOrigem,
          paginaFaturaOrigem: c.card.paginaOrigem,
          isInternacional: c.card.isInternacional,
          observacaoManualFatura: c.card.observacaoManual,
          observacaoManualOdoo: s.sys.observacaoManual,
        })
        break
      }
    }
  }

  // 6. FASE 4: Ambíguos / Dados Insuficientes (CINZA / POSSIVEL_CORRESPONDENCIA ou VERDE se valor idêntico)
  // Candidatos não conciliados que possuem alguma evidência plausível (nameSim entre 0.4 e 0.55 com valor divergente pequeno)
  // MUDANÇA DE REGRA (decisão explícita da usuária):
  // Quando um caso classificado como ambíguo tiver valor IDÊNTICO nas duas fontes (diferença de R$ 0,00),
  // ele deve ser classificado como VERDE (conciliado) em vez de cinza. Casos com valores diferentes continuam cinza.
  const ambiguousCandidates = candidates
    .filter(
      (cand) =>
        cand.nameSim >= 0.4 &&
        cand.absDiff <= 50.0 &&
        !matchedSystemIds.has(cand.sys.id) &&
        !matchedCardIds.has(cand.card.id),
    )
    .sort((a, b) => b.totalScore - a.totalScore)

  for (const cand of ambiguousCandidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    matchedSystemIds.add(cand.sys.id)
    matchedCardIds.add(cand.card.id)

    const isExact = cand.absDiff < 0.01

    if (isExact) {
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
        motivo: 'Ambíguo resolvido como conciliado por valor monetário idêntico',
        scoreConfianca: cand.totalScore,
        linhaOdooOrigem: cand.sys.linhaOrigem,
        paginaFaturaOrigem: cand.card.paginaOrigem,
        isInternacional: cand.card.isInternacional,
        moedaOriginal: cand.card.moedaGlobal || 'BRL',
        observacaoManualFatura: cand.card.observacaoManual,
        observacaoManualOdoo: cand.sys.observacaoManual,
      })
    } else {
      const difStr = cand.absDiff.toFixed(2).replace('.', ',')
      results.push({
        id: `GRAY-${cand.sys.id}-${cand.card.id}`,
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
        status: 'GRAY',
        origem: 'AMBOS',
        classificacao: 'POSSIVEL_CORRESPONDENCIA',
        motivo: `Correspondência ambígua para revisão manual (dif. R$ ${difStr})`,
        scoreConfianca: cand.totalScore,
        linhaOdooOrigem: cand.sys.linhaOrigem,
        paginaFaturaOrigem: cand.card.paginaOrigem,
        isInternacional: cand.card.isInternacional,
        observacaoManualFatura: cand.card.observacaoManual,
        observacaoManualOdoo: cand.sys.observacaoManual,
      })
    }
  }

  // 7. FASE 5: Prioridade 4 — Lançamentos Exclusivos do Sistema (RED / SOMENTE_SISTEMA)
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
      observacaoManualOdoo: s.sys.observacaoManual,
    })
  }

  // 8. FASE 6: Prioridade 4 — Lançamentos Exclusivos da Fatura (RED / SOMENTE_FATURA)
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
      observacaoManualFatura: c.card.observacaoManual,
    })
  }

  // 9. Ordenação padrão: crescente por valor (com critério de desempate canônico)
  return results.sort((a, b) => {
    const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
    const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
    if (valA !== valB) return valA - valB
    const dateCmp = parseDateTimestamp(a.data) - parseDateTimestamp(b.data)
    if (dateCmp !== 0) return dateCmp
    return (a.id || '').localeCompare(b.id || '')
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
import type { AdherenceReport, AdherenceItem, ManualAnnotationCategory } from './types'

export function normalizeManualAnnotation(annotation?: string): ManualAnnotationCategory {
  if (!annotation) return 'SEM_ANOTACAO'
  const norm = annotation.trim().toLowerCase()
  if (norm.includes('apenas fatura')) return 'APENAS_FATURA'
  if (norm.includes('apenas odoo')) return 'APENAS_ODOO'
  if (norm.includes('divergente')) return 'DIVERGENTE'
  return 'SEM_ANOTACAO'
}

/**
 * Gera o Relatório de Aderência comparando os resultados do motor com a conferência manual da usuária
 */
export function generateAdherenceReport(results: ReconciliationResult[]): AdherenceReport {
  const items: AdherenceItem[] = []
  let countWithAnnotation = 0
  let countConcordantes = 0
  let countDiscordantes = 0
  let countRevisao = 0

  for (const r of results) {
    const rawNoteFat = r.observacaoManualFatura
    const rawNoteOdoo = r.observacaoManualOdoo
    const hasNote = Boolean(rawNoteFat || rawNoteOdoo)
    if (hasNote) {
      countWithAnnotation++
    }

    const catFat = normalizeManualAnnotation(rawNoteFat)
    const catOdoo = normalizeManualAnnotation(rawNoteOdoo)
    let expectedCategory: ManualAnnotationCategory = 'SEM_ANOTACAO'

    if (catFat !== 'SEM_ANOTACAO') {
      expectedCategory = catFat
    } else if (catOdoo !== 'SEM_ANOTACAO') {
      expectedCategory = catOdoo
    }

    let aderente = false
    let tipoAderencia: 'CONCORDA' | 'DISCORDA' | 'REVISAO_SUGERIDA' = 'CONCORDA'
    let detalhe = ''

    if (expectedCategory === 'APENAS_FATURA') {
      if (r.status === 'RED' && r.origem === 'FATURA') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe = 'Algoritmo e conferência concordam: exclusivo da fatura.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Anotado como Apenas Fatura, mas o algoritmo classificou como ${r.status} (${r.classificacao}).`
      }
    } else if (expectedCategory === 'APENAS_ODOO') {
      if (r.status === 'RED' && r.origem === 'SISTEMA') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe = 'Algoritmo e conferência concordam: exclusivo do Odoo.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Anotado como Apenas Odoo, mas o algoritmo classificou como ${r.status} (${r.classificacao}).`
      }
    } else if (expectedCategory === 'DIVERGENTE') {
      if (r.status === 'YELLOW' || r.classificacao === 'DIVERGENTE') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe = 'Algoritmo e conferência concordam: transação com divergência de valor.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Anotado como Divergente, mas o algoritmo classificou como ${r.status} (${r.classificacao}).`
      }
    } else {
      // Sem anotação explícita na linha
      if (r.status === 'GREEN') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe = 'Transação conciliada pelo algoritmo sem anotação contrária.'
      } else if (r.status === 'GRAY') {
        aderente = false
        tipoAderencia = 'REVISAO_SUGERIDA'
        detalhe = 'Caso ambíguo pelo algoritmo sugerido para conferência manual.'
      } else {
        // Registro exclusivo pelo algoritmo que não continha anotação
        aderente = false
        tipoAderencia = 'REVISAO_SUGERIDA'
        detalhe = `Sem anotação na planilha de conferência; classificado como ${r.status} (${r.classificacao}) pelo motor.`
      }
    }

    if (tipoAderencia === 'CONCORDA') {
      countConcordantes++
    } else if (tipoAderencia === 'DISCORDA') {
      countDiscordantes++
    } else {
      countRevisao++
    }

    items.push({
      id: r.id,
      origem: r.origem,
      estabelecimento: r.estabelecimento,
      parceiro: r.parceiro,
      valorFatura: r.valorFatura,
      valorOdoo: r.credito,
      anotacaoFatura: rawNoteFat,
      anotacaoOdoo: rawNoteOdoo,
      classificacaoAlgoritmo: r.classificacao,
      statusAlgoritmo: r.status,
      statusConferencia: expectedCategory,
      aderente,
      tipoAderencia,
      detalhe,
    })
  }

  const taxaAderenciaPercentual =
    results.length > 0 ? Math.round((countConcordantes / results.length) * 1000) / 10 : 0

  return {
    hasAnnotations: countWithAnnotation > 0,
    totalItensComAnotacao: countWithAnnotation,
    totalConcordantes: countConcordantes,
    totalDiscordantes: countDiscordantes,
    totalRevisaoSugerida: countRevisao,
    taxaAderenciaPercentual,
    itens: items,
  }
}

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
  const inReview = results.filter(
    (r) => r.status === 'GRAY' || r.classificacao === 'POSSIVEL_CORRESPONDENCIA',
  )

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
