import { describe, it, expect } from 'vitest'
import {
  reconcileData,
  calculateReconciliationMetrics,
  generateAdherenceReport,
  getSystemValue,
  getCardValue,
} from './reconciliation'
import { deepFreeze, roundToCents, toIntegerCents, computeStrictDifference } from './immutability'
import { generateExportCSV, validateExport } from './validation'
import type { SystemRecord, CardRecord } from './types'

describe('Integridade Financeira e Imutabilidade das Fontes de Origem', () => {
  it('1. Garante que os registros originais de entrada permanecem estritamente congelados e inalterados', () => {
    const rawSys: SystemRecord = {
      id: 'sys-test-1',
      data: '10/06/2026',
      parceiro: 'FORNECEDOR ALFA LTDA',
      credito: 1450.75,
      total: 1450.75,
      debito: null,
      numero: 'NF-9988',
      referencia: 'REF-1234',
    }

    const rawCard: CardRecord = {
      id: 'card-test-1',
      data: '10/06/2026',
      estabelecimento: 'FORNECEDOR ALFA',
      valor: 1450.75,
      categoria: 'Suprimentos',
    }

    // Congela registros antes da conciliação
    deepFreeze(rawSys)
    deepFreeze(rawCard)

    const sysList = [rawSys]
    const cardList = [rawCard]

    const results = reconcileData(sysList, cardList, 'itau')

    // Verifica que o resultado foi gerado com sucesso
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')

    // Invariante: os dados originais não sofreram NENHUMA mutação
    expect(rawSys.credito).toBe(1450.75)
    expect(rawSys.total).toBe(1450.75)
    expect(rawSys.parceiro).toBe('FORNECEDOR ALFA LTDA')
    expect(rawSys.numero).toBe('NF-9988')
    expect(rawCard.valor).toBe(1450.75)
    expect(rawCard.estabelecimento).toBe('FORNECEDOR ALFA')

    // Tentar mutar um objeto congelado deve falhar ou ser impedido
    expect(Object.isFrozen(rawSys)).toBe(true)
    expect(Object.isFrozen(rawCard)).toBe(true)
    expect(Object.isFrozen(results[0])).toBe(true)
  })

  it('2. Garante que ordenar ou filtrar não desvincula valores nem IDs estáveis', () => {
    const sysA: SystemRecord = {
      id: 'sys-A',
      data: '01/06/2026',
      parceiro: 'EMPRESA BETA',
      credito: 100.0,
      total: 100.0,
      debito: null,
    }
    const sysB: SystemRecord = {
      id: 'sys-B',
      data: '02/06/2026',
      parceiro: 'EMPRESA GAMA',
      credito: 500.0,
      total: 500.0,
      debito: null,
    }

    const cardA: CardRecord = {
      id: 'card-A',
      data: '01/06/2026',
      estabelecimento: 'EMPRESA BETA',
      valor: 100.0,
    }
    const cardB: CardRecord = {
      id: 'card-B',
      data: '02/06/2026',
      estabelecimento: 'EMPRESA GAMA',
      valor: 500.0,
    }

    const results = reconcileData([sysB, sysA], [cardA, cardB], 'itau')

    // Associação deve ser estritamente por afinidade de negócio e ID estável, não por ordem de array
    const matchBeta = results.find((r) => r.estabelecimento === 'EMPRESA BETA')
    const matchGama = results.find((r) => r.estabelecimento === 'EMPRESA GAMA')

    expect(matchBeta).toBeDefined()
    expect(matchBeta?.systemRecordId).toBe('sys-A')
    expect(matchBeta?.cardRecordId).toBe('card-A')
    expect(matchBeta?.credito).toBe(100.0)
    expect(matchBeta?.valorFatura).toBe(100.0)

    expect(matchGama).toBeDefined()
    expect(matchGama?.systemRecordId).toBe('sys-B')
    expect(matchGama?.cardRecordId).toBe('card-B')
    expect(matchGama?.credito).toBe(500.0)
    expect(matchGama?.valorFatura).toBe(500.0)
  })

  it('3. Lançamentos com estabelecimentos diferentes mas valores idênticos NÃO devem ser pareados (ficam exclusivos)', () => {
    const sys: SystemRecord = {
      id: 'sys-farmacia',
      data: '05/06/2026',
      parceiro: 'DROGARIA SAO PAULO LTDA',
      credito: 75.5,
      total: 75.5,
      debito: null,
    }

    const card: CardRecord = {
      id: 'card-restaurante',
      data: '05/06/2026',
      estabelecimento: 'RESTAURANTE SABOR DA VILA',
      valor: 75.5,
    }

    const results = reconcileData([sys], [card], 'itau')

    // Deve resultar em 2 registros exclusivos (SOMENTE_SISTEMA e SOMENTE_FATURA), sem status cinza
    expect(results).toHaveLength(2)

    const sysResult = results.find((r) => r.origem === 'SISTEMA')
    const cardResult = results.find((r) => r.origem === 'FATURA')

    expect(sysResult).toBeDefined()
    expect(sysResult?.status).toBe('RED')
    expect(sysResult?.classificacao).toBe('SOMENTE_SISTEMA')
    expect(sysResult?.credito).toBe(75.5)
    expect(sysResult?.valorFatura).toBeNull()

    expect(cardResult).toBeDefined()
    expect(cardResult?.status).toBe('RED')
    expect(cardResult?.classificacao).toBe('SOMENTE_FATURA')
    expect(cardResult?.valorFatura).toBe(75.5)
    expect(cardResult?.credito).toBeNull()
  })

  it('4. Cálculo estrito de diferença em centavos inteiros (evita erro de ponto flutuante IEEE 754)', () => {
    // Caso clássico de imprecisão: 0.1 + 0.2 = 0.30000000000000004
    // No Odoo: 339.51, na Fatura: 367.91 -> dif: 28.40
    const diff = computeStrictDifference(367.91, 339.51)
    expect(diff).toBe(28.4)
    expect(toIntegerCents(diff)).toBe(2840)

    // Outro teste de precisão de centavos
    const diff2 = computeStrictDifference(100.05, 100.03)
    expect(diff2).toBe(0.02)
  })

  it('5. Divergência legítima de mesmo fornecedor com valores distintos apura diferença sem modificar valores originais', () => {
    const sys: SystemRecord = {
      id: 'sys-div-1',
      data: '15/06/2026',
      parceiro: 'DISTRIBUIDORA DE EMBALAGENS EPA',
      credito: 1200.0,
      total: 1200.0,
      debito: null,
    }

    const card: CardRecord = {
      id: 'card-div-1',
      data: '15/06/2026',
      estabelecimento: 'DISTRIBUIDORA DE EMBALAGENS EPA',
      valor: 1250.75,
    }

    const results = reconcileData([sys], [card], 'itau')

    expect(results).toHaveLength(1)
    const r = results[0]

    expect(r.status).toBe('YELLOW')
    expect(r.classificacao).toBe('DIVERGENTE')
    // Valores de origem preservados rigorosamente
    expect(r.credito).toBe(1200.0)
    expect(r.valorFatura).toBe(1250.75)
    expect(r.diferenca).toBe(50.75)
  })

  it('6. Respeito rigoroso às conferências manuais anotadas ("Apenas Fatura", "Apenas odoo", "divergente")', () => {
    const sysOnly: SystemRecord = {
      id: 'sys-only',
      data: '10/06/2026',
      parceiro: 'SERVICOS DIVERSOS LTDA',
      credito: 85.0,
      total: 85.0,
      debito: null,
      observacaoManual: 'Apenas odoo',
    }

    const cardOnly: CardRecord = {
      id: 'card-only',
      data: '10/06/2026',
      estabelecimento: 'SERVICOS DIVERSOS LTDA',
      valor: 85.0,
      observacaoManual: 'Apenas Fatura',
    }

    // Mesmo tendo o mesmo parceiro e o mesmo valor, as anotações manuais
    // exigem que NUNCA sejam pareados automaticamente
    const results = reconcileData([sysOnly], [cardOnly], 'itau')

    expect(results).toHaveLength(2)

    const sysRes = results.find((r) => r.systemRecordId === 'sys-only')
    const cardRes = results.find((r) => r.cardRecordId === 'card-only')

    expect(sysRes?.status).toBe('RED')
    expect(sysRes?.classificacao).toBe('SOMENTE_SISTEMA')

    expect(cardRes?.status).toBe('RED')
    expect(cardRes?.classificacao).toBe('SOMENTE_FATURA')

    // O relatório de aderência deve indicar 100% de concordância
    const adherence = generateAdherenceReport(results)
    expect(adherence.totalConcordantes).toBe(2)
    expect(adherence.totalDiscordantes).toBe(0)
    expect(adherence.taxaAderenciaPercentual).toBe(100)
  })

  it('7. Reprocessar os mesmos arquivos gera resultados idênticos e determinísticos', () => {
    const sysList: SystemRecord[] = [
      { id: 's1', data: '01/06/2026', parceiro: 'FORNECEDOR A', credito: 100.0, debito: null },
      { id: 's2', data: '02/06/2026', parceiro: 'FORNECEDOR B', credito: 200.0, debito: null },
      { id: 's3', data: '03/06/2026', parceiro: 'FORNECEDOR C', credito: 300.0, debito: null },
    ]

    const cardList: CardRecord[] = [
      { id: 'c3', data: '03/06/2026', estabelecimento: 'FORNECEDOR C', valor: 300.0 },
      { id: 'c1', data: '01/06/2026', estabelecimento: 'FORNECEDOR A', valor: 100.0 },
      { id: 'c2', data: '02/06/2026', estabelecimento: 'FORNECEDOR B', valor: 200.0 },
    ]

    const run1 = reconcileData(sysList, cardList, 'itau')
    const run2 = reconcileData(sysList, cardList, 'itau')

    expect(run1).toEqual(run2)
  })

  it('8. Exportação CSV e XLSX utiliza estritamente os valores originais via ID estável', () => {
    const sys: SystemRecord = {
      id: 'sys-exp-1',
      data: '20/06/2026',
      parceiro: 'PARCEIRO TESTE EXPORTACAO',
      credito: 199.99,
      total: 199.99,
      debito: null,
      numero: 'NF-112233',
    }

    const card: CardRecord = {
      id: 'card-exp-1',
      data: '20/06/2026',
      estabelecimento: 'PARCEIRO TESTE EXPORTACAO',
      valor: 199.99,
    }

    const results = reconcileData([sys], [card], 'itau')
    const valResult = validateExport(results, [sys], [card])

    expect(valResult.isValid).toBe(true)

    const csvOutput = generateExportCSV(results, [sys], [card])
    expect(csvOutput).toContain('PARCEIRO TESTE EXPORTACAO')
    expect(csvOutput).toContain('199,99')
    expect(csvOutput).toContain('NF-112233')
  })

  it('9. Preservação de estornos negativos sem inversão de sinal indevida', () => {
    const cardEstorno: CardRecord = {
      id: 'card-estorno-1',
      data: '08/06/2026',
      estabelecimento: 'ESTORNO DE ANUIDADE DIF',
      valor: -18.75,
      observacaoManual: 'Apenas Fatura',
    }

    const results = reconcileData([], [cardEstorno], 'itau')

    expect(results).toHaveLength(1)
    const r = results[0]
    expect(r.status).toBe('RED')
    expect(r.classificacao).toBe('SOMENTE_FATURA')
    expect(r.valorFatura).toBe(-18.75)

    const metrics = calculateReconciliationMetrics(results, 0, 1)
    expect(metrics.totalValorFatura).toBe(-18.75)
    expect(metrics.totalValorExclusivoFatura).toBe(-18.75)
  })

  it('10. Conciliação com lançamentos duplicados sem misturar referências ou valores', () => {
    // Duas compras idênticas no mesmo dia de valores iguais, porém referências/IDs distintos
    const sys1: SystemRecord = {
      id: 'sys-dup-1',
      data: '12/06/2026',
      parceiro: 'LOJA COPIAS EXPRESS LTDA',
      credito: 45.0,
      total: 45.0,
      debito: null,
      referencia: 'DOC-101',
    }
    const sys2: SystemRecord = {
      id: 'sys-dup-2',
      data: '12/06/2026',
      parceiro: 'LOJA COPIAS EXPRESS LTDA',
      credito: 45.0,
      total: 45.0,
      debito: null,
      referencia: 'DOC-102',
    }

    const card1: CardRecord = {
      id: 'card-dup-1',
      data: '12/06/2026',
      estabelecimento: 'LOJA COPIAS EXPRESS',
      valor: 45.0,
    }
    const card2: CardRecord = {
      id: 'card-dup-2',
      data: '12/06/2026',
      estabelecimento: 'LOJA COPIAS EXPRESS',
      valor: 45.0,
    }

    const results = reconcileData([sys1, sys2], [card1, card2], 'itau')

    // Deve parear exatamente 2 pares verdes, cada registro usado estritamente uma única vez
    expect(results).toHaveLength(2)
    expect(results[0].status).toBe('GREEN')
    expect(results[1].status).toBe('GREEN')

    const usedSysIds = new Set(results.map((r) => r.systemRecordId))
    const usedCardIds = new Set(results.map((r) => r.cardRecordId))
    expect(usedSysIds.size).toBe(2)
    expect(usedCardIds.size).toBe(2)
    expect(usedSysIds.has('sys-dup-1')).toBe(true)
    expect(usedSysIds.has('sys-dup-2')).toBe(true)
    expect(usedCardIds.has('card-dup-1')).toBe(true)
    expect(usedCardIds.has('card-dup-2')).toBe(true)
  })

  it('11. Alterar apresentação ou ordenar resultado não altera referências originais (deep-freeze check)', () => {
    const sys: SystemRecord = {
      id: 'sys-freeze-check',
      data: '18/06/2026',
      parceiro: 'POSTO COMBUSTIVEL BRASIL',
      credito: 250.0,
      total: 250.0,
      debito: null,
      numero: 'NF-7788',
      referencia: 'REF-COMBUSTIVEL',
    }
    const card: CardRecord = {
      id: 'card-freeze-check',
      data: '18/06/2026',
      estabelecimento: 'POSTO COMBUSTIVEL BRASIL',
      valor: 250.0,
    }

    const sysList = [sys]
    const cardList = [card]

    const results = reconcileData(sysList, cardList, 'itau')

    // O resultado retornado deve ser estritamente congelado
    expect(Object.isFrozen(results)).toBe(true)
    expect(Object.isFrozen(results[0])).toBe(true)

    // Tentar mutar propriedade do resultado em runtime não modifica o objeto original
    expect(() => {
      ;(results[0] as unknown as { credito: number }).credito = 9999.99
    }).toThrow()

    // O objeto original permanece intacto
    expect(sys.credito).toBe(250.0)
    expect(card.valor).toBe(250.0)
  })
})
