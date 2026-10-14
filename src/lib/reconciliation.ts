/**
 * Motor Independente de Conciliação Financeira
 * Grupo EPA - Reconstrução do fluxo de correspondência e auditoria
 *
 * Princípios e Regras Fundamentais:
 * 1. Independência Total da Interface:
 *    - Recebe duas listas estruturadas (transações da fatura e lançamentos do Odoo).
 *    - Retorna lista estruturada de resultados sem depender de componentes de tela.
 *    - Invariante à ordem das linhas dos arquivos.
 *
 * 2. 4 Classes Estritas (Sem Ambíguo / Cinza):
 *    - VERDE (CONCILIADO): estabelecimento correspondente e valor exatamente igual.
 *    - AMARELO (DIVERGENTE): estabelecimento correspondente, mas valor diferente (diferença apurada).
 *    - VERMELHO (SOMENTE_SISTEMA): lançamento exclusivo do Odoo.
 *    - VERMELHO (SOMENTE_FATURA): lançamento exclusivo da fatura.
 *    Quando não houver correspondência confiável (estabelecimento comprovado),
 *    os registros permanecem separados e são classificados como exclusivos da respectiva fonte.
 *    Não associar lançamentos apenas porque possuem o mesmo valor ou termos genéricos.
 *
 * 3. Integridade de Cada Transação:
 *    - Cada lançamento mantém seus dados originais juntos durante todo o processamento:
 *      identificador único, data, estabelecimento original, número, referência, valor monetário, origem.
 *    - Diferença = valor da fatura − valor do Odoo.
 *
 * 4. Unicidade Estrita:
 *    - Cada lançamento de cada fonte é usado no máximo UMA vez.
 *    - Múltiplas ocorrências/compras repetidas são tratadas individualmente.
 */

import type {
  SystemRecord,
  CardRecord,
  ReconciliationResult,
  BankType,
  ReconciliationMetrics,
  AdherenceReport,
  AdherenceItem,
  ManualAnnotationCategory,
} from './types'
import {
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
  parseFlexibleDate,
  getPlatformFamily,
  PlatformFamily,
  extractSignificantTokens,
} from './normalization'
import {
  cloneAndFreezeArray,
  computeStrictDifference,
  roundToCents,
  toIntegerCents,
} from './immutability'

/**
 * Extrai o valor monetário do registro do Odoo com precisão de centavos
 */
export function getSystemValue(sys: SystemRecord, bank: BankType = 'itau'): number {
  if (bank === 'itau') {
    const val = sys.total !== null && sys.total !== undefined ? sys.total : sys.credito
    return roundToCents(normalizeMoneyValue(val))
  }
  const val = sys.credito !== null && sys.credito !== undefined ? sys.credito : sys.total
  return roundToCents(normalizeMoneyValue(val))
}

/**
 * Extrai o valor monetário da fatura (preserva estorno como negativo) com precisão de centavos
 */
