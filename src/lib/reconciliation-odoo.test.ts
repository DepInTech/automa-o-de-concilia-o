import { describe, it, expect } from 'vitest'
import { parseCSV, mapSystemRecords, parseBrazilianNumber } from './csv-parser'
import {
  normalizeEntityName,
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
} from './normalization'
import { reconcileData } from './reconciliation'
import type { SystemRecord, CardRecord } from './types'

describe('Motor de Conciliação Financeira - Grupo EPA & Odoo vs Fatura Itaú', () => {
  // 1. SWIFT PIRACUAMA (match exato após normalização)
  it('1. SWIFT PIRACUAMA: deve conciliar perfeitamente com status CONCILIADO e GREEN', () => {
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
    expect(results[0].motivo).toContain('compatíveis')
  })

  // 2. STARLINK BRAZIL (DL *Starlink Brazil ↔ STARLINK BRAZIL SERVICOS DE INTERNET LTDA.)
  it('2. STARLINK BRAZIL: deve conciliar removendo prefixo DL * e sufixos empresariais', () => {
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

    const similarity = calculateNameSimilarity(
      'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
      'DL *Starlink Brazil',
    )
    expect(similarity).toBeGreaterThanOrEqual(0.6)

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].origem).toBe('AMBOS')
    expect(results[0].diferenca).toBe(0)
  })

  // 3. SJX COMERCIAL ATACADISTA (SJX - COMERCIAL ATACAD ↔ SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge)
  it('3. SJX COMERCIAL ATACADISTA: deve conciliar abreviações e nomes reduzidos de fatura', () => {
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
    expect(results[0].origem).toBe('AMBOS')
  })

  // 4. Valores com separadores brasileiros e formato internacional
  it('4. Valores: deve converter com precisão padrão BR (R$ 1.954,12), padrão internacional (1,114.06) e sem milhar (1954,12)', () => {
    expect(normalizeMoneyValue('R$ 1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1954.12')).toBe(1954.12)
    expect(normalizeMoneyValue('1954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1,114.06')).toBe(1114.06)
    expect(normalizeMoneyValue('R$ 1,114.06')).toBe(1114.06)
    expect(normalizeMoneyValue('-R$ 250,50')).toBe(-250.5)
    expect(normalizeMoneyValue('(1.200,00)')).toBe(-1200.0)

    expect(parseBrazilianNumber('1.954,12')).toBe(1954.12)
    expect(parseBrazilianNumber('1,114.06')).toBe(1114.06)
  })

  // 5. Datas diferentes entre compra e lançamento contábil
  it('5. Datas: deve permitir diferença razoável entre data da compra na fatura e lançamento contábil no Odoo', () => {
    const diff = calculateDateDifferenceInDays('01/07/2026', '23/06/2026')
    expect(diff).toBe(8) // 8 dias de diferença

    const sys: SystemRecord[] = [
      {
        id: 'sys-dt',
        data: '01/07/2026', // Lançamento contábil no início do mês seguinte
        parceiro: 'POSTO SHELL CENTRO',
        credito: 250.0,
        total: 250.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-dt',
        data: '15/06/2026', // Compra no meio do mês anterior
        estabelecimento: 'POSTO SHELL CENTRO',
        valor: 250.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
  })

  // 5b. Data fora da tolerância (> 45 dias) deve ser classificada como DIVERGENTE
  it('5b. Datas: se a diferença de datas for absurda (> 45 dias), deve acusar DIVERGENTE', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-old',
        data: '01/07/2026',
        parceiro: 'PAPELARIA CENTRAL',
        credito: 100.0,
        total: 100.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-old',
        data: '15/03/2026', // 108 dias antes
        estabelecimento: 'PAPELARIA CENTRAL',
        valor: 100.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('YELLOW')
    expect(results[0].classificacao).toBe('DIVERGENTE')
    expect(results[0].motivo).toContain('tolerância')
  })

  // 6. Dois lançamentos diferentes com o mesmo valor (NÃO devem ser conciliados automaticamente se forem parceiros distintos)
  it('6. Dois lançamentos com mesmo valor: estabelecimentos distintos não devem ser conciliados como GREEN', () => {
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
    // Não podem ser conciliados (GREEN / CONCILIADO)
    const conc = results.find((r) => r.status === 'GREEN')
    expect(conc).toBeUndefined()

    // Devem ficar separados como SOMENTE_SISTEMA e SOMENTE_FATURA (RED)
    expect(results).toHaveLength(2)
    expect(results.some((r) => r.classificacao === 'SOMENTE_SISTEMA')).toBe(true)
    expect(results.some((r) => r.classificacao === 'SOMENTE_FATURA')).toBe(true)
  })

  // 7. Compras repetidas do mesmo estabelecimento (devem casar individualmente 1-para-1, sem duplicidade)
  it('7. Compras repetidas: unicidade estrita onde cada registro casa no máximo 1 vez', () => {
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

  // 8. Registros existentes apenas no Excel (Somente Sistema)
  it('8. Somente Sistema: registro presente no Odoo mas não na fatura deve ser RED / SOMENTE_SISTEMA', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-exclusive',
        data: '01/07/2026',
        parceiro: 'HONORARIOS ADVOCATICIOS EXCLUSIVOS',
        credito: 5000.0,
        total: 5000.0,
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
    expect(results[0].motivo).toContain('Não encontrado na fatura')
  })

  // 9. Registros existentes apenas no PDF (Somente Fatura)
  it('9. Somente Fatura: transação da fatura sem correspondente no Odoo deve ser RED / SOMENTE_FATURA', () => {
    const sys: SystemRecord[] = []
    const card: CardRecord[] = [
      {
        id: 'card-exclusive',
        data: '15/06/2026',
        estabelecimento: 'CAFE DA MANHA HOTEL',
        valor: 78.9,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('RED')
    expect(results[0].classificacao).toBe('SOMENTE_FATURA')
    expect(results[0].origem).toBe('FATURA')
    expect(results[0].parceiro).toBe('-')
    expect(results[0].motivo).toContain('Não encontrado no lançamento do Odoo')
  })

  // 10. Lançamentos internacionais (USD / cotação / conversão em R$)
  it('10. Lançamentos internacionais: deve conciliar pelo valor convertido em R$', () => {
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

  // 11. Caso real de divergência legítima de valor (mesmo parceiro, valor diferente)
  it('11. Divergente legítimo: mesmo parceiro mas valor divergente deve ser YELLOW / DIVERGENTE com motivo claro', () => {
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
    expect(results[0].diferenca).toBe(25.5)
    expect(results[0].motivo).toContain('Valor diferente')
  })

  // 12. Simulação com o lote completo dos 4 exemplos de ouro do usuário
  it('12. Lote dos exemplos reais: SWIFT, STARLINK, SJX e BIOCENTRIX conciliam conjuntamente', () => {
    const odooRecords: SystemRecord[] = [
      {
        id: 'odoo-1',
        data: '01/07/2026',
        numero: 'CIT12/2026/0670',
        parceiro: 'SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge',
        referencia: '29',
        total: 1114.06,
        credito: 1114.06,
        debito: 0,
      },
      {
        id: 'odoo-2',
        data: '01/07/2026',
        numero: 'CIT12/2026/0667',
        parceiro: 'SWIFT PIRACUAMA',
        referencia: '307283',
        total: 1954.12,
        credito: 1954.12,
        debito: 0,
      },
      {
        id: 'odoo-3',
        data: '01/07/2026',
        numero: 'CIT12/2026/0666',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        referencia: '178113044799147',
        total: 1199.0,
        credito: 1199.0,
        debito: 0,
      },
      {
        id: 'odoo-4',
        data: '23/06/2026',
        numero: 'CIT12/2026/0638',
        parceiro: 'BIOCENTRIX MATERIAIS PARA LABORATÓRIO',
        referencia: '10367',
        total: 3684.82,
        credito: 3684.82,
        debito: 0,
      },
      {
        id: 'odoo-5',
        data: '23/06/2026',
        numero: 'CIT12/2026/0699',
        parceiro: 'FORNECEDOR APENAS NO ODOO',
        referencia: '9999',
        total: 800.0,
        credito: 800.0,
        debito: 0,
      },
    ]

    const cardRecords: CardRecord[] = [
      {
        id: 'itau-1',
        data: '23/06/2026',
        estabelecimento: 'SJX - COMERCIAL ATACAD',
        valor: 1114.06,
      },
      {
        id: 'itau-2',
        data: '23/06/2026',
        estabelecimento: 'SWIFT PIRACUAMA',
        valor: 1954.12,
      },
      {
        id: 'itau-3',
        data: '12/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 1199.0,
      },
      {
        id: 'itau-4',
        data: '08/06/2026',
        estabelecimento: 'PG *BIOCENTRIX MATERIA',
        valor: 3684.82,
      },
      {
        id: 'itau-5',
        data: '10/06/2026',
        estabelecimento: 'FORNECEDOR APENAS NA FATURA',
        valor: 450.0,
      },
    ]

    const results = reconcileData(odooRecords, cardRecords, 'itau')
    expect(results).toHaveLength(6) // 4 conciliados + 1 somente odoo + 1 somente fatura

    const conciliados = results.filter((r) => r.classificacao === 'CONCILIADO')
    expect(conciliados.length).toBe(4)

    const somenteOdoo = results.filter((r) => r.classificacao === 'SOMENTE_SISTEMA')
    expect(somenteOdoo.length).toBe(1)
    expect(somenteOdoo[0].parceiro).toBe('FORNECEDOR APENAS NO ODOO')

    const somenteFatura = results.filter((r) => r.classificacao === 'SOMENTE_FATURA')
    expect(somenteFatura.length).toBe(1)
    expect(somenteFatura[0].estabelecimento).toBe('FORNECEDOR APENAS NA FATURA')
  })
})
