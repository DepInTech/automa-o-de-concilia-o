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
  const normalizedSys = systemRecords
    .map((sys) => ({
      sys,
      val: getSystemValue(sys, bank),
      manualCat: normalizeManualAnnotation(sys.observacaoManual),
    }))
    .sort((a, b) => {
      if (a.val !== b.val) return a.val - b.val
      const nameCmp = (a.sys.parceiro || '').localeCompare(b.sys.parceiro || '')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.sys.data || '').localeCompare(b.sys.data || '')
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
      const nameCmp = (a.card.estabelecimento || '').localeCompare(b.card.estabelecimento || '')
      if (nameCmp !== 0) return nameCmp
      const dateCmp = (a.card.data || '').localeCompare(b.card.data || '')
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

  // 6. FASE 2: Prioridade 2 — Nomes Abreviados / Semelhantes + Valor Exato
  // Requer valor rigorosamente exato E evidência confiável de correspondência de estabelecimento:
  // (nameSim >= 0.32 OU refMatch confirmado)
  // PADRÃO 1 e 3: pareamento par a par usando token distintivo do vendedor
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

  // 7. FASE 2b: Fallback por valor estritamente único (PADRÃO 2 e 3)
  // Lançamentos onde não há vendedor identificável OU afinidade de nome baixa,
  // SÓ PODEM casar via fallback por valor se o valor for estritamente único em AMBAS as fontes
  // E NÃO existir NENHUM outro candidato concorrente (mesmo valor ou valor próximo dentro de R$ 0,50)
  // na mesma família de plataforma em qualquer uma das fontes.
  // Casos genéricos repetidos ou com concorrentes NUNCA casam entre si.
  const remainingSysExact = eligibleSys.filter((s) => !matchedSystemIds.has(s.sys.id))
  const remainingCardExact = eligibleCard.filter((c) => !matchedCardIds.has(c.card.id))

  for (const s of remainingSysExact) {
    if (matchedSystemIds.has(s.sys.id)) continue

    // Conta quantos registros no Odoo têm esse exato valor (ou próximo dentro de R$ 0,50)
    const sysSameValCount = eligibleSys.filter((other) => Math.abs(other.val - s.val) < 0.01).length
    const sysNearValCount = eligibleSys.filter((other) => Math.abs(other.val - s.val) <= 0.5).length

    // Candidatos na fatura com mesmo valor
    const cardSameValCandidates = remainingCardExact.filter(
      (c) => !matchedCardIds.has(c.card.id) && Math.abs(c.val - s.val) < 0.01,
    )
    const cardAllSameValCount = eligibleCard.filter(
      (other) => Math.abs(other.val - s.val) < 0.01,
    ).length
    const cardNearValCount = eligibleCard.filter(
      (other) => Math.abs(other.val - s.val) <= 0.5,
    ).length

    // Condição de unicidade estrita absoluta:
    // Exatamente 1 em cada fonte com esse valor
    if (cardSameValCandidates.length === 1 && sysSameValCount === 1 && cardAllSameValCount === 1) {
      const c = cardSameValCandidates[0]

      const isMlS = isMarketplaceFamily(s.sys.parceiro)
      const isMlC = isMarketplaceFamily(c.card.estabelecimento)

      // Se ambos pertencem à família de marketplace:
      if (isMlS && isMlC) {
        // Checagem rigorosa de concorrentes na família:
        // Não pode haver outro lançamento com valor próximo (<= R$ 0.50) na família em qualquer fonte
        const mlSysNear = eligibleSys.filter(
          (other) => isMarketplaceFamily(other.sys.parceiro) && Math.abs(other.val - s.val) <= 0.5,
        ).length
        const mlCardNear = eligibleCard.filter(
          (other) =>
            isMarketplaceFamily(other.card.estabelecimento) && Math.abs(other.val - s.val) <= 0.5,
        ).length

        // Se houver qualquer outro candidato próximo na família, NÃO casa por fallback (fica exclusivo)
        if (mlSysNear > 1 || mlCardNear > 1 || sysNearValCount > 1 || cardNearValCount > 1) {
          continue
        }

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
          motivo: 'Valor rigorosamente único nas duas fontes e plataforma coincidente',
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
  const divergentCandidates = candidates
    .filter(
      (cand) =>
        cand.absDiff >= 0.01 &&
        !isMarketplaceFamily(cand.sys.parceiro) &&
        !isMarketplaceFamily(cand.card.estabelecimento) &&
        (cand.nameSim >= 0.5 || cand.refMatch) &&
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

    const difStr = Math.abs(cand.diffVal).toFixed(2).replace('.', ',')
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
  // 6. FASE 4: Registros sem correspondência comprovada → Exclusivos da respectiva fonte (VERMELHO)
  // Regra do usuário: "Quando o algoritmo não conseguir estabelecer uma correspondência confiável,
  // deverá manter os registros separados e classificá-los como exclusivos da respectiva fonte,
  // sem inventar associações. Não utilizar o status 'Ambíguo', 'Cinza' ou qualquer categoria equivalente."

  // 6a. Exclusivos do Sistema (RED / SOMENTE_SISTEMA)
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
      motivo: 'Existe no Odoo sem correspondência comprovada na fatura',
      scoreConfianca: 0,
      linhaOdooOrigem: s.sys.linhaOrigem,
      observacaoManualOdoo: s.sys.observacaoManual,
    })
  }

  // 6b. Exclusivos da Fatura (RED / SOMENTE_FATURA)
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

  // 7. Ordenação padrão canônica: crescente por valor (com critério de desempate canônico)
  return results.sort((a, b) => {
    const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
    const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
    if (valA !== valB) return valA - valB
    const dateCmp = parseDateTimestamp(a.data) - parseDateTimestamp(b.data)
    if (dateCmp !== 0) return dateCmp
    return (a.id || '').localeCompare(b.id || '')
  })
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

  // Total conciliado em CADA fonte
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
    diferencaTotal,
    percentualConciliacao,
  }
}
