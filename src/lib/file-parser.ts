import type { ParsedCSV } from './csv-parser'
import { parseCSV } from './csv-parser'
import { parseExcel } from './excel-parser'
import { sanitizeItauText, sanitizeParsedCSV } from './itau-sanitizer'
import type { BankType } from './types'

export async function parseFile(
  file: File,
  bank: BankType,
  fileType: 'system' | 'card',
): Promise<ParsedCSV> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer()
    const parsed = await parseExcel(buffer)
    if (bank === 'itau') {
      const originalDetected = parsed.detectedRows
      const sanitized = sanitizeParsedCSV(parsed, fileType)
      return { ...sanitized, detectedRows: originalDetected }
    }
    return parsed
  }

  if (name.endsWith('.xls')) {
    throw new Error('Formato .xls não suportado. Converta para .xlsx ou .csv.')
  }

  const text = await file.text()

  if (bank === 'itau') {
    const originalParsed = parseCSV(text)
    const originalDetected = originalParsed.detectedRows
    const sanitizedText = sanitizeItauText(text, fileType)
    const parsed = parseCSV(sanitizedText)
    return { ...parsed, detectedRows: originalDetected }
  }

  return parseCSV(text)
}
