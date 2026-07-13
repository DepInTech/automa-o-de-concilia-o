import type { ReconciliationResult, SystemRecord, CardRecord } from './types'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
}

function formatNumberForCSV(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value.toFixed(2).replace('.', ',')
}

export function validateExport(
  results: ReconciliationResult[],
  systemRecords: SystemRecord[],
  cardRecords: CardRecord[],
): ValidationResult {
  const errors: string[] = []

  const ambos = results.filter((r) => r.origem === 'AMBOS').length
  const sistema = results.filter((r) => r.origem === 'SISTEMA').length
  const fatura = results.filter((r) => r.origem === 'FATURA').length

  if (ambos + sistema !== systemRecords.length) {
    errors.push(
      `Sistema: ${systemRecords.length} registros na origem vs ${ambos + sistema} no resultado`,
    )
  }
  if (ambos + fatura !== cardRecords.length) {
    errors.push(
      `Fatura: ${cardRecords.length} registros na origem vs ${ambos + fatura} no resultado`,
    )
  }

  const ids = results.map((r) => r.id)
  const uniqueIds = new Set(ids)
  if (ids.length !== uniqueIds.size) {
    errors.push(`${ids.length - uniqueIds.size} registro(s) duplicado(s) detectado(s)`)
  }

  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
  for (const r of results) {
    if (r.data && r.data !== '-' && !dateRegex.test(r.data)) {
      errors.push(`Data com formato incorreto: "${r.data}" (esperado DD/MM/AAAA)`)
    }
    if (r.status === 'RED' && r.diferenca !== null) {
      errors.push(`Registro RED com diferença preenchida: ${r.id}`)
    }
    if (r.status === 'GREEN' && r.diferenca !== 0) {
      errors.push(`Registro GREEN com diferença diferente de zero: ${r.id}`)
    }
    if (r.status === 'YELLOW' && (r.diferenca === null || r.diferenca === 0)) {
      errors.push(`Registro YELLOW sem diferença calculada: ${r.id}`)
    }
  }

  const systemValues = systemRecords.map((r) => r.credito).sort((a, b) => a - b)
  const resultSystemValues = results
    .filter((r) => r.origem !== 'FATURA')
    .map((r) => r.credito || 0)
    .sort((a, b) => a - b)
  for (let i = 0; i < systemValues.length; i++) {
    if (i >= resultSystemValues.length || systemValues[i] !== resultSystemValues[i]) {
      errors.push('Valores monetários do sistema não conferem com a origem')
      break
    }
  }

  return { isValid: errors.length === 0, errors }
}

export function generateExportCSV(results: ReconciliationResult[]): string {
  const statusLabel = (s: string) =>
    s === 'GREEN' ? 'Conciliado' : s === 'YELLOW' ? 'Divergente' : 'Não Encontrado'

  const header = [
    'Data',
    'Lançamento Diário',
    'Parceiro',
    'Estabelecimento',
    'Categoria',
    'Débito',
    'Crédito',
    'Valor da Fatura',
    'Diferença',
    'Status',
  ].join(';')

  const rows = results.map((r) =>
    [
      r.data,
      r.lancamentoDiario,
      r.parceiro,
      r.estabelecimento,
      r.categoria,
      formatNumberForCSV(r.debito),
      formatNumberForCSV(r.credito),
      formatNumberForCSV(r.valorFatura),
      formatNumberForCSV(r.diferenca),
      statusLabel(r.status),
    ].join(';'),
  )

  return [header, ...rows].join('\n')
}
