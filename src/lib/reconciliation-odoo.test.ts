import { describe, it, expect } from 'vitest'
import {
  normalizeEntityName,
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
} from './normalization'
import { reconcileData, calculateReconciliationMetrics } from './reconciliation'
import { convertInvoicePdfToExcel } from './pdf-to-excel-converter'
import { importOdooFile } from './odoo-importer'
import { generateXlsxBlob } from './xlsx-generator'
import { extractZip } from './zip-reader'
import { generateExportCSV, validateExport } from './validation'
import type { SystemRecord, CardRecord } from './types'

describe('RECONSTRUÇÃO DA CONCILIAÇÃO FINANCEIRA - GRUPO EPA', () => {
  // =========================================================================
  // TESTE 1: Mesmo estabelecimento e mesmo valor → VERDE / CONCILIADO
  // Caso real obrigatório: SWIFT PIRACUAMA ↔ SWIFT PIRACUAMA
  // =========================================================================
  it('1. Mesmo estabelecimento e mesmo valor (SWIFT PIRACUAMA R$ 1.954,12) → GREEN / CONCILIADO', () => {
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
  // TESTE 2: Nome abreviado e valor igual → VERDE / CONCILIADO
  // Casos reais obrigatórios:
  // "DL *Starlink Brazil" ↔ "STARLINK BRAZIL SERVICOS DE INTERNET LTDA."
  // "SJX - COMERCIAL ATACAD" ↔ "SJX COMERCIAL ATACADISTA DE MERCADORIAS LTDA - Sacolão São Jorge"
  // =========================================================================
  it('2a. Nome abreviado (DL *Starlink Brazil ↔ STARLINK BRAZIL SERVICOS DE INTERNET LTDA. R$ 1.199,00) → GREEN', () => {
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
    expect(results[0].diferenca).toBe(0)
  })

  it('2b. Razão social longa (SJX - COMERCIAL ATACAD ↔ SJX COMERCIAL ATACADISTA... R$ 1.114,06) → GREEN', () => {
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

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
  })

  // =========================================================================
  // TESTE 3: Mesmo estabelecimento e valor diferente → AMARELO / DIVERGENTE
  // =========================================================================
  it('3. Mesmo estabelecimento e valor diferente → YELLOW / DIVERGENTE com diferença apurada', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-aws',
        data: '20/06/2026',
        parceiro: 'AMAZON WEB SERVICES DO BRASIL',
        credito: 500.0,
        total: 500.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-aws',
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
  })

  // =========================================================================
  // TESTE 4: Registro somente no Odoo → VERMELHO / SOMENTE_SISTEMA
  // =========================================================================
  it('4. Registro exclusivo do Odoo → RED / SOMENTE_SISTEMA com estabelecimento "-"', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-auditoria',
        data: '01/07/2026',
        numero: 'CIT12/2026/0999',
        parceiro: 'AUDITORIA CONTABIL EXTERNA INDEPENDENTE',
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
  })

  // =========================================================================
  // TESTE 5: Registro somente na fatura → VERMELHO / SOMENTE_FATURA
  // =========================================================================
  it('5. Registro exclusivo da fatura → RED / SOMENTE_FATURA com parceiro "-"', () => {
    const sys: SystemRecord[] = []
    const card: CardRecord[] = [
      {
        id: 'card-cafe',
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
  })

  // =========================================================================
  // TESTE 6: Várias compras do mesmo estabelecimento (Starlink {78, 249, 1.199})
  // em ordem trocada entre as fontes → três verdes
  // =========================================================================
  it('6. Múltiplas compras do mesmo estabelecimento em ordem invertida → 3 GREEN / CONCILIADO', () => {
    const odooRecords: SystemRecord[] = [
      {
        id: 'odoo-star-249',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 249.0,
        total: 249.0,
        debito: null,
      },
      {
        id: 'odoo-star-78',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 78.0,
        total: 78.0,
        debito: null,
      },
      {
        id: 'odoo-star-1199',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 1199.0,
        total: 1199.0,
        debito: null,
      },
    ]

    const cardRecords: CardRecord[] = [
      {
        id: 'card-star-78',
        data: '10/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 78.0,
      },
      {
        id: 'card-star-249',
        data: '15/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 249.0,
      },
      {
        id: 'card-star-1199',
        data: '20/06/2026',
        estabelecimento: 'DL *Starlink Brazil',
        valor: 1199.0,
      },
    ]

    const results = reconcileData(odooRecords, cardRecords, 'itau')
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
    expect(results.every((r) => r.classificacao === 'CONCILIADO')).toBe(true)
    expect(results.every((r) => r.diferenca === 0)).toBe(true)
  })

  // =========================================================================
  // TESTE 7: Compras de mesmo valor em estabelecimentos diferentes → NÃO associar
  // =========================================================================
  it('7. Compras de mesmo valor em estabelecimentos não relacionados NÃO devem ser associadas', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-drogaria',
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
    expect(results.some((r) => r.status === 'GREEN')).toBe(false)
    expect(results).toHaveLength(2)
    expect(results.some((r) => r.classificacao === 'SOMENTE_SISTEMA')).toBe(true)
    expect(results.some((r) => r.classificacao === 'SOMENTE_FATURA')).toBe(true)
  })

  // =========================================================================
  // TESTE 8: Datas diferentes entre compra e contabilização
  // =========================================================================
  it('8. Datas diferentes entre compra (10/06) e competência contábil (01/07) devem conciliar', () => {
    const sys: SystemRecord[] = [
      {
        id: 'sys-posto',
        data: '01/07/2026',
        parceiro: 'POSTO IPIRANGA MORUMBI',
        credito: 250.0,
        total: 250.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'card-posto',
        data: '10/06/2026',
        estabelecimento: 'POSTO IPIRANGA MORUMBI',
        valor: 250.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
  })

  // =========================================================================
  // TESTE 9: Valores brasileiros com vírgula decimal e formatos mistos
  // =========================================================================
  it('9. Formatação e normalização de valores brasileiros e internacionais', () => {
    expect(normalizeMoneyValue('R$ 1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1.954,12')).toBe(1954.12)
    expect(normalizeMoneyValue('1954.12')).toBe(1954.12)
    expect(normalizeMoneyValue('1,114.06')).toBe(1114.06)
    expect(normalizeMoneyValue('R$ 1,114.06')).toBe(1114.06)
    expect(normalizeMoneyValue('-R$ 18,75')).toBe(-18.75)
    expect(normalizeMoneyValue('(18,75)')).toBe(-18.75)
  })

  // =========================================================================
  // TESTE 10: Estornos e valores negativos
  // =========================================================================
  it('10. Estornos negativos preservam sinal e classificam corretamente', () => {
    const sys: SystemRecord[] = []
    const card: CardRecord[] = [
      {
        id: 'card-estorno',
        data: '08/06/2026',
        estabelecimento: 'ESTORNO DE ANUIDADE DIFERENCIADA',
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
  // TESTE 11: Compras internacionais
  // =========================================================================
  it('11. Compras internacionais comparam pelo valor convertido em reais da fatura', () => {
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
        moedaGlobal: 'US$20,00',
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
  // TESTE 12 & 13: PDF com várias páginas, cabeçalhos repetidos e resumos
  // =========================================================================
  it('12 & 13. Conversor de Fatura PDF lida com múltiplas páginas e descarta resumos/rodapés', async () => {
    // Simula PDF sintético com 2 páginas contendo cabeçalhos e resumo
    const fakePdfText = `
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >>
stream
BT
/F1 10 Tf
(RESUMO DA FATURA) Tj
(Total da fatura: R$ 38.706,94) Tj
(10/06 SWIFT PIRACUAMA R$ 1.954,12) Tj
(12/06 DL *Starlink Brazil R$ 1.199,00) Tj
ET
endstream
endobj
4 0 obj << /Type /Page /Parent 2 0 R >>
stream
BT
/F1 10 Tf
(PRODUTOS, SERVICOS E ENCARGOS) Tj
(Encargos desta fatura: R$ 0,00) Tj
(15/06 OPENAI *CHATGPT SUBSCR R$ 108,40) Tj
(Total de lancamentos nacionais: R$ 3.261,52) Tj
ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`

    const encoder = new TextEncoder()
    const pdfBuffer = encoder.encode(fakePdfText).buffer

    const convResult = await convertInvoicePdfToExcel(pdfBuffer, 'fatura_itau_teste.pdf')
    expect(convResult.sucesso).toBe(true)
    expect(convResult.registros.length).toBeGreaterThanOrEqual(3)

    // Nenhum termo de resumo deve ter sido aceito como lançamento
    const hasSummaryAsRecord = convResult.registros.some((r) =>
      /resumo|encargos|total\s+da\s+fatura/i.test(r.descricaoOriginal),
    )
    expect(hasSummaryAsRecord).toBe(false)
  })

  // =========================================================================
  // TESTE 14 & 15: Linhas ilegíveis e prevenção de duplicações indevidas
  // =========================================================================
  it('14 & 15. Prevenção de duplicações indevidas mantendo repetições legítimas', () => {
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
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
  })

  // =========================================================================
  // TESTE 16: Arquivos com registros em ordens diferentes (Invariância à ordem)
  // =========================================================================
  it('16. Resultados são invariantes à ordem em que as fontes foram lidas', () => {
    const listA_sys: SystemRecord[] = [
      { id: 's1', data: '01/07/2026', parceiro: 'ALFA', credito: 100, debito: null },
      { id: 's2', data: '01/07/2026', parceiro: 'BETA', credito: 200, debito: null },
    ]
    const listA_card: CardRecord[] = [
      { id: 'c1', data: '10/06/2026', estabelecimento: 'ALFA', valor: 100 },
      { id: 'c2', data: '10/06/2026', estabelecimento: 'BETA', valor: 200 },
    ]

    const res1 = reconcileData(listA_sys, listA_card, 'itau')

    // Invertendo as ordens de entrada
    const res2 = reconcileData([...listA_sys].reverse(), [...listA_card].reverse(), 'itau')

    expect(res1.length).toBe(res2.length)
    expect(res1.map((r) => r.credito)).toEqual(res2.map((r) => r.credito))
    expect(res1.map((r) => r.status)).toEqual(res2.map((r) => r.status))
  })

  // =========================================================================
  // TESTE 17: Exportação do Excel convertido (.xlsx real com as 2 abas)
  // =========================================================================
  it('17. Gerador de XLSX produz planilha real contendo as abas Transações e Resumo', async () => {
    const sheet1 = {
      name: 'Transacoes',
      headers: ['Data', 'Estabelecimento', 'Valor (R$)'],
      rows: [['23/06/2026', 'SWIFT PIRACUAMA', 1954.12]],
    }
    const sheet2 = {
      name: 'Resumo da Extração',
      headers: ['Campo', 'Valor'],
      rows: [['Total Transações', 1]],
    }

    const blob = generateXlsxBlob([sheet1, sheet2])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(100)

    // Validação de integridade do arquivo ZIP interno
    const arrayBuffer = await blob.arrayBuffer()
    const extracted = await extractZip(arrayBuffer)

    expect(extracted.has('xl/workbook.xml')).toBe(true)
    expect(extracted.has('xl/worksheets/sheet1.xml')).toBe(true)
    expect(extracted.has('xl/worksheets/sheet2.xml')).toBe(true)
  })

  // =========================================================================
  // TESTE 18: Exportação da conciliação (CSV e indicadores do dashboard)
  // =========================================================================
  it('18. Exportação da conciliação e indicadores globais do Dashboard', () => {
    const sys: SystemRecord[] = [
      { id: 's1', data: '01/07/2026', parceiro: 'SWIFT', credito: 1954.12, debito: null },
      { id: 's2', data: '01/07/2026', parceiro: 'STARLINK', credito: 1199.0, debito: null },
      { id: 's3', data: '01/07/2026', parceiro: 'EXCLUSIVO ODOO', credito: 500.0, debito: null },
    ]
    const card: CardRecord[] = [
      { id: 'c1', data: '23/06/2026', estabelecimento: 'SWIFT', valor: 1954.12 },
      { id: 'c2', data: '12/06/2026', estabelecimento: 'STARLINK', valor: 1199.0 },
      { id: 'c3', data: '15/06/2026', estabelecimento: 'EXCLUSIVO FATURA', valor: 300.0 },
    ]

    const results = reconcileData(sys, card, 'itau')
    const metrics = calculateReconciliationMetrics(results, sys.length, card.length)

    expect(metrics.paresConciliados).toBe(2)
    expect(metrics.somenteSistema).toBe(1)
    expect(metrics.somenteFatura).toBe(1)
    expect(metrics.totalValorSistema).toBe(3653.12) // 1954.12 + 1199 + 500
    expect(metrics.totalValorFatura).toBe(3453.12) // 1954.12 + 1199 + 300
    expect(metrics.diferencaTotal).toBe(-200.0) // 3453.12 - 3653.12

    const validation = validateExport(results, sys, card)
    expect(validation.isValid).toBe(true)

    const csvOutput = generateExportCSV(results)
    expect(csvOutput).toContain('SWIFT')
    expect(csvOutput).toContain('STARLINK')
  })
})
