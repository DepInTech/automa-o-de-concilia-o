import { describe, it, expect } from 'vitest'
import { parseCSV, mapSystemRecords, parseBrazilianNumber } from './csv-parser'
import {
  normalizeEntityName,
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
} from './normalization'
import { reconcileData } from './reconciliation'
import { sanitizeParsedCSV } from './itau-sanitizer'
import type { SystemRecord, CardRecord } from './types'

describe('Motor de Conciliação Financeira - Grupo EPA & Odoo vs Fatura Itaú', () => {
  // =========================================================================
  // CENÁRIO 1: Mesmo nome + mesmo valor → VERDE / CONCILIADO
  // =========================================================================
  it('Cenário 1: SWIFT PIRACUAMA - mesmo nome e mesmo valor deve conciliar como GREEN / CONCILIADO', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-swift',
        data: '01/07/2026',
        numero: 'CIT12/2026/0667',
        parceiro: 'SWIFT PIRACUAMA',
        referencia: '307283',
        credito: 1954.12,
        total: 1954.12,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-swift',
        data: '23/06/2026',
        estabelecimento: 'SWIFT PIRACUAMA',
        valor: 1954.12,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].origem).toBe('AMBOS')
    expect(results[0].diferenca).toBe(0)
    expect(results[0].credito).toBe(1954.12)
    expect(results[0].valorFatura).toBe(1954.12)
  })

  // =========================================================================
  // CENÁRIO 1b: Estorno com valor negativo na Fatura
  // =========================================================================
  it('Cenário 1b: Estorno na fatura com valor negativo é preservado', () => {
    const sys: SystemRecord[] = []
    const card: CardRecord[] = [
      {
        id: 'card-estorno',
        data: '08/06/2026',
        estabelecimento: 'ESTORNO DE ANUIDADE DIF',
        valor: -18.75,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('RED')
    expect(results[0].classificacao).toBe('SOMENTE_FATURA')
    expect(results[0].valorFatura).toBe(-18.75)
  })

  // =========================================================================
  // CENÁRIO 2: Nome abreviado vs completo + mesmo valor → VERDE / CONCILIADO
  // Exemplos: STARLINK BRAZIL, SJX COMERCIAL ATACADISTA
  // =========================================================================
  it('Cenário 2a: DL *Starlink Brazil ↔ STARLINK BRAZIL SERVICOS DE INTERNET LTDA. (R$ 1.199,00) → GREEN', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-starlink',
        data: '01/07/2026',
        numero: 'CIT12/2026/0666',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        referencia: '178113044799147',
        credito: 1199.0,
        total: 1199.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-starlink',
        data: '12/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 1199.0,
      },
    ]

    const sim = calculateNameSimilarity(
      'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
      'DL *Starlink Brazil',
    )
    expect(sim).toBeGreaterThanOrEqual(0.6)

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].origem).toBe('AMBOS')
    expect(results[0].diferenca).toBe(0)
  })

  it('Cenário 2b: SJX - COMERCIAL ATACAD ↔ SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge (R$ 1.114,06) → GREEN', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-sjx',
        data: '01/07/2026',
        numero: 'CIT12/2026/0670',
        parceiro: 'SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge',
        referencia: '29',
        credito: 1114.06,
        total: 1114.06,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-sjx',
        data: '23/06/2026',
        estabelecimento: 'SJX - COMERCIAL ATACAD',
        valor: 1114.06,
      },
    ]

    const sim = calculateNameSimilarity(
      'SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge',
      'SJX - COMERCIAL ATACAD',
    )
    expect(sim).toBeGreaterThanOrEqual(0.5)

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
  })

  // =========================================================================
  // CENÁRIO 3: Mesmo nome + valores diferentes sem outra correspondência → AMARELO / DIVERGENTE
  // =========================================================================
  it('Cenário 3: Mesmo nome + valores diferentes deve ser YELLOW / DIVERGENTE com diferença calculada', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-divergent',
        data: '20/06/2026',
        parceiro: 'AWS AMAZON WEB SERVICES',
        credito: 500.0,
        total: 500.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-divergent',
        data: '20/06/2026',
        estabelecimento: 'AMAZON WEB SERVICES',
        valor: 525.5,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('YELLOW')
    expect(results[0].classificacao).toBe('DIVERGENTE')
    expect(results[0].credito).toBe(500.0)
    expect(results[0].valorFatura).toBe(525.5)
    expect(results[0].diferenca).toBe(25.5)
    expect(results[0].motivo).toContain('diferente')
  })

  // =========================================================================
  // CENÁRIO 4: Registro somente no Odoo → VERMELHO / SOMENTE_SISTEMA
  // =========================================================================
  it('Cenário 4: Lançamento exclusivo do Odoo deve ser RED / SOMENTE_SISTEMA', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-only',
        data: '01/07/2026',
        numero: 'CIT12/2026/0999',
        parceiro: 'HONORARIOS AUDITORIA INDEPENDENTE',
        credito: 7500.0,
        total: 7500.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = []

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('RED')
    expect(results[0].classificacao).toBe('SOMENTE_SISTEMA')
    expect(results[0].origem).toBe('SISTEMA')
    expect(results[0].estabelecimento).toBe('-')
    expect(results[0].motivo).toContain('Existe no Odoo')
  })

  // =========================================================================
  // CENÁRIO 5: Registro somente na Fatura → VERMELHO / SOMENTE_FATURA
  // =========================================================================
  it('Cenário 5: Transação da fatura sem correspondência no Odoo deve ser RED / SOMENTE_FATURA', () => {
    const sys: SystemRecord[] = []
    const card: CardRecord[] = [
      {
        id: 'card-only',
        data: '15/06/2026',
        estabelecimento: 'CAFE AEROPORTO CONGONHAS',
        valor: 42.5,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('RED')
    expect(results[0].classificacao).toBe('SOMENTE_FATURA')
    expect(results[0].origem).toBe('FATURA')
    expect(results[0].parceiro).toBe('-')
    expect(results[0].motivo).toContain('Existe na fatura')
  })

  // =========================================================================
  // CENÁRIO 6: Mesmo estabelecimento com várias compras (Starlink 78, 249, 1199 em ordem trocada)
  // Os três devem ficar VERDES, independentemente da ordem dos registros
  // =========================================================================
  it('Cenário 6: Caso clássico Starlink com 3 compras de valores diferentes em ordem trocada → todos GREEN', () => {
    const odooRecords: SystemRecord[] = [
      {
        id: 'odoo-starlink-249',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 249.0,
        total: 249.0,
        debito: null,
      },
      {
        id: 'odoo-starlink-78',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 78.0,
        total: 78.0,
        debito: null,
      },
      {
        id: 'odoo-starlink-1199',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 1199.0,
        total: 1199.0,
        debito: null,
      },
    ]

    // Fatura em ordem trocada: 78, 249, 1199
    const cardRecords: CardRecord[] = [
      {
        id: 'card-starlink-78',
        data: '10/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 78.0,
      },
      {
        id: 'card-starlink-249',
        data: '15/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 249.0,
      },
      {
        id: 'card-starlink-1199',
        data: '20/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 1199.0,
      },
    ]

    const results = reconcileData(odooRecords, cardRecords, 'itau')
    expect(results).toHaveLength(3)

    // Todos os 3 devem estar GREEN / CONCILIADO
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
    expect(results.every((r) => r.classificacao === 'CONCILIADO')).toBe(true)

    // E cada valor deve ter casado com seu par idêntico (diferença zero)
    const val78 = results.find((r) => r.credito === 78.0)
    expect(val78?.valorFatura).toBe(78.0)
    expect(val78?.diferenca).toBe(0)

    const val249 = results.find((r) => r.credito === 249.0)
    expect(val249?.valorFatura).toBe(249.0)
    expect(val249?.diferenca).toBe(0)

    const val1199 = results.find((r) => r.credito === 1199.0)
    expect(val1199?.valorFatura).toBe(1199.0)
    expect(val1199?.diferenca).toBe(0)
  })

  // =========================================================================
  // CENÁRIO 7: Mesmo valor em estabelecimentos diferentes → NÃO conciliar incorretamente
  // =========================================================================
  it('Cenário 7: Mesmo valor em parceiros totalmente não relacionados não deve conciliar', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-farmacia',
        data: '10/06/2026',
        parceiro: 'DROGARIA SAO PAULO',
        credito: 150.0,
        total: 150.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-restaurante',
        data: '10/06/2026',
        estabelecimento: 'RESTAURANTE FOGO DE CHAO',
        valor: 150.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    // Não podem ser marcados como CONCILIADO (GREEN)
    const conc = results.find((r) => r.status === 'GREEN')
    expect(conc).toBeUndefined()

    // Devem ser listados separadamente como SOMENTE_SISTEMA e SOMENTE_FATURA
    expect(results).toHaveLength(2)
    expect(results.some((r) => r.classificacao === 'SOMENTE_SISTEMA')).toBe(true)
    expect(results.some((r) => r.classificacao === 'SOMENTE_FATURA')).toBe(true)
  })

  // =========================================================================
  // CENÁRIO 8: Datas diferentes mas nome + valor correspondentes → permitir conciliação
  // =========================================================================
  it('Cenário 8: Data da fatura (compra) ≠ data do Odoo (competência contábil) deve permitir conciliação', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-shell',
        data: '01/07/2026', // Lançamento contábil no 1º dia do mês seguinte
        parceiro: 'POSTO SHELL CENTRO',
        credito: 250.0,
        total: 250.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-shell',
        data: '10/06/2026', // Compra no cartão 21 dias antes
        estabelecimento: 'POSTO SHELL CENTRO',
        valor: 250.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
  })

  // =========================================================================
  // CENÁRIO 9: Lançamentos internacionais extraídos e comparados pelo valor em reais
  // =========================================================================
  it('Cenário 9: Lançamentos internacionais comparados pelo valor convertido em reais da fatura', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-openai',
        data: '01/07/2026',
        parceiro: 'OPENAI LLC',
        credito: 108.4,
        total: 108.4,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-openai',
        data: '05/06/2026',
        estabelecimento: 'OPENAI *CHATGPT SUBSCR',
        moedaLocal: 'USD20,00',
        moedaGlobal: 'US$20,00',
        cotacao: 5.42,
        valor: 108.4,
        isInternacional: true,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].valorFatura).toBe(108.4)
  })

  // =========================================================================
  // CENÁRIO 10: Registros repetidos preservam compras legítimas e impedem associação duplicada
  // =========================================================================
  it('Cenário 10: Múltiplas compras idênticas de Uber devem casar 1-para-1 estritamente', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-uber-1',
        data: '05/06/2026',
        parceiro: 'UBER DO BRASIL',
        credito: 35.5,
        total: 35.5,
        debito: null,
      },
      {
        id: 'sys-uber-2',
        data: '05/06/2026',
        parceiro: 'UBER DO BRASIL',
        credito: 35.5,
        total: 35.5,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-uber-1',
        data: '05/06/2026',
        estabelecimento: 'UBER *TRIP',
        valor: 35.5,
      },
      {
        id: 'card-uber-2',
        data: '05/06/2026',
        estabelecimento: 'UBER *TRIP',
        valor: 35.5,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'GREEN' && r.classificacao === 'CONCILIADO')).toBe(
      true,
    )
  })

  // =========================================================================
  // DIAGNÓSTICO E PRECISÃO DE EXTRAÇÃO
  // Investigação de por que a tela chegou a mostrar 85 (vs 86) e 109 (vs 117)
  // =========================================================================
  it('Diagnóstico de extração: sanitização do Odoo NÃO deve truncar a primeira linha válida quando headers contêm Total/Diário', () => {
    const mockOdoo86Rows = {
      headers: ['Data', 'Número', 'Referência', 'Parceiro', 'Diário', 'Total'],
      rows: Array.from({ length: 86 }).map((_, i) => ({
        Data: '01/07/2026',
        Número: `CIT12/2026/${String(i + 1).padStart(4, '0')}`,
        Referência: `REF-${i + 1}`,
        Parceiro: `FORNECEDOR PARCEIRO ${i + 1}`,
        Diário: 'CIT12',
        Total: '1.954,12',
      })),
      detectedRows: 86,
    }

    // itau-sanitizer deve manter todos os 86 registros sem descartar a linha 0
    const sanitized = sanitizeParsedCSV(mockOdoo86Rows, 'system')
    expect(sanitized.rows.length).toBe(86)
    expect(sanitized.detectedRows).toBe(86)

    const mapped = mapSystemRecords(sanitized)
    expect(mapped.length).toBe(86)
    expect(mapped[0].parceiro).toBe('FORNECEDOR PARCEIRO 1')
    expect(mapped[0].credito).toBe(1954.12)
    expect(mapped[85].parceiro).toBe('FORNECEDOR PARCEIRO 86')
  })

  it('Diagnóstico de precisão monetária: suporta todos os formatos de moeda solicitados', () => {
    expect(normalizeMoneyValue('R$ 1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1954.12')).toBe(1954.12)
    expect(normalizeMoneyValue('1954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1,114.06')).toBe(1114.06)
    expect(normalizeMoneyValue('R$ 1,114.06')).toBe(1114.06)
  })

  // =========================================================================
  // CENÁRIO 11: Ordenação interna crescente por padrão
  // =========================================================================
  it('Cenário 11: Resultados devem vir ordenados crescentemente por valor por padrão', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-alto',
        data: '01/07/2026',
        parceiro: 'PARCEIRO CARO',
        credito: 5000.0,
        total: 5000.0,
        debito: null,
      },
      {
        id: 'sys-baixo',
        data: '01/07/2026',
        parceiro: 'PARCEIRO BARATO',
        credito: 15.0,
        total: 15.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-medio',
        data: '15/06/2026',
        estabelecimento: 'ESTABELECIMENTO MEDIO',
        valor: 150.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(3)
    const vals = results.map((r) => r.credito ?? r.valorFatura)
    expect(vals).toEqual([15.0, 150.0, 5000.0])
  })
})
