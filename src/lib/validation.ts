import type { ReconciliationResult, SystemRecord, CardRecord } from './types'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

export function validateExport(
  results: ReconciliationResult[],
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ValidationResult {
  const errors: string[] = []

  const matchedCount = results.filter((r) => r.origem === 'AMBOS').length
  const expected = systemRecords.length + cardRecords.length - matchedCount

  if (results.length !== expected) {
    errors.push(
      `Inconsistência: ${results.length} resultados, esperado ${expected} (${systemRecords.length} sistema + ${cardRecords.length} fatura - ${matchedCount} casados).`,
    )
  }

  const green = results.filter((r) => r.status === 'GREEN').length
  const yellow = results.filter((r) => r.status === 'YELLOW').length
  const red = results.filter((r) => r.status === 'RED').length

  if (green + yellow + red !== results.length) {
    errors.push('Soma de statuses inconsistente (GREEN + YELLOW + RED != total).')
  }

  const yellowWithNullDiff = results.filter((r) => r.status === 'YELLOW' && r.diferenca === null)
  if (yellowWithNullDiff.length > 0) {
    errors.push(`${yellowWithNullDiff.length} registro(s) divergente(s) sem diferença calculada.`)
  }

  return { isValid: errors.length === 0, errors }
}

export function generateExportCSV(results: ReconciliationResult[]): string {
  const header =
    'Data;Número;Referência;Lançamento Diário;Parceiro;Estabelecimento;Categoria;Crédito;Valor Fatura;Diferença;Status;Origem'
  const rows = results.map((r) =>
    [
      r.data,
      r.numero ?? '',
      r.referencia ?? '',
      r.lancamentoDiario ?? '',
      r.parceiro,
      r.estabelecimento,
      r.categoria ?? '',
      r.credito?.toFixed(2) ?? '',
      r.valorFatura?.toFixed(2) ?? '',
      r.diferenca?.toFixed(2) ?? '',
      r.status,
      r.origem,
    ].join(';'),
  )
  return [header, ...rows].join('\n')
}
