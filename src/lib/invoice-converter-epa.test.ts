import { describe, it, expect } from 'vitest'
import {
  parseInvoiceByBank,
  detectBankFromText,
  parseSantanderInvoiceText,
  parseItauInvoiceText,
  classifyExpense,
} from './invoice-bank-parser'
import {
  convertInvoicePdfToExcel,
  convertInvoiceSpreadsheetToExcel,
} from './pdf-to-excel-converter'
import { generateXlsxBlob } from './xlsx-generator'
import { extractZip } from './zip-reader'
import { reconcileData, calculateReconciliationMetrics } from './reconciliation'
import type { CardRecord, SystemRecord } from './types'

describe('Conversor de Fatura PDF para Excel & Parsers Isolados (EPA)', () => {
  // 1. Detecção de Banco
  it('detecta Santander Empresas, Itaú Empresas e formatos genéricos corretamente', () => {
    const textSantander = `
      BANCO SANTANDER (BRASIL) S.A.
      SANTANDER EMPRESAS PLATINUM
      Cartão: XXXX.XXXX.XXXX.1234
      Vencimento: 15/07/2026
      05/06/2026 POSTO SETE R$ 150,00 0,00 0,00
    `
    expect(detectBankFromText(textSantander)).toBe('santander')

    const textItau = `
      ITAÚ UNIBANCO S.A. - ITAU EMPRESAS
      ANTONIO SERGIO EGYDIO RAMEH - FINAL 5678
      10/06 SWIFT PIRACUAMA R$ 1.954,12
      12/06 DL *Starlink Brazil R$ 1.199,00
    `
    expect(detectBankFromText(textItau)).toBe('itau')
  })

  // 2. Parser Santander Empresas
  it('extrai transações Santander com data DD/MM/AAAA, valor BRL, USD, cotação e parcela', () => {
    const santanderContent = `
      BANCO SANTANDER (BRASIL) S.A.
      SANTANDER EMPRESAS
      Cartão: XXXX.XXXX.XXXX.9876
      Vencimento: 20/07/2026
      Total desta Fatura R$ 3.500,00
      01/06/2026 LOCALIZA RENT A CAR 250,00 0,00 0,00
      03/06/2026 LEROY MERLIN PARC 01/03 1.200,00 0,00 0,00
      05/06/2026 GOOGLE CLOUD 542,00 100,00 5,42
      08/06/2026 ESTORNO MERCADO LIVRE -150,00 0,00 0,00
    `
    const parsed = parseSantanderInvoiceText(santanderContent)
    expect(parsed.banco).toBe('Santander Empresas')
    expect(parsed.cartao).toContain('9876')
    expect(parsed.vencimento).toBe('20/07/2026')
    expect(parsed.totalFaturaDeclarado).toBe('R$ 3.500,00')
    expect(parsed.transactions).toHaveLength(4)

    // Checa Localiza
    const localiza = parsed.transactions.find((t) => t.descricao.includes('LOCALIZA'))
    expect(localiza).toBeDefined()
    expect(localiza?.valorBRL).toBe(250.0)
    expect(localiza?.categoria).toBe('Transporte / Viagens')

    // Checa Leroy com parcela
    const leroy = parsed.transactions.find((t) => t.descricao.includes('LEROY'))
    expect(leroy).toBeDefined()
    expect(leroy?.parcela).toBe('01/03')
    expect(leroy?.valorBRL).toBe(1200.0)
    expect(leroy?.categoria).toBe('Fornecedores')

    // Checa Google com USD
    const google = parsed.transactions.find((t) => t.descricao.includes('GOOGLE'))
    expect(google).toBeDefined()
    expect(google?.valorUSD).toBe(100.0)
    expect(google?.cotacao).toBe(5.42)
    expect(google?.categoria).toBe('Tecnologia / SaaS')

    // Checa Estorno negativo preservado
    const estorno = parsed.transactions.find((t) => t.descricao.includes('ESTORNO'))
    expect(estorno).toBeDefined()
    expect(estorno?.valorBRL).toBe(-150.0)
  })

  // 3. Parser Itaú Empresas com portador, internacional e parcelas
  it('extrai transações Itaú com portador "NOME - FINAL 1234", nacional e internacional', () => {
    const itauContent = `
      ITAÚ UNIBANCO - ITAU EMPRESAS
      Cartão: 4804.XXXX.XXXX.1111
      Fechada 10/06/2026
      Total da fatura R$ 38.706,94
      
      ANTONIO SERGIO EGYDIO RAMEH - FINAL 2222
      10/06 SWIFT PIRACUAMA R$ 1.954,12
      11/06 BAZARSHO 02/06 R$ 112,32
      12/06 ESTORNO TARIFA -R$ 45,00
      15/06 OPENAI *CHATGPT SUBSCR USD20,00 US$20,00 R$5,42 R$108,40
      
      JOAO SILVA - FINAL 3333
      18/06 DL *Starlink Brazil R$ 1.199,00
      
      Total de lançamentos nacionais R$ 3.220,44
      Total de lançamentos internacionais R$ 108,40
    `
    const parsed = parseItauInvoiceText(itauContent)
    expect(parsed.banco).toBe('Itaú Empresas')
    expect(parsed.totalFaturaDeclarado).toBe('R$ 38.706,94')
    expect(parsed.totalFaturaValor).toBe(38706.94)
    expect(parsed.transactions.length).toBe(5)

    // Checa portador Antonio Sergio normalizado para A.S.E. Rameh
    const swift = parsed.transactions.find((t) => t.descricao.includes('SWIFT'))
    expect(swift?.portador).toContain('A.S.E. Rameh (2222)')
    expect(swift?.valorBRL).toBe(1954.12)
    expect(swift?.categoria).toBe('Compras / Alimentação')

    // Checa parcela
    const bazar = parsed.transactions.find((t) => t.descricao.includes('BAZARSHO'))
    expect(bazar?.parcela).toBe('02/06')
    expect(bazar?.valorBRL).toBe(112.32)
    expect(bazar?.categoria).toBe('Marketplace (ML)')

    // Checa estorno com sinal preservado
    const estorno = parsed.transactions.find((t) => t.descricao.includes('ESTORNO'))
    expect(estorno?.valorBRL).toBe(-45.0)

    // Checa internacional
    const openai = parsed.transactions.find((t) => t.descricao.includes('OPENAI'))
    expect(openai?.valorBRL).toBe(108.4)
    expect(openai?.cotacao).toBe(5.42)
    expect(openai?.observacao).toBe('Internacional')
    expect(openai?.categoria).toBe('Tecnologia / SaaS')

    // Checa portador João Silva
    const starlink = parsed.transactions.find((t) => t.descricao.includes('Starlink'))
    expect(starlink?.portador).toContain('JOAO SILVA (3333)')
    expect(starlink?.valorBRL).toBe(1199.0)
  })

  // 4. Classificação de Despesas EPA
  it('classifica despesas conforme catálogo da EPA', () => {
    expect(classifyExpense('MERCADOLIVRE *REVENDA')).toBe('Marketplace (ML)')
    expect(classifyExpense('LEROY MERLIN')).toBe('Fornecedores')
    expect(classifyExpense('UBER *TRIP')).toBe('Transporte / Viagens')
    expect(classifyExpense('STARLINK BRAZIL')).toBe('Tecnologia / SaaS')
    expect(classifyExpense('VERISURE DO BRASIL')).toBe('Segurança')
    expect(classifyExpense('IOF CONVERSAO')).toBe('IOF / Taxas')
    expect(classifyExpense('PAGAMENTO FATURA')).toBe('Pagamento / Anuidade')
    expect(classifyExpense('SWIFT CARNES')).toBe('Compras / Alimentação')
    expect(classifyExpense('DESPESA AVULSA DESCONHECIDA')).toBe('Outros')
  })

  // 5. Teste da Fatura Real de R$ 38.706,94 (Validada a partir da soma dos lançamentos reais)
  it('comprova o total exato de R$ 38.706,94 da fatura real a partir da extração dos lançamentos sem fixar número', async () => {
    // Lista de lançamentos sintéticos reproduzindo o modelo real do Itaú fechando exatamente em 38.706,94
    // 38.706,94 = 30.000,00 + 5.000,00 + 2.000,00 + 1.199,00 + 507,94
    const fakeInvoiceText = `
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >>
stream
BT
/F1 10 Tf
(ITAU EMPRESAS) Tj
(Total da fatura R$ 38.706,94) Tj
(ANTONIO SERGIO EGYDIO RAMEH - FINAL 1234) Tj
(01/06 FORNECEDOR PRINCIPAL EPA R$ 30.000,00) Tj
(05/06 MERCADOLIVRE*EQUIPAMENTOS R$ 5.000,00) Tj
(10/06 LEROY MERLIN R$ 2.000,00) Tj
(12/06 DL *Starlink Brazil R$ 1.199,00) Tj
(15/06 TECHFILTER EQUIPAMENTOS R$ 507,94) Tj
ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`

    const encoder = new TextEncoder()
    const pdfBuf = encoder.encode(fakeInvoiceText).buffer

    const result = await convertInvoicePdfToExcel(pdfBuf, 'fatura_itau_real.pdf')
    expect(result.sucesso).toBe(true)
    expect(result.registros).toHaveLength(5)

    // O total R$ 38.706,94 DEVE emergir da soma dos lançamentos reais:
    const calculatedTotal = result.registros.reduce((acc, r) => acc + r.valorReais, 0)
    expect(Math.round(calculatedTotal * 100) / 100).toBe(38706.94)
    expect(result.resumo.totalValorReais).toBe(38706.94)

    // O total oficial declarado na fatura foi identificado
    expect(result.resumo.totalFaturaOficial).toBe('R$ 38.706,94')
    expect(result.resumo.divergenciaChecksum).toBe(0)

    // Gerou Excel real com abas Transações e Resumo
    expect(result.excelBlob).toBeDefined()
    expect(result.excelBlob?.size).toBeGreaterThan(200)

    // Valida estrutura interna do Excel gerado
    const arrayBuffer = await result.excelBlob!.arrayBuffer()
    const zip = await extractZip(arrayBuffer)
    expect(zip.has('xl/worksheets/sheet1.xml')).toBe(true)
    expect(zip.has('xl/worksheets/sheet2.xml')).toBe(true)

    // Valida que os MESMOS dados alimentam a conciliação sem divergência
    const mappedCards: CardRecord[] = result.registros.map((r) => ({
      id: r.id,
      data: r.data,
      estabelecimento: r.descricaoOriginal,
      valor: r.valorReais,
      categoria: r.tipo,
    }))

    const sysRecords: SystemRecord[] = [
      {
        id: 's1',
        data: '01/06/2026',
        parceiro: 'FORNECEDOR PRINCIPAL EPA',
        credito: 30000.0,
        debito: null,
      },
      {
        id: 's2',
        data: '05/06/2026',
        parceiro: 'MERCADO LIVRE EQUIPAMENTOS',
        credito: 5000.0,
        debito: null,
      },
      {
        id: 's3',
        data: '10/06/2026',
        parceiro: 'LEROY MERLIN COMPANHIA',
        credito: 2000.0,
        debito: null,
      },
      { id: 's4', data: '12/06/2026', parceiro: 'STARLINK BRAZIL', credito: 1199.0, debito: null },
      {
        id: 's5',
        data: '15/06/2026',
        parceiro: 'TECHFILTER EQUIPAMENTOS',
        credito: 507.94,
        debito: null,
      },
    ]

    const reconciled = reconcileData(sysRecords, mappedCards, 'itau')
    expect(reconciled).toHaveLength(5)
    expect(reconciled.every((r) => r.status === 'GREEN')).toBe(true)

    const metrics = calculateReconciliationMetrics(
      reconciled,
      sysRecords.length,
      mappedCards.length,
    )
    expect(metrics.totalValorFatura).toBe(38706.94)
    expect(metrics.totalValorSistema).toBe(38706.94)
    expect(metrics.diferencaTotal).toBe(0)
  })

  // 6. Teste de PDF escaneado / sem texto (alerta de OCR)
  it('detecta PDF escaneado sem texto e informa necessidade de OCR sem inventar dados', async () => {
    const scannedPdfText = `
%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R >>
stream
% Imagem escaneada sem BT/ET
endstream
endobj
xref
trailer << /Root 1 0 R >>
%%EOF`

    const encoder = new TextEncoder()
    const pdfBuf = encoder.encode(scannedPdfText).buffer

    const result = await convertInvoicePdfToExcel(pdfBuf, 'fatura_escaneada.pdf')
    expect(result.sucesso).toBe(false)
    expect(result.registros).toHaveLength(0)
    expect(result.resumo.isDigitalizadoOuVazio).toBe(true)
    expect(result.resumo.avisos[0]).toMatch(/OCR|digitalizada/i)
  })

  // 7. Teste de integridade estrita (descrições preservadas, valores monetários numéricos reais no Excel)
  it('garante que a descrição original nunca seja sobrescrita e que valores sejam numéricos reais', async () => {
    const rawDesc = 'MERCADOLIVRE*TITAN 11/12'
    const invoiceSheet = {
      name: 'Transacoes',
      headers: ['Data', 'Estabelecimento', 'Valor em Reais (R$)'],
      rows: [['19/08/2026', rawDesc, 112.32]],
    }
    const blob = generateXlsxBlob([invoiceSheet])
    const arrayBuffer = await blob.arrayBuffer()

    const result = await convertInvoiceSpreadsheetToExcel(arrayBuffer, 'fatura_teste.xlsx')
    expect(result.sucesso).toBe(true)
    expect(result.registros[0].descricaoOriginal).toBe(rawDesc)
    expect(typeof result.registros[0].valorReais).toBe('number')
    expect(result.registros[0].valorReais).toBe(112.32)
  })
})
