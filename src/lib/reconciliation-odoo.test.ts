import { describe, it, expect } from 'vitest'
import {
  normalizeEntityName,
  calculateNameSimilarity,
  normalizeMoneyValue,
  calculateDateDifferenceInDays,
} from './normalization'
import {
  reconcileData,
  calculateReconciliationMetrics,
  generateAdherenceReport,
} from './reconciliation'
import {
  convertInvoicePdfToExcel,
  convertInvoiceSpreadsheetToExcel,
} from './pdf-to-excel-converter'
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
    // Exemplo estrito da diretriz técnica do usuário:
    expect(normalizeMoneyValue('R$ 1.234,56')).toBe(1234.56)
    expect(normalizeMoneyValue('1.234,56')).toBe(1234.56)
    expect(normalizeMoneyValue('1234,56')).toBe(1234.56)
    expect(normalizeMoneyValue('1.234')).toBe(1234.0)
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
    expect(metrics.correspondenciasExatas).toBe(2)
    expect(metrics.somenteSistema).toBe(1)
    expect(metrics.somenteFatura).toBe(1)
    expect(metrics.totalValorSistema).toBe(3653.12) // 1954.12 + 1199 + 500
    expect(metrics.totalValorFatura).toBe(3453.12) // 1954.12 + 1199 + 300
    expect(metrics.totalValorConciliadoSistema).toBe(3153.12)
    expect(metrics.totalValorConciliadoFatura).toBe(3153.12)
    expect(metrics.totalValorExclusivoSistema).toBe(500.0)
    expect(metrics.totalValorExclusivoFatura).toBe(300.0)
    expect(metrics.diferencaTotal).toBe(-200.0) // 3453.12 - 3653.12

    const validation = validateExport(results, sys, card)
    expect(validation.isValid).toBe(true)

    const csvOutput = generateExportCSV(results)
    expect(csvOutput).toContain('SWIFT')
    expect(csvOutput).toContain('STARLINK')
  })

  // =========================================================================
  // TESTES DE DIAGNÓSTICO (CAUSAS 1, 2 E 3 RESOLVIDAS)
  // =========================================================================

  // CAUSA 1: Linhas de fatura em blocos adjacentes/quebrados e com colunas extras (IOF/cotação/parcelamento)
  it('19. Extração de fatura com linhas em blocos separados (data, descrição, valor) e colunas intermediárias', async () => {
    // Simula PDF onde o extrator nativo/PDF.js separou data na linha 1, descrição na linha 2, cotação na linha 3 e valor na linha 4
    const fakePdfText = `
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >>
stream
BT
/F1 10 Tf
(15/06) Tj
(OPENAI *CHATGPT SUBSCR) Tj
(USD 20,00) Tj
(Cotacao R$ 5,42) Tj
(R$ 108,40) Tj
(23/06) Tj
(SWIFT PIRACUAMA) Tj
(Parcela 01/01) Tj
(R$ 1.954,12) Tj
(12/06) Tj
(DL *Starlink Brazil) Tj
(1.199,00) Tj
ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`

    const encoder = new TextEncoder()
    const pdfBuffer = encoder.encode(fakePdfText).buffer

    const convResult = await convertInvoicePdfToExcel(pdfBuffer, 'fatura_itau_blocos.pdf')
    expect(convResult.sucesso).toBe(true)
    expect(convResult.registros.length).toBe(3)

    const swift = convResult.registros.find((r) => r.nomeNormalizado.includes('SWIFT'))
    expect(swift).toBeDefined()
    expect(swift?.valorReais).toBe(1954.12)
    expect(swift?.data).toBe('23/06/2026')

    const starlink = convResult.registros.find((r) => r.nomeNormalizado.includes('STARLINK'))
    expect(starlink).toBeDefined()
    expect(starlink?.valorReais).toBe(1199.0)

    const openai = convResult.registros.find((r) => r.nomeNormalizado.includes('OPENAI'))
    expect(openai).toBeDefined()
    expect(openai?.valorReais).toBe(108.4)
  })

  // CAUSA 2: Fatura recebida como planilha .xlsx ou .csv alimentando a conciliação
  it('20. Fatura recebida como .xlsx/.csv é processada e alimenta a conciliação corretamente', async () => {
    // Cria uma planilha XLSX de fatura com colunas Data, Descrição, Valor em Reais
    const invoiceSheet = {
      name: 'Fatura Cartao',
      headers: ['Data', 'Estabelecimento', 'Valor em Reais (R$)', 'Portador'],
      rows: [
        ['23/06/2026', 'SWIFT PIRACUAMA', 1954.12, 'DIRETORIA'],
        ['12/06/2026', 'DL *Starlink Brazil', 1199.0, 'TI'],
      ],
    }

    const xlsxBlob = generateXlsxBlob([invoiceSheet])
    const arrayBuffer = await xlsxBlob.arrayBuffer()

    const convResult = await convertInvoicePdfToExcel(arrayBuffer, 'fatura_cartao_itau.xlsx')
    expect(convResult.sucesso).toBe(true)
    expect(convResult.registros).toHaveLength(2)
    expect(convResult.resumo.totalValorReais).toBe(3153.12)

    // Alimenta o motor de conciliação
    const mappedCards: CardRecord[] = convResult.registros.map((r) => ({
      id: r.id,
      data: r.data,
      estabelecimento: r.descricaoOriginal,
      valor: r.valorReais,
    }))

    const sysRecords: SystemRecord[] = [
      {
        id: 'sys-swift',
        data: '01/07/2026',
        parceiro: 'SWIFT PIRACUAMA',
        credito: 1954.12,
        total: 1954.12,
        debito: null,
      },
      {
        id: 'sys-starlink',
        data: '01/07/2026',
        parceiro: 'STARLINK BRAZIL SERVICOS DE INTERNET LTDA.',
        credito: 1199.0,
        total: 1199.0,
        debito: null,
      },
    ]

    const reconciled = reconcileData(sysRecords, mappedCards, 'itau')
    expect(reconciled).toHaveLength(2)
    expect(reconciled.every((r) => r.status === 'GREEN')).toBe(true)
    expect(reconciled[0].valorFatura).toBeGreaterThan(0)
    expect(reconciled[1].valorFatura).toBeGreaterThan(0)

    const metrics = calculateReconciliationMetrics(
      reconciled,
      sysRecords.length,
      mappedCards.length,
    )
    expect(metrics.totalValorFatura).toBe(3153.12)
    expect(metrics.totalValorSistema).toBe(3153.12)
    expect(metrics.diferencaTotal).toBe(0)
  })

  // CAUSA 3: PDF sem transações detectadas gera erro explícito e impede conciliação com fatura zerada
  it('21. PDF sem transações gera aviso explícito e bloqueia avanço', async () => {
    // PDF apenas com rodapés e aviso legal, sem nenhuma transação
    const fakeEmptyPdfText = `
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >>
stream
BT
/F1 10 Tf
(RESUMO DA FATURA) Tj
(Central de Atendimento 0800 123 4567) Tj
(Ouvidoria 0800 765 4321) Tj
ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`

    const encoder = new TextEncoder()
    const pdfBuffer = encoder.encode(fakeEmptyPdfText).buffer

    const convResult = await convertInvoicePdfToExcel(pdfBuffer, 'fatura_vazia.pdf')
    expect(convResult.sucesso).toBe(false)
    expect(convResult.registros).toHaveLength(0)
    expect(convResult.resumo.totalValorReais).toBe(0)
    expect(convResult.erroCritico).toBeDefined()
    expect(convResult.erroCritico).toMatch(/nenhum lançamento identificado/i)
  })

  // =========================================================================
  // TESTES ESPECÍFICOS DE REGRESSÃO COM DADOS SINTÉTICOS (PADRÕES ESTRUTURAIS)
  // =========================================================================

  // Teste A: Família Marketplace com token truncado e variações (Padrão Estrutural 1)
  it('27. Família Marketplace com token truncado casa pelo token distintivo do vendedor sem inflar por "Mercado Livre"', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-seller-1',
        data: '15/06/2026',
        parceiro: 'MERCADO LIVRE - EMBALAGENS DONA BRANCA LTDA',
        credito: 55.4,
        total: 55.4,
        debito: null,
      },
      {
        id: 's-seller-2',
        data: '15/06/2026',
        parceiro: 'MERCADO LIVRE - PAPELARIA BRASIL CENTRAL',
        credito: 80.0,
        total: 80.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-seller-1',
        data: '15/06/2026',
        estabelecimento: 'MERCADO*DONABRANCA',
        valor: 55.4,
      },
      {
        id: 'c-seller-2',
        data: '15/06/2026',
        estabelecimento: 'MERCADOLIVRE*PAPELARI',
        valor: 80.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
    expect(results.every((r) => r.classificacao === 'CONCILIADO')).toBe(true)

    const match1 = results.find((r) => r.estabelecimento === 'MERCADO*DONABRANCA')
    expect(match1?.parceiro).toBe('MERCADO LIVRE - EMBALAGENS DONA BRANCA LTDA')

    const match2 = results.find((r) => r.estabelecimento === 'MERCADOLIVRE*PAPELARI')
    expect(match2?.parceiro).toBe('MERCADO LIVRE - PAPELARIA BRASIL CENTRAL')
  })

  // Teste B: Parceiro genérico sem vendedor no Odoo com valor único (Padrão 1)
  it('28. Parceiro genérico "Mercado Livre" no Odoo com valor único casa com a fatura', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-gen-ml',
        data: '01/06/2026',
        parceiro: 'Mercado Livre',
        credito: 19.99,
        total: 19.99,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-token-ml',
        data: '01/06/2026',
        estabelecimento: 'MERCADOLIVRE*XPTOSTORE',
        valor: 19.99,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].diferenca).toBe(0)
  })

  // Teste C: Pela nova regra da usuária: casos ambíguos com valor idêntico (diferença R$ 0,00) viram VERDE (CONCILIADO)
  // Já casos ambíguos com valores diferentes continuam CINZA
  it('29. Casos ambíguos com valor idêntico viram VERDE (conciliado) e com valores divergentes continuam CINZA', () => {
    // Caso 1: Ambíguo com valor idêntico -> VERDE
    const sysEqual: SystemRecord[] = [
      {
        id: 's-comp-1',
        data: '10/06/2026',
        parceiro: 'Mercado Livre',
        credito: 49.9,
        total: 49.9,
        debito: null,
      },
      {
        id: 's-comp-2',
        data: '10/06/2026',
        parceiro: 'Mercado Livre',
        credito: 49.9,
        total: 49.9,
        debito: null,
      },
    ]

    const cardEqual: CardRecord[] = [
      {
        id: 'c-comp-1',
        data: '10/06/2026',
        estabelecimento: 'MERCADOLIVRE*LOJAA',
        valor: 49.9,
      },
      {
        id: 'c-comp-2',
        data: '10/06/2026',
        estabelecimento: 'MERCADOLIVRE*LOJAB',
        valor: 49.9,
      },
    ]

    const resultsEqual = reconcileData(sysEqual, cardEqual, 'itau')
    // Pela regra da usuária: valor igual resolve a ambiguidade -> VERDE
    const greenMatches = resultsEqual.filter((r) => r.status === 'GREEN')
    expect(greenMatches.length).toBeGreaterThanOrEqual(1)
    expect(greenMatches.every((r) => r.classificacao === 'CONCILIADO')).toBe(true)
    expect(greenMatches.every((r) => r.diferenca === 0)).toBe(true)

    // Caso 2: Ambíguo com valores divergentes (ex: diferença de R$ 3,00 e nomes parcialmente semelhantes) -> CINZA
    const sysDiff: SystemRecord[] = [
      {
        id: 's-ambig-diff',
        data: '10/06/2026',
        parceiro: 'LOJA TESTE BRASIL COMERCIO',
        credito: 100.0,
        total: 100.0,
        debito: null,
      },
    ]
    const cardDiff: CardRecord[] = [
      {
        id: 'c-ambig-diff',
        data: '10/06/2026',
        estabelecimento: 'LOJA TESTE PRODUTOS',
        valor: 103.5, // Diferença R$ 3,50, nameSim moderado
      },
    ]
    const resultsDiff = reconcileData(sysDiff, cardDiff, 'itau')
    const grayMatches = resultsDiff.filter((r) => r.status === 'GRAY')
    expect(grayMatches).toHaveLength(1)
    expect(grayMatches[0].classificacao).toBe('POSSIVEL_CORRESPONDENCIA')
    expect(grayMatches[0].diferenca).toBe(3.5)
  })

  // Teste D: Pares com nomes totalmente distintos e valor único em cada fonte (Padrão 3)
  it('30. Pares com nomes comerciais distintos e valor único em cada fonte são propostos com segurança', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-uniq-partner',
        data: '20/06/2026',
        parceiro: 'DISTRIBUIDORA NACIONAL DE INSUMOS LTDA',
        credito: 4321.87,
        total: 4321.87,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-uniq-card',
        data: '15/06/2026',
        estabelecimento: 'INSUTECH BR',
        valor: 4321.87,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].valorFatura).toBe(4321.87)
    expect(results[0].credito).toBe(4321.87)
  })

  // Teste E: Leitura de anotações manuais e geração de Relatório de Aderência
  it('31. Relatório de Aderência à conferência manual detecta concordâncias e discordâncias', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-annot-1',
        data: '01/07/2026',
        parceiro: 'FORNECEDOR EXCLUSIVO',
        credito: 150.0,
        total: 150.0,
        debito: null,
        observacaoManual: 'Apenas odoo',
      },
      {
        id: 's-annot-2',
        data: '01/07/2026',
        parceiro: 'PARCEIRO COMUM LTDA',
        credito: 300.0,
        total: 300.0,
        debito: null,
        // Sem anotação: esperado conciliar
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-annot-2',
        data: '15/06/2026',
        estabelecimento: 'PARCEIRO COMUM LTDA',
        valor: 300.0,
      },
      {
        id: 'c-annot-3',
        data: '15/06/2026',
        estabelecimento: 'COMPRA AVULSA FATURA',
        valor: 99.0,
        observacaoManual: 'Apenas Fatura',
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    const adherence = generateAdherenceReport(results)

    expect(adherence.hasAnnotations).toBe(true)
    expect(adherence.totalItensComAnotacao).toBe(2)
    // Os concordantes devem incluir o comum (verde) e os dois exclusivos anotados
    expect(adherence.totalConcordantes).toBe(3)
    expect(adherence.taxaAderenciaPercentual).toBe(100)
  })

  // Teste F: Checksum de total no Odoo e na fatura sem descartar compras legítimas
  it('32. Linha de total no rodapé é excluída sem descartar compras legítimas e checksum é verificado', async () => {
    const odooRows = [
      ['Data', 'Número', 'Parceiro', 'Referência', 'Diário', 'Total'],
      ['01/06/2026', 'CIT1', 'FORNECEDOR A', '100', 'DIARIO', '100.00'],
      ['02/06/2026', 'CIT2', 'FORNECEDOR B', '101', 'DIARIO', '200.00'],
      ['', '', '', '', '', '300.00'], // Linha de total
    ]

    const odooBlob = generateXlsxBlob([
      { name: 'Sheet1', headers: odooRows[0], rows: odooRows.slice(1) },
    ])
    const odooBuffer = await odooBlob.arrayBuffer()
    const odooRes = await importOdooFile(odooBuffer, 'odoo_teste.xlsx')

    expect(odooRes.sucesso).toBe(true)
    // Apenas 2 registros legítimos
    expect(odooRes.registros).toHaveLength(2)
    expect(odooRes.totalMonetario).toBe(300.0)
    expect(odooRes.totalDeclaradoChecksum).toBe(300.0)
    expect(odooRes.divergenciaChecksum).toBe(0)
  })

  // =========================================================================
  // TESTES DE AUDITORIA COMPLETA (EXIGÊNCIAS DO ITEM 8)
  // =========================================================================

  it('22. Invariância estrita à ordem aleatória (shuffle determinism)', () => {
    const originalSys: SystemRecord[] = [
      { id: 's1', data: '01/07/2026', parceiro: 'SWIFT PIRACUAMA', credito: 1954.12, debito: null },
      { id: 's2', data: '01/07/2026', parceiro: 'STARLINK BRAZIL', credito: 1199.0, debito: null },
      { id: 's3', data: '01/07/2026', parceiro: 'OPENAI LLC', credito: 108.4, debito: null },
      {
        id: 's4',
        data: '01/07/2026',
        parceiro: 'AMAZON WEB SERVICES',
        credito: 500.0,
        debito: null,
      },
      { id: 's5', data: '01/07/2026', parceiro: 'UBER DO BRASIL', credito: 35.5, debito: null },
      {
        id: 's6',
        data: '01/07/2026',
        parceiro: 'AUTENTIQUE TECNOLOGIA',
        credito: 200.0,
        debito: null,
      },
    ]

    const originalCard: CardRecord[] = [
      { id: 'c1', data: '23/06/2026', estabelecimento: 'SWIFT PIRACUAMA', valor: 1954.12 },
      { id: 'c2', data: '12/06/2026', estabelecimento: 'DL *Starlink Brazil', valor: 1199.0 },
      { id: 'c3', data: '05/06/2026', estabelecimento: 'OPENAI *CHATGPT SUBSCR', valor: 108.4 },
      { id: 'c4', data: '20/06/2026', estabelecimento: 'AMAZON WEB SERVICES', valor: 525.5 }, // Divergente
      { id: 'c5', data: '05/06/2026', estabelecimento: 'UBER *TRIP', valor: 35.5 },
      { id: 'c6', data: '18/06/2026', estabelecimento: 'AUTENTIQUE TECNOLOGIA', valor: 200.0 },
    ]

    const baseline = reconcileData(originalSys, originalCard, 'itau')

    // Executa com 5 permutações pseudo-aleatórias diferentes
    const shuffle = <T>(arr: T[], seed: number): T[] => {
      const copy = [...arr]
      let m = copy.length
      let s = seed
      while (m) {
        s = (s * 9301 + 49297) % 233280
        const rnd = s / 233280
        const i = Math.floor(rnd * m--)
        const t = copy[m]
        copy[m] = copy[i]
        copy[i] = t
      }
      return copy
    }

    for (let seed = 1; seed <= 5; seed++) {
      const shuffledSys = shuffle(originalSys, seed * 17)
      const shuffledCard = shuffle(originalCard, seed * 31)

      const shuffledResult = reconcileData(shuffledSys, shuffledCard, 'itau')

      expect(shuffledResult.length).toBe(baseline.length)
      // Mesmas associações e mesmos status independentemente da ordem
      const baselinePairs = baseline.map(
        (r) => `${r.estabelecimento}|${r.parceiro}|${r.status}|${r.diferenca}`,
      )
      const shuffledPairs = shuffledResult.map(
        (r) => `${r.estabelecimento}|${r.parceiro}|${r.status}|${r.diferenca}`,
      )
      expect(shuffledPairs).toEqual(baselinePairs)
    }
  })

  it('23. Não associar estabelecimentos não correlacionados com valores iguais (prevenção de falsos positivos)', () => {
    // 3 compras de R$ 89,90 com estabelecimentos completamente diferentes
    const sys: SystemRecord[] = [
      {
        id: 's-farmacia',
        data: '10/06/2026',
        parceiro: 'FARMACIA RAIA DROGASIL',
        credito: 89.9,
        debito: null,
      },
      {
        id: 's-estaciona',
        data: '10/06/2026',
        parceiro: 'ESTAPAR ESTACIONAMENTOS',
        credito: 89.9,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      { id: 'c-padaria', data: '10/06/2026', estabelecimento: 'PADARIA REAL SANTANA', valor: 89.9 },
      { id: 'c-pet', data: '10/06/2026', estabelecimento: 'PETZ CENTRO VETERINARIO', valor: 89.9 },
    ]

    const results = reconcileData(sys, card, 'itau')
    // Nenhum par deve ser marcado como GREEN (conciliado)
    const greens = results.filter((r) => r.status === 'GREEN')
    expect(greens).toHaveLength(0)

    // Devem constar como exclusivos (RED)
    expect(results.filter((r) => r.status === 'RED')).toHaveLength(4)
  })

  it('24. Compras repetidas de mesmo valor e mesmo estabelecimento casam 1 a 1 sem omitir nem duplicar', () => {
    // 3 corridas de Uber no mesmo dia de R$ 25,00
    const sys: SystemRecord[] = [
      { id: 's-u1', data: '15/06/2026', parceiro: 'UBER DO BRASIL', credito: 25.0, debito: null },
      { id: 's-u2', data: '15/06/2026', parceiro: 'UBER DO BRASIL', credito: 25.0, debito: null },
      { id: 's-u3', data: '15/06/2026', parceiro: 'UBER DO BRASIL', credito: 25.0, debito: null },
    ]

    const card: CardRecord[] = [
      { id: 'c-u1', data: '15/06/2026', estabelecimento: 'UBER *TRIP', valor: 25.0 },
      { id: 'c-u2', data: '15/06/2026', estabelecimento: 'UBER *TRIP', valor: 25.0 },
      { id: 'c-u3', data: '15/06/2026', estabelecimento: 'UBER *TRIP', valor: 25.0 },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
    expect(results.every((r) => r.origem === 'AMBOS')).toBe(true)

    // Unicidade estrita: cada ID do Odoo e cada ID da fatura deve aparecer exatamente uma vez
    const usedSysIds = new Set(results.map((r) => r.id.split('-')[1]))
    const usedCardIds = new Set(results.map((r) => r.id.split('-')[2]))
    expect(usedSysIds.size).toBe(3)
    expect(usedCardIds.size).toBe(3)
  })

  it('25. Arquivos com quantidades desiguais preservam todos os resíduos com auditoria 100%', () => {
    // 4 registros no Odoo, 2 na fatura
    const sys: SystemRecord[] = [
      { id: 's1', data: '01/07/2026', parceiro: 'SWIFT PIRACUAMA', credito: 1954.12, debito: null },
      { id: 's2', data: '01/07/2026', parceiro: 'STARLINK BRAZIL', credito: 1199.0, debito: null },
      {
        id: 's3',
        data: '01/07/2026',
        parceiro: 'HONORARIOS ADVOCATICIOS',
        credito: 3500.0,
        debito: null,
      },
      {
        id: 's4',
        data: '01/07/2026',
        parceiro: 'TARIFAS BANCARIAS DIVERSAS',
        credito: 150.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      { id: 'c1', data: '23/06/2026', estabelecimento: 'SWIFT PIRACUAMA', valor: 1954.12 },
      { id: 'c2', data: '12/06/2026', estabelecimento: 'DL *Starlink Brazil', valor: 1199.0 },
    ]

    const results = reconcileData(sys, card, 'itau')
    // Esperado: 2 conciliados + 2 somente sistema = 4 registros na tabela
    expect(results).toHaveLength(4)
    expect(results.filter((r) => r.status === 'GREEN')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'RED' && r.origem === 'SISTEMA')).toHaveLength(2)

    const metrics = calculateReconciliationMetrics(results, sys.length, card.length)
    expect(metrics.totalRegistrosSistema).toBe(4)
    expect(metrics.totalRegistrosFatura).toBe(2)
    expect(metrics.paresConciliados).toBe(2)
    expect(metrics.somenteSistema).toBe(2)
    expect(metrics.somenteFatura).toBe(0)
    expect(metrics.totalValorSistema).toBe(6803.12)
    expect(metrics.totalValorFatura).toBe(3153.12)
    expect(metrics.diferencaTotal).toBe(-3650.0)

    const validation = validateExport(results, sys, card)
    expect(validation.isValid).toBe(true)
  })

  it('26. Dados incompletos e ausência de campos auxiliares não quebram o fluxo', () => {
    const sys: SystemRecord[] = [
      { id: 's-incomp', data: '', parceiro: 'PÃO DE AÇÚCAR', credito: 120.5, debito: null },
    ]

    const card: CardRecord[] = [
      { id: 'c-incomp', data: '', estabelecimento: 'PAO DE ACUCAR', valor: 120.5 },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].credito).toBe(120.5)
    expect(results[0].valorFatura).toBe(120.5)
  })

  // Testes de regressão específicos solicitados pelo ajuste do usuário:
  it('33. Intermediador "Vindi *LojaNetlab": token real é "lojanetlab" e casa com "LOJANETLAB COMERCIO"', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-netlab',
        data: '15/06/2026',
        parceiro: 'LOJANETLAB EQUIPAMENTOS E MATERIAIS LTDA',
        credito: 450.0,
        total: 450.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-netlab',
        data: '15/06/2026',
        estabelecimento: 'Vindi *LojaNetlab',
        valor: 450.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('GREEN')
    expect(results[0].classificacao).toBe('CONCILIADO')
    expect(results[0].parceiro).toBe('LOJANETLAB EQUIPAMENTOS E MATERIAIS LTDA')
    expect(results[0].estabelecimento).toBe('Vindi *LojaNetlab')
  })

  it('34. "Vindi *LojaNetlab" NÃO casa como verde com parceiro não relacionado quando há concorrente de valor próximo', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-outro',
        data: '15/06/2026',
        parceiro: 'CONSTRUTORA E REFORMAS LTDA',
        credito: 450.0,
        total: 450.0,
        debito: null,
      },
      {
        id: 's-outro2',
        data: '15/06/2026',
        parceiro: 'CONSULTORIA FINANCEIRA',
        credito: 452.0, // Concorrente com valor próximo (R$ 452 vs R$ 450)
        total: 452.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-vindi',
        data: '15/06/2026',
        estabelecimento: 'Vindi *LojaNetlab',
        valor: 450.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    // Não deve casar como verde direto por valor sem afinidade de nome com concorrente de valor próximo
    const vindiMatch = results.find((r) => r.estabelecimento === 'Vindi *LojaNetlab')
    expect(vindiMatch).toBeDefined()
    // Como há concorrência de valor próximo e os nomes não compartilham token, deve ir para cinza (revisão) ou não casar com verde
    expect(vindiMatch?.status).toBe('GRAY')
    expect(vindiMatch?.classificacao).toBe('POSSIVEL_CORRESPONDENCIA')
  })

  it('35. Intermediadores conhecidos (Cielo, PagSeguro, Stone, Getnet, Rede, Mercado Pago) extraem o vendedor real', () => {
    const sys: SystemRecord[] = [
      {
        id: 's-cielo',
        data: '10/06/2026',
        parceiro: 'FARMACIA SAO BENTO LTDA',
        credito: 85.0,
        total: 85.0,
        debito: null,
      },
      {
        id: 's-stone',
        data: '11/06/2026',
        parceiro: 'LANCHONETE BOM SABOR ME',
        credito: 42.5,
        total: 42.5,
        debito: null,
      },
      {
        id: 's-pagseguro',
        data: '12/06/2026',
        parceiro: 'PAPELARIA ESCOLAR CENTRAL LTDA',
        credito: 110.0,
        total: 110.0,
        debito: null,
      },
    ]

    const card: CardRecord[] = [
      {
        id: 'c-cielo',
        data: '10/06/2026',
        estabelecimento: 'CIELO *Farmacia Sao Bento',
        valor: 85.0,
      },
      {
        id: 'c-stone',
        data: '11/06/2026',
        estabelecimento: 'STONE *Lanchonete Bom Sabor',
        valor: 42.5,
      },
      {
        id: 'c-pagseguro',
        data: '12/06/2026',
        estabelecimento: 'PAGSEGURO *Papelaria Escolar',
        valor: 110.0,
      },
    ]

    const results = reconcileData(sys, card, 'itau')
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.status === 'GREEN')).toBe(true)
    expect(results.every((r) => r.classificacao === 'CONCILIADO')).toBe(true)
  })
})
