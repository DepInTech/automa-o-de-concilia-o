import type { ParsedCSV } from './csv-parser'
import { parseCSV, mapCardRecords } from './csv-parser'
import { parseExcel } from './excel-parser'
import { sanitizeItauText, sanitizeParsedCSV } from './itau-sanitizer'
import { parseCardPdf, type CardPdfParseResult, type StructuredCardRecord } from './card-pdf-parser'
import type { BankType } from './types'

/**
 * Processador para arquivos de planilha e texto do sistema (Odoo).
 * Aceita .xlsx ou .csv conforme especificação.
 */
export async function parseSystemFile(file: File, bank: BankType): Promise<ParsedCSV> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer()
    const parsed = await parseExcel(buffer)
    if (bank === 'itau') {
      const originalDetected = parsed.detectedRows
      const sanitized = sanitizeParsedCSV(parsed, 'system')
      return { ...sanitized, detectedRows: originalDetected }
    }
    return parsed
  }

  if (name.endsWith('.xls')) {
    throw new Error('Formato .xls não suportado para o Sistema. Utilize .xlsx ou .csv.')
  }

  if (name.endsWith('.pdf')) {
    throw new Error(
      'O campo do Sistema (Odoo) aceita apenas planilhas (.xlsx ou .csv). Para a fatura, utilize o campo ao lado.',
    )
  }

  const text = await file.text()

  if (bank === 'itau') {
    const originalParsed = parseCSV(text)
    const originalDetected = originalParsed.detectedRows
    const sanitizedText = sanitizeItauText(text, 'system')
    const parsed = parseCSV(sanitizedText)
    return { ...parsed, detectedRows: originalDetected }
  }

  return parseCSV(text)
}

/**
 * Processador direto para Fatura em PDF.
 * Elimina totalmente a necessidade de macro e conversão manual em planilha.
 */
export async function parseCardPdfFile(file: File, bank: BankType): Promise<CardPdfParseResult> {
  const name = file.name.toLowerCase()

  // Se o usuário enviar a planilha de fatura (.xlsx ou .csv) como entrada alternativa (ex: Fatura_Itau.xlsx)
  if (name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer()
    const parsed = await parseExcel(buffer)
    const records = mapCardRecords(parsed)
    return {
      records: records as StructuredCardRecord[],
      detectedRows: records.length,
      unparsedLinesCount: 0,
      isScannedOrEmpty: records.length === 0,
      numPages: 1,
    }
  }

  if (name.endsWith('.csv')) {
    const text = await file.text()
    const parsed = parseCSV(text)
    const records = mapCardRecords(parsed)
    return {
      records: records as StructuredCardRecord[],
      detectedRows: records.length,
      unparsedLinesCount: 0,
      isScannedOrEmpty: records.length === 0,
      numPages: 1,
    }
  }

  if (name.endsWith('.xls')) {
    throw new Error('Formato .xls não suportado para Fatura. Utilize PDF (.pdf) ou .xlsx.')
  }

  if (!name.endsWith('.pdf') && file.type !== 'application/pdf' && file.type !== '') {
    throw new Error(
      'Formato inválido. O campo da Fatura do Cartão aceita arquivos em formato PDF (.pdf) ou planilha (.xlsx).',
    )
  }

  try {
    return await parseCardPdf(file, bank)
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error(
      'Não foi possível identificar os dados da fatura neste PDF. Verifique se o arquivo está legível e tente novamente.',
    )
  }
}

/**
 * Compatibilidade legada unificada
 */
export async function parseFile(
  file: File,
  bank: BankType,
  fileType: 'system' | 'card',
): Promise<ParsedCSV> {
  if (fileType === 'card' && file.name.toLowerCase().endsWith('.pdf')) {
    const pdfResult = await parseCardPdf(file, bank)
    const headers = ['Data', 'Estabelecimento', 'Valor (R$)', 'Categoria', 'Número', 'Referência']
    const rows = pdfResult.records.map((r) => ({
      Data: r.data,
      Estabelecimento: r.estabelecimento,
      'Valor (R$)': r.valor.toFixed(2).replace('.', ','),
      Categoria: r.categoria ?? '',
      Número: r.numero ?? '',
      Referência: r.referencia ?? '',
    }))
    return {
      headers,
      rows,
      detectedRows: pdfResult.detectedRows,
    }
  }

  return parseSystemFile(file, bank)
}
