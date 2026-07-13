import type { ParsedCSV } from './csv-parser'
import { parseCSV } from './csv-parser'
import { parseExcel } from './excel-parser'

export async function parseFile(file: File): Promise<ParsedCSV> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx')) {
    const buffer = await file.arrayBuffer()
    return parseExcel(buffer)
  }
  if (name.endsWith('.xls')) {
    throw new Error('Formato .xls não suportado. Converta para .xlsx ou .csv.')
  }
  const text = await file.text()
  return parseCSV(text)
}