export function getCardValue(card: CardRecord): number {
  return roundToCents(normalizeMoneyValue(card.valor))
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
  const diffVal = computeStrictDifference(cardVal, sysVal)
  const cardCents = toIntegerCents(cardVal)
  const sysCents = toIntegerCents(sysVal)
  const absDiffCents = Math.abs(cardCents - sysCents)
  const isExactVal = absDiffCents === 0
  const absDiff = Math.abs(diffVal)

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
    score += Math.max(10, 25 - absDiff * 10)
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
 * 2) Nomes abreviados/semelhantes + Valor exato com evidência confiável (GREEN)
 * 3) Mesmo estabelecimento com valores diferentes (YELLOW), após esgotar exatas
 * 4) Sem correspondência comprovada → Exclusivo de cada fonte (RED / SOMENTE_SISTEMA ou SOMENTE_FATURA)
 * Sem status cinza/ambíguo. Invariância à ordem via ordenação canônica preliminar.
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
  // Trabalha com referências aos objetos originais (read-only), sem qualquer mutação de campos
  const normalizedSys = systemRecords
    .map((sys) => ({
      sys,
      val: getSystemValue(sys, bank),
      manualCat: normalizeManualAnnotation(sys.observacaoManual),
    }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      const nameCmp = (a.sys.parceiro || '').localeCompare(b.sys.parceiro || '', 'pt-BR')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.sys.data || '').localeCompare(b.sys.data || '', 'pt-BR')
      if (dateCmp !== 0) return dateCmp
      return (a.sys.id || '').localeCompare(b.sys.id || '')
    })

  const normalizedCard = cardRecords
    .map((card) => ({
      card,
      val: getCardValue(card),
      manualCat: normalizeManualAnnotation(card.observacaoManual),
    }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      const nameCmp = (a.card.estabelecimento || '').localeCompare(
        b.card.estabelecimento || '',
        'pt-BR',
      )
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.card.data || '').localeCompare(b.card.data || '', 'pt-BR')
      if (dateCmp !== 0) return dateCmp
      return (a.card.id || '').localeCompare(b.card.id || '')
    })

  // 2. PRÉ-PROCESSAMENTO OBRIGATÓRIO (PADRÃO 5):
  // Registros com anotação manual "Apenas Fatura" ou "Apenas odoo" NUNCA entram no pool
  // de candidatos a pareamento! São pré-marcados como exclusivos da sua respectiva fonte.
  for (const s of normalizedSys) {
    if (s.manualCat === 'APENAS_ODOO') {
      matchedSystemIds.add(s.sys.id)
      results.push({
        id: `RED-SYS-${s.sys.id}`,
        systemRecordId: s.sys.id,
        dataOdoo: s.sys.data,
        data: s.sys.data,
        numero: s.sys.numero,
        referencia: s.sys.referencia,
        lancamentoDiario: s.sys.lancamentoDiario,
        parceiro: s.sys.parceiro,
        estabelecimento: '-',
        categoria: s.sys.categoria || '',
        debito: s.sys.debito,
        credito: s.sys.credito ?? s.val,
        valorFatura: null,
        diferenca: null,
        status: 'RED',
        origem: 'SISTEMA',
        classificacao: 'SOMENTE_SISTEMA',
        motivo: 'Exclusivo do Odoo (conferência manual: Apenas Odoo)',
        scoreConfianca: 100,
        linhaOdooOrigem: s.sys.linhaOrigem,
        observacaoManualOdoo: s.sys.observacaoManual,
      })
    }
  }

  for (const c of normalizedCard) {
    if (c.manualCat === 'APENAS_FATURA') {
      matchedCardIds.add(c.card.id)
      results.push({
        id: `RED-CARD-${c.card.id}`,
        cardRecordId: c.card.id,
        dataFatura: c.card.data,
        data: c.card.data,
        parceiro: '-',
        estabelecimento: c.card.estabelecimento,
        categoria: c.card.categoria || (c.card.isInternacional ? 'Internacional' : ''),
        debito: null,
        credito: null,
        valorFatura: c.card.valor,
        diferenca: null,
        status: 'RED',
        origem: 'FATURA',
        classificacao: 'SOMENTE_FATURA',
        motivo: 'Exclusivo da fatura (conferência manual: Apenas Fatura)',
        scoreConfianca: 100,
        paginaFaturaOrigem: c.card.paginaOrigem,
        isInternacional: c.card.isInternacional,
        moedaOriginal: c.card.moedaGlobal || 'BRL',
        observacaoManualFatura: c.card.observacaoManual,
      })
    }
  }

  // 3. Pool elegível para correspondência (somente quem não foi pré-marcado como exclusivo)
  const eligibleSys = normalizedSys.filter((s) => !matchedSystemIds.has(s.sys.id))
  const eligibleCard = normalizedCard.filter((c) => !matchedCardIds.has(c.card.id))

  // 4. Geração global de todos os pares candidatos elegíveis
  const candidates: MatchCandidate[] = []
  for (const s of eligibleSys) {
    for (const c of eligibleCard) {
      candidates.push(evaluateCandidate(s.sys, c.card, s.val, c.val))
    }
  }

  // Helper para verificar se um nome pertence à família de marketplace
  const isMarketplaceFamily = (name: string) =>
    /mercado\s*livre|mercadolivre|mercado\*|mp\s*\*|meli/i.test(name)

  // 5. FASE 1: Prioridade 1 — Alta Confiabilidade: Valor Exato + Alta Similaridade de Estabelecimento (nameSim >= 0.45)
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
      systemRecordId: cand.sys.id,
      cardRecordId: cand.card.id,
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
      credito: cand.sys.credito ?? cand.sysVal,
      valorFatura: cand.card.valor ?? cand.cardVal,
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

  // 6. FASE 2: Prioridade 2 — Nomes Abreviados / Semelhantes + Valor Exato
  // Requer valor rigorosamente exato E evidência confiável de correspondência de estabelecimento:
  // (nameSim >= 0.32 OU refMatch confirmado)
  // Tolerância de data: até 35 dias para acomodar competência adjacente do Odoo (ex: compras 12/06–23/06 lançadas em 01/07)
  const abreviatedCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff < 0.01 &&
        (cand.nameSim >= 0.32 || cand.refMatch) &&
        (cand.dateDiffDays === null || cand.dateDiffDays <= 35) &&
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
      systemRecordId: cand.sys.id,
      cardRecordId: cand.card.id,
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
      credito: cand.sys.credito ?? cand.sysVal,
      valorFatura: cand.card.valor ?? cand.cardVal,
      diferenca: 0,
      status: 'GREEN',
      origem: 'AMBOS',
      classificacao: 'CONCILIADO',
      motivo: cand.refMatch
        ? 'Estabelecimento conciliado por referência documental e valor exato'
        : 'Estabelecimento abreviado e valor conciliados',
      scoreConfianca: cand.totalScore,
      linhaOdooOrigem: cand.sys.linhaOrigem,
      paginaFaturaOrigem: cand.card.paginaOrigem,
      isInternacional: cand.card.isInternacional,
      moedaOriginal: cand.card.moedaGlobal || 'BRL',
      observacaoManualFatura: cand.card.observacaoManual,
      observacaoManualOdoo: cand.sys.observacaoManual,
    })
  }

  // 7. FASE 2b: Pareamento por Família de Plataforma (Mercado Livre, Starlink, Uber, OpenAI, Vindi)
  // Regra geral solicitada:
  // - Mesma família de plataforma
  // - Valor EXATO em centavos (toIntegerCents idêntico, diff = 0)
  // - Janela de datas: até 35 dias para acomodar competência contábil adjacente do Odoo
  //   (ex: compras de 12/06–23/06 lançadas no Odoo em 01/07/2026).
  // - Quando houver candidato ÚNICO na mesma família de plataforma com valor exato em centavos,
  //   datas até ~35 dias de diferença NÃO bloqueiam.
  // - Casar quando plataforma + valor + data compatível tiver candidato único (ex: MERCADOLIVRE*TGFIMPOR
  //   vs MERCADO LIVRE - Z4 COMERCIO DE SUPRIMENTOS PARA R$ 20,99).
  // - REGRESSÃO OBRIGATÓRIA: plataformas DIFERENTES (ex: Vindi*LojaNetlab vs Shopclic ou Mercado Livre)
  //   JAMAIS casam (permanecem SOMENTE_FATURA / SOMENTE_ODOO).
  const remainingSysPlatform = eligibleSys.filter((s) => !matchedSystemIds.has(s.sys.id))
  const remainingCardPlatform = eligibleCard.filter((c) => !matchedCardIds.has(c.card.id))

  // Agrupa os não casados por família conhecida
  const supportedFamilies: PlatformFamily[] = [
    'mercadolivre',
    'starlink',
    'uber',
    'openai',
    'vindi',
  ]

  for (const fam of supportedFamilies) {
    const sysInFam = remainingSysPlatform.filter(
      (s) => !matchedSystemIds.has(s.sys.id) && getPlatformFamily(s.sys.parceiro) === fam,
    )
    const cardInFam = remainingCardPlatform.filter(
      (c) => !matchedCardIds.has(c.card.id) && getPlatformFamily(c.card.estabelecimento) === fam,
    )

    if (sysInFam.length === 0 || cardInFam.length === 0) continue

    // Candidatos dentro da mesma família com valor exato (centavos) e data compatível (<= 35 dias)
    interface PlatformMatchCandidate {
      s: (typeof sysInFam)[0]
      c: (typeof cardInFam)[0]
      valCents: number
      dateDiff: number
      tokenMatch: boolean
      nameSim: number
      priorityScore: number
    }

    const platformPairs: PlatformMatchCandidate[] = []

    for (const s of sysInFam) {
      if (matchedSystemIds.has(s.sys.id)) continue
      const sCents = toIntegerCents(s.val)

      for (const c of cardInFam) {
        if (matchedCardIds.has(c.card.id)) continue
        const cCents = toIntegerCents(c.val)
        if (sCents !== cCents) continue

        const dDiff = calculateDateDifferenceInDays(s.sys.data, c.card.data) ?? 999
        // Janela de compatibilidade de competência contábil adjacente: até 35 dias
        if (dDiff > 35) continue

        const nameSim = calculateNameSimilarity(s.sys.parceiro, c.card.estabelecimento)
        const tokensS = extractSignificantTokens(s.sys.parceiro)
        const tokensC = extractSignificantTokens(c.card.estabelecimento)
        const tokenMatch = tokensS.some((ts) => tokensC.includes(ts) && ts.length >= 4)

        // Pontuação de evidência
        let priorityScore = 100 - Math.min(35, dDiff)
        if (tokenMatch) priorityScore += 40
        if (nameSim > 0.3) priorityScore += 20

        platformPairs.push({
          s,
          c,
          valCents: sCents,
          dateDiff: dDiff,
          tokenMatch,
          nameSim,
          priorityScore,
        })
      }
    }

    // Ordena pares por prioridade de evidência
    platformPairs.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore
      if (a.dateDiff !== b.dateDiff) return a.dateDiff - b.dateDiff
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      return (a.s.sys.id || '').localeCompare(b.s.sys.id || '')
    })

    // Processa os pares garantindo decisão inequívoca:
    // Se para um 's' ou 'c' houver múltiplos candidatos com mesma pontuação/data sem critério de desempate,
    // não força e deixa exclusivo (ambiguidade protegida).
    for (const pair of platformPairs) {
      if (matchedSystemIds.has(pair.s.sys.id) || matchedCardIds.has(pair.c.card.id)) {
        continue
      }

      // Verifica concorrentes para o mesmo 's' e mesmo 'c'
      const competingForS = platformPairs.filter(
        (p) =>
          p.s.sys.id === pair.s.sys.id &&
          !matchedCardIds.has(p.c.card.id) &&
          p.c.card.id !== pair.c.card.id,
      )
      const competingForC = platformPairs.filter(
        (p) =>
          p.c.card.id === pair.c.card.id &&
          !matchedSystemIds.has(p.s.sys.id) &&
          p.s.sys.id !== pair.s.sys.id,
      )

      // Se há concorrente de mesmo valor e mesma data exata sem desempate claro por token, ambiguidade -> não casa
      const ambiguousS = competingForS.some(
        (p) => p.dateDiff === pair.dateDiff && p.tokenMatch === pair.tokenMatch,
      )
      const ambiguousC = competingForC.some(
        (p) => p.dateDiff === pair.dateDiff && p.tokenMatch === pair.tokenMatch,
      )

      if (ambiguousS || ambiguousC) {
        // Ambiguidade estrita protegida: não inventar associação
        continue
      }

      matchedSystemIds.add(pair.s.sys.id)
      matchedCardIds.add(pair.c.card.id)

      results.push({
        id: `GREEN-${pair.s.sys.id}-${pair.c.card.id}`,
        systemRecordId: pair.s.sys.id,
        cardRecordId: pair.c.card.id,
        dataFatura: pair.c.card.data,
        dataOdoo: pair.s.sys.data,
        data: pair.s.sys.data || pair.c.card.data,
        numero: pair.s.sys.numero,
        referencia: pair.s.sys.referencia,
        lancamentoDiario: pair.s.sys.lancamentoDiario,
        parceiro: pair.s.sys.parceiro,
        estabelecimento: pair.c.card.estabelecimento,
        categoria: pair.c.card.categoria || pair.s.sys.categoria || '',
        debito: pair.s.sys.debito,
        credito: pair.s.sys.credito ?? pair.s.val,
        valorFatura: pair.c.card.valor ?? pair.c.val,
        diferenca: 0,
        status: 'GREEN',
        origem: 'AMBOS',
        classificacao: 'CONCILIADO',
        motivo: pair.tokenMatch
          ? 'Plataforma e vendedor identificados com valor exato'
          : 'Plataforma coincidente com valor rigorosamente exato e candidato único',
        scoreConfianca: Math.min(95, Math.max(70, pair.priorityScore)),
        linhaOdooOrigem: pair.s.sys.linhaOrigem,
        paginaFaturaOrigem: pair.c.card.paginaOrigem,
        isInternacional: pair.c.card.isInternacional,
        moedaOriginal: pair.c.card.moedaGlobal || 'BRL',
        observacaoManualFatura: pair.c.card.observacaoManual,
        observacaoManualOdoo: pair.s.sys.observacaoManual,
      })
    }
  }

  // 7b. Fallback por valor estritamente único geral (para transações fora de famílias conhecidas)
  // Janela até 35 dias para acomodar competência contábil adjacente do Odoo
  // (ex: SWIFT PIRACUAMA R$ 1.954,12 em 23/06 vs 01/07, SJX ATACADISTA R$ 1.114,06 em 23/06 vs 01/07)
  const remainingSysExact = eligibleSys.filter((s) => !matchedSystemIds.has(s.sys.id))
  const remainingCardExact = eligibleCard.filter((c) => !matchedCardIds.has(c.card.id))

  for (const s of remainingSysExact) {
    if (matchedSystemIds.has(s.sys.id)) continue

    const sCents = toIntegerCents(s.val)
    const sysSameValCount = eligibleSys.filter(
      (other) => toIntegerCents(other.val) === sCents,
    ).length
    const cardSameValCandidates = remainingCardExact.filter(
      (c) => !matchedCardIds.has(c.card.id) && toIntegerCents(c.val) === sCents,
    )
    const cardAllSameValCount = eligibleCard.filter(
      (other) => toIntegerCents(other.val) === sCents,
    ).length

    // Apenas se for estritamente único em ambas as fontes e houver afinidade de nome (> 0)
    // e diferença temporal não superior a 35 dias
    if (cardSameValCandidates.length === 1 && sysSameValCount === 1 && cardAllSameValCount === 1) {
      const c = cardSameValCandidates[0]
      const dDiff = calculateDateDifferenceInDays(s.sys.data, c.card.data) ?? 999
      if (dDiff > 35) continue

      const nameSim = calculateNameSimilarity(s.sys.parceiro, c.card.estabelecimento)

      if (nameSim >= 0.2) {
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)

        results.push({
          id: `GREEN-${s.sys.id}-${c.card.id}`,
          systemRecordId: s.sys.id,
          cardRecordId: c.card.id,
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
          credito: s.sys.credito ?? s.val,
          valorFatura: c.card.valor ?? c.val,
          diferenca: 0,
          status: 'GREEN',
          origem: 'AMBOS',
          classificacao: 'CONCILIADO',
          motivo: 'Valor rigorosamente único nas duas fontes e afinidade textual confirmada',
          scoreConfianca: 70,
          linhaOdooOrigem: s.sys.linhaOrigem,
          paginaFaturaOrigem: c.card.paginaOrigem,
          isInternacional: c.card.isInternacional,
          moedaOriginal: c.card.moedaGlobal || 'BRL',
          observacaoManualFatura: c.card.observacaoManual,
          observacaoManualOdoo: s.sys.observacaoManual,
        })
      }
    }
  }

  // 8. FASE 3: Prioridade 3 — Divergência de Valor (AMARELO / DIVERGENTE)
  // Regra fundamental: mesmo fornecedor (evidência textual forte de ambos os lados,
  // FORA da família de marketplace) com valores DIFERENTES, APÓS esgotadas as exatas.
  // A conferência manual pode marcar "divergente" explicitamente.
  // Diferença calculada estritamente: valorFatura - valorOdoo.
  // Exemplo oficial de referência: Fatura DONA COMERCI*Edona R$ 367,91 (19/06) vs
  // Odoo E.DONA COMERCIO ELETRONICO R$ 339,51 (CIT12/2026/0618) -> diferença +R$ 28,40 (YELLOW).
  // Nota: registros pré-marcados como "Apenas Odoo" (como CIT12/2026/0619 de R$ 28,40)
  // foram isolados na etapa de pré-processamento e não concorrem aqui.
  const divergentCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff >= 0.01 &&
        !isMarketplaceFamily(cand.sys.parceiro) &&
        !isMarketplaceFamily(cand.card.estabelecimento) &&
        (cand.nameSim >= 0.4 ||
          cand.refMatch ||
          (cand.sys.observacaoManual?.toLowerCase().includes('divergente') &&
            cand.card.observacaoManual?.toLowerCase().includes('divergente'))) &&
        !matchedSystemIds.has(cand.sys.id) &&
        !matchedCardIds.has(cand.card.id),
    )
    .sort((a, b) => {
      // Prioriza pares expressamente anotados como divergente na conferência
      const aIsAnnotated =
        a.sys.observacaoManual?.toLowerCase().includes('divergente') ||
        a.card.observacaoManual?.toLowerCase().includes('divergente')
          ? 1
          : 0
      const bIsAnnotated =
        b.sys.observacaoManual?.toLowerCase().includes('divergente') ||
        b.card.observacaoManual?.toLowerCase().includes('divergente')
          ? 1
          : 0
      if (bIsAnnotated !== aIsAnnotated) return bIsAnnotated - aIsAnnotated
      if (b.nameSim !== a.nameSim) return b.nameSim - a.nameSim
      return a.absDiff - b.absDiff
    })

  for (const cand of divergentCandidates) {
    if (matchedSystemIds.has(cand.sys.id) || matchedCardIds.has(cand.card.id)) {
      continue
    }

    matchedSystemIds.add(cand.sys.id)
    matchedCardIds.add(cand.card.id)

    const difStr = Math.abs(cand.diffVal).toFixed(2).replace('.', ',')
    results.push({
      id: `YELLOW-${cand.sys.id}-${cand.card.id}`,
      systemRecordId: cand.sys.id,
      cardRecordId: cand.card.id,
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
      credito: cand.sys.credito ?? cand.sysVal,
      valorFatura: cand.card.valor ?? cand.cardVal,
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

  // 8b. Casos com anotação explícita de "divergente" na conferência manual de ambos os lados
  const remSysDiv = normalizedSys.filter(
    (s) => !matchedSystemIds.has(s.sys.id) && s.manualCat === 'DIVERGENTE',
  )
  const remCardDiv = normalizedCard.filter(
    (c) => !matchedCardIds.has(c.card.id) && c.manualCat === 'DIVERGENTE',
  )

  for (const s of remSysDiv) {
    if (matchedSystemIds.has(s.sys.id)) continue
    for (const c of remCardDiv) {
      if (matchedCardIds.has(c.card.id)) continue
      const nameSim = calculateNameSimilarity(s.sys.parceiro, c.card.estabelecimento)
      if (nameSim >= 0.2) {
        matchedSystemIds.add(s.sys.id)
        matchedCardIds.add(c.card.id)
        const diffVal = computeStrictDifference(c.val, s.val)
        const difStr = Math.abs(diffVal).toFixed(2).replace('.', ',')

        results.push({
          id: `YELLOW-${s.sys.id}-${c.card.id}`,
          systemRecordId: s.sys.id,
          cardRecordId: c.card.id,
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
          credito: s.sys.credito ?? s.val,
          valorFatura: c.card.valor ?? c.val,
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
  // 6. FASE 4: Registros sem correspondência comprovada → Exclusivos da respectiva fonte (VERMELHO)
  // Regra do usuário: "Quando o algoritmo não conseguir estabelecer uma correspondência confiável,
  // deverá manter os registros separados e classificá-los como exclusivos da respectiva fonte,
  // sem inventar associações. Não utilizar o status 'Ambíguo', 'Cinza' ou qualquer categoria equivalente."
  // Relação bijetora estrita: nenhum ID de fatura ou Odoo pode aparecer em mais de um resultado,
  // e nenhuma transação que já tenha entrado em GREEN/YELLOW ou pré-marcada pode entrar na Fase 4.

  // 6a. Exclusivos do Sistema (RED / SOMENTE_SISTEMA)
  for (const s of normalizedSys) {
    if (matchedSystemIds.has(s.sys.id)) continue
    matchedSystemIds.add(s.sys.id)

    // Analisa motivo detalhado para fins de auditoria
    const sCents = toIntegerCents(s.val)
    const cardSameVal = eligibleCard.filter((c) => toIntegerCents(c.val) === sCents)
    let motivoDetalhado = 'Existe no Odoo sem correspondência comprovada na fatura'
    if (cardSameVal.length === 0) {
      motivoDetalhado = 'Sem candidato de mesmo valor na fatura'
    } else if (cardSameVal.length > 1) {
      motivoDetalhado = `Múltiplos candidatos de mesmo valor na fatura (${cardSameVal.length} ocorrências) - ambiguidade protegida`
    } else {
      motivoDetalhado = `Candidato de mesmo valor na fatura (${cardSameVal[0].card.estabelecimento}) sem relação comprovada de fornecedor`
    }

    results.push({
      id: `RED-SYS-${s.sys.id}`,
      systemRecordId: s.sys.id,
      dataOdoo: s.sys.data,
      data: s.sys.data,
      numero: s.sys.numero,
      referencia: s.sys.referencia,
      lancamentoDiario: s.sys.lancamentoDiario,
      parceiro: s.sys.parceiro,
      estabelecimento: '-',
      categoria: s.sys.categoria || '',
      debito: s.sys.debito,
      credito: s.sys.credito ?? s.val,
      valorFatura: null,
      diferenca: null,
      status: 'RED',
      origem: 'SISTEMA',
      classificacao: 'SOMENTE_SISTEMA',
      motivo: motivoDetalhado,
      scoreConfianca: 0,
      linhaOdooOrigem: s.sys.linhaOrigem,
      observacaoManualOdoo: s.sys.observacaoManual,
    })
  }

  // 6b. Exclusivos da Fatura (RED / SOMENTE_FATURA)
  for (const c of normalizedCard) {
    if (matchedCardIds.has(c.card.id)) continue
    matchedCardIds.add(c.card.id)

    // Analisa motivo detalhado para fins de auditoria
    const cCents = toIntegerCents(c.val)
    const sysSameVal = eligibleSys.filter((s) => toIntegerCents(s.val) === cCents)
    let motivoDetalhado = 'Existe na fatura sem correspondência no lançamento contábil do Odoo'
    if (sysSameVal.length === 0) {
      motivoDetalhado = 'Sem candidato de mesmo valor no Odoo'
    } else if (sysSameVal.length > 1) {
      motivoDetalhado = `Múltiplos candidatos de mesmo valor no Odoo (${sysSameVal.length} ocorrências) - ambiguidade protegida`
    } else {
      motivoDetalhado = `Candidato de mesmo valor no Odoo (${sysSameVal[0].sys.parceiro}) sem relação comprovada de fornecedor`
    }

    results.push({
      id: `RED-CARD-${c.card.id}`,
      cardRecordId: c.card.id,
      dataFatura: c.card.data,
      data: c.card.data,
      parceiro: '-',
      estabelecimento: c.card.estabelecimento,
      categoria: c.card.categoria || (c.card.isInternacional ? 'Internacional' : ''),
      debito: null,
      credito: null,
      valorFatura: c.card.valor ?? c.val,
      diferenca: null,
      status: 'RED',
      origem: 'FATURA',
      classificacao: 'SOMENTE_FATURA',
      motivo: motivoDetalhado,
      scoreConfianca: 0,
      paginaFaturaOrigem: c.card.paginaOrigem,
      isInternacional: c.card.isInternacional,
      moedaOriginal: c.card.moedaGlobal || 'BRL',
      observacaoManualFatura: c.card.observacaoManual,
    })
  }

  // 7. Ordenação padrão canônica: crescente por valor (com critério de desempate canônico)
  // Retorna com congelamento profundo para proteção total contra mutações posteriores
  results.sort((a, b) => {
    const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
    const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
    if (valA !== valB) return valA - valB
    const dateCmp = parseDateTimestamp(a.data) - parseDateTimestamp(b.data)
    if (dateCmp !== 0) return dateCmp
    return (a.id || '').localeCompare(b.id || '')
  })

  return cloneAndFreezeArray(results) as ReconciliationResult[]
}

export function normalizeManualAnnotation(annotation?: string): ManualAnnotationCategory {
  if (!annotation) return 'SEM_ANOTACAO'
  const norm = annotation
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (norm.includes('apenas fatura')) return 'APENAS_FATURA'
  if (norm.includes('apenas odoo')) return 'APENAS_ODOO'
  if (norm.includes('divergente')) return 'DIVERGENTE'
  return 'SEM_ANOTACAO'
}

/**
 * Gera o Relatório de Aderência comparando os resultados do motor com a conferência manual da usuária
 * Adaptado para as 4 classes estritas:
 * Itens com anotação de exclusivo ou divergente são avaliados diretamente contra os resultados.
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
        detalhe =
          'Esperado: SOMENTE_FATURA (Apenas Fatura) | Obtido: RED (SOMENTE_FATURA) — Total concordância.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Esperado: SOMENTE_FATURA (Apenas Fatura) | Obtido: ${r.status} (${r.classificacao}) — Divergência com a conferência manual.`
      }
    } else if (expectedCategory === 'APENAS_ODOO') {
      if (r.status === 'RED' && r.origem === 'SISTEMA') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe =
          'Esperado: SOMENTE_SISTEMA (Apenas Odoo) | Obtido: RED (SOMENTE_SISTEMA) — Total concordância.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Esperado: SOMENTE_SISTEMA (Apenas Odoo) | Obtido: ${r.status} (${r.classificacao}) — Divergência com a conferência manual.`
      }
    } else if (expectedCategory === 'DIVERGENTE') {
      if (r.status === 'YELLOW' || r.classificacao === 'DIVERGENTE') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe =
          'Esperado: DIVERGENTE (Divergente) | Obtido: YELLOW (DIVERGENTE) — Total concordância.'
      } else {
        aderente = false
        tipoAderencia = 'DISCORDA'
        detalhe = `Esperado: DIVERGENTE (Divergente) | Obtido: ${r.status} (${r.classificacao}) — Divergência com a conferência manual.`
      }
    } else {
      // Sem anotação explícita na linha
      if (r.status === 'GREEN') {
        aderente = true
        tipoAderencia = 'CONCORDA'
        detalhe =
          'Esperado: CONCILIADO | Obtido: GREEN (CONCILIADO) — Transação conciliada automaticamente.'
      } else {
        // Registro exclusivo pelo algoritmo que não continha anotação
        aderente = false
        tipoAderencia = 'REVISAO_SUGERIDA'
        detalhe = `Sem anotação na conferência | Obtido: ${r.status} (${r.classificacao}) — Revisão manual recomendada.`
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

/**
 * Calculador Oficial de Indicadores da Conciliação
 * Recalcula com base estrita nas 4 classes e nos valores de cada transação.
 */
export function calculateReconciliationMetrics(
  results: ReconciliationResult[],
  systemSource?: SystemRecord[] | number,
  cardSource?: CardRecord[] | number,
  bank: BankType = 'itau',
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

  // Determinação rigorosa da contagem e valores das fontes originais
  const isSystemArray = Array.isArray(systemSource)
  const isCardArray = Array.isArray(cardSource)

  const totalRegistrosSistema: number = isSystemArray
    ? (systemSource as SystemRecord[]).length
    : typeof systemSource === 'number'
      ? systemSource
      : results.filter((r) => r.origem === 'SISTEMA' || r.origem === 'AMBOS').length

  const totalRegistrosFatura: number = isCardArray
    ? (cardSource as CardRecord[]).length
    : typeof cardSource === 'number'
      ? cardSource
      : results.filter((r) => r.origem === 'FATURA' || r.origem === 'AMBOS').length

  // Totais separados e estritos calculados em centavos inteiros para precisão absoluta:
  // Se os arrays originais foram fornecidos, calcula EXCLUSIVAMENTE sobre os registros originais
  // de cada fonte, preservando sinais, estornos e centavos inteiros.
  let totalValorSistema: number
  if (isSystemArray) {
    const sumCents = (systemSource as SystemRecord[]).reduce((sum, s) => {
      const val = getSystemValue(s, bank)
      return sum + toIntegerCents(val)
    }, 0)
    totalValorSistema = roundToCents(sumCents / 100)
  } else {
    const totalValorSistemaCents = results.reduce(
      (sum, r) =>
        sum + (r.credito !== null && r.credito !== undefined ? toIntegerCents(r.credito) : 0),
      0,
    )
    totalValorSistema = roundToCents(totalValorSistemaCents / 100)
  }

  let totalValorFatura: number
  if (isCardArray) {
    const sumCents = (cardSource as CardRecord[]).reduce((sum, c) => {
      const val = getCardValue(c)
      return sum + toIntegerCents(val)
    }, 0)
    totalValorFatura = roundToCents(sumCents / 100)
  } else {
    const totalValorFaturaCents = results.reduce(
      (sum, r) =>
        sum +
        (r.valorFatura !== null && r.valorFatura !== undefined ? toIntegerCents(r.valorFatura) : 0),
      0,
    )
    totalValorFatura = roundToCents(totalValorFaturaCents / 100)
  }

  // Total conciliado em CADA fonte
  const totalValorConciliadoSistemaCents = conciliated.reduce(
    (sum, r) =>
      sum + (r.credito !== null && r.credito !== undefined ? toIntegerCents(r.credito) : 0),
    0,
  )
  const totalValorConciliadoSistema = roundToCents(totalValorConciliadoSistemaCents / 100)

  const totalValorConciliadoFaturaCents = conciliated.reduce(
    (sum, r) =>
      sum +
      (r.valorFatura !== null && r.valorFatura !== undefined ? toIntegerCents(r.valorFatura) : 0),
    0,
  )
  const totalValorConciliadoFatura = roundToCents(totalValorConciliadoFaturaCents / 100)

  const totalValorExclusivoSistemaCents = onlySys.reduce(
    (sum, r) =>
      sum + (r.credito !== null && r.credito !== undefined ? toIntegerCents(r.credito) : 0),
    0,
  )
  const totalValorExclusivoSistema = roundToCents(totalValorExclusivoSistemaCents / 100)

  const totalValorExclusivoFaturaCents = onlyFat.reduce(
    (sum, r) =>
      sum +
      (r.valorFatura !== null && r.valorFatura !== undefined ? toIntegerCents(r.valorFatura) : 0),
    0,
  )
  const totalValorExclusivoFatura = roundToCents(totalValorExclusivoFaturaCents / 100)

  const totalDiferencaDivergentesCents = divergent.reduce(
    (sum, r) =>
      sum +
      (r.diferenca !== null && r.diferenca !== undefined
        ? Math.abs(toIntegerCents(r.diferenca))
        : 0),
    0,
  )
  const totalDiferencaDivergentes = roundToCents(totalDiferencaDivergentesCents / 100)

  const totalValorDivergentesFaturaCents = divergent.reduce(
    (sum, r) =>
      sum +
      (r.valorFatura !== null && r.valorFatura !== undefined ? toIntegerCents(r.valorFatura) : 0),
    0,
  )
  const totalValorDivergentesFatura = roundToCents(totalValorDivergentesFaturaCents / 100)

  const totalValorDivergentesSistemaCents = divergent.reduce(
    (sum, r) =>
      sum + (r.credito !== null && r.credito !== undefined ? toIntegerCents(r.credito) : 0),
    0,
  )
  const totalValorDivergentesSistema = roundToCents(totalValorDivergentesSistemaCents / 100)

  const diferencaTotal = computeStrictDifference(totalValorFatura, totalValorSistema)

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
    casosEmRevisao: 0,
    registrosDescartados: 0,
    justificativaDescartes:
      'Nenhum registro foi descartado: todos os registros importados permanecem integralmente preservados.',
    totalValorSistema,
    totalValorFatura,
    totalValorConciliadoSistema,
    totalValorConciliadoFatura,
    totalValorExclusivoSistema,
    totalValorExclusivoFatura,
    totalDiferencaDivergentes,
    totalValorDivergentesFatura,
    totalValorDivergentesSistema,
    diferencaTotal,
    percentualConciliacao,
  }
}
