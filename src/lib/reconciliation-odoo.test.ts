import { describe, it, expect } from 'vitest'
import { parseCSV, mapSystemRecords } from './csv-parser'
import { normalizeEntityName, calculateNameSimilarity } from './normalization'
import { reconcileData } from './reconciliation'

describe('Validação do fluxo Odoo e Fatura Itaú', () => {
  it('deve mapear corretamente linhas exportadas do Odoo (account.move) com data ISO e cabeçalhos brasileiros', () => {
    const csvContent = `Número;Data;Parceiro;Referência;Diário;Total
MISC/2024/06/0012;2024-06-15;SWIFT PIRACUAMA;COMPRA CARNE;Cartão Corporativo Itaú;18,75
MISC/2024/06/0013;2024-06-18;⚠️ MERCADO LIVRE;EQUIPAMENTOS;Cartão Corporativo Itaú;1.114,06
MISC/2024/06/0014;2024-06-20;POSTO IPIRANGA;ABASTECIMENTO;Cartão Corporativo Itaú;250,00`

    const parsed = parseCSV(csvContent)
    const records = mapSystemRecords(parsed)

    expect(records).toHaveLength(3)
    expect(records[0].data).toBe('15/06/2024')
    expect(records[0].total).toBe(18.75)
    expect(records[0].parceiro).toBe('SWIFT PIRACUAMA')

    expect(records[1].data).toBe('18/06/2024')
    expect(records[1].total).toBe(1114.06)
    // O emoji ⚠️ deve ser devidamente tratado na normalização
    const normalizedPartner = normalizeEntityName(records[1].parceiro)
    expect(normalizedPartner).not.toContain('⚠️')
    expect(normalizedPartner).toBe('mercado livre')
  })

  it('deve conciliar registros entre o Odoo e o Cartão Itaú com alta precisão', () => {
    const systemRecords = [
      {
        id: 'sys-1',
        numero: 'MISC/2024/06/0012',
        data: '15/06/2024',
        parceiro: 'SWIFT COMERCIO DE ALIMENTOS',
        referencia: 'ALMOCO DIRETORIA',
        diario: 'Cartão Corporativo Itaú',
        debito: 0,
        credito: 18.75,
        total: 18.75,
      },
      {
        id: 'sys-2',
        numero: 'MISC/2024/06/0013',
        data: '18/06/2024',
        parceiro: '⚠️ MERCADO LIVRE TITAN',
        referencia: 'COMPRA PARC 11/12',
        diario: 'Cartão Corporativo Itaú',
        debito: 0,
        credito: 1114.06,
        total: 1114.06,
      },
    ]

    const cardRecords = [
      {
        id: 'card-1',
        data: '15/06/2024',
        estabelecimento: 'SWIFT PIRACUAMA',
        valor: 18.75,
      },
      {
        id: 'card-2',
        data: '18/06/2024',
        estabelecimento: 'MERCADOLIVRE*TITAN11/12',
        valor: 1114.06,
      },
    ]

    const results = reconcileData(systemRecords, cardRecords, 'itau')

    expect(results).toHaveLength(2)
    // Ambos devem ser conciliados com status GREEN
    const conc = results.filter((r) => r.classificacao === 'CONCILIADO')
    expect(conc.length).toBe(2)
    expect(results[0].status).toBe('GREEN')
    expect(results[1].status).toBe('GREEN')
  })

  it('deve calcular similaridade alta mesmo com prefixos de alerta do Odoo e caracteres especiais de fatura', () => {
    const nameA = '⚠️ MERCADO LIVRE'
    const nameB = 'MERCADOLIVRE*TITAN'
    const sim = calculateNameSimilarity(nameA, nameB)
    expect(sim).toBeGreaterThanOrEqual(0.6)
  })

  it('deve tratar números com vírgula de milhar e ponto decimal sem truncar valores', () => {
    const csvOdoo = `Data,Número,Parceiro,Referência,Diário,Total
2026-07-01,CIT12/2026/0670,SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA,29,[CIT12] Cartão Banco Itaú Master 12 FATURAS,1,114.06
2026-07-01,CIT12/2026/0667,SWIFT PIRACUAMA,307283,[CIT12] Cartão Banco Itaú Master 12 FATURAS,1,954.12
2026-07-01,CIT12/2026/0666,STARLINK BRAZIL SERVICOS DE INTERNET LTDA.,178113044799147,[CIT12] Cartão Banco Itaú Master 12 FATURAS,1,199.00
2026-06-23,CIT12/2026/0638,BIOCENTRIX MATERIAIS PARA LABORATÓRIO,10367,[CIT12] Cartão Banco Itaú Master 12 FATURAS,3,684.82
2026-06-23,CIT12/2026/0632,SENDAS DISTRIBUIDORA S/A,228877,[CIT12] Cartão Banco Itaú Master 12 FATURAS,5,331.07`

    const parsed = parseCSV(csvOdoo)
    const records = mapSystemRecords(parsed)

    expect(records).toHaveLength(5)
    expect(records[0].total).toBe(1114.06)
    expect(records[1].total).toBe(1954.12)
    expect(records[2].total).toBe(1199.0)
    expect(records[3].total).toBe(3684.82)
    expect(records[4].total).toBe(5331.07)
  })

  it('deve conciliar perfeitamente casos reais do Odoo contra fatura Itaú', () => {
    const odooRecords = [
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
    ]

    const cardRecords = [
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
    ]

    const result = reconcileData(odooRecords, cardRecords, 'itau')
    const conciliados = result.filter((r) => r.classificacao === 'CONCILIADO')
    expect(conciliados.length).toBe(4)
  })
})
