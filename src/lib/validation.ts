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

  if (results.length === 0) {
    errors.push('Nenhum resultado de conciliação disponível para exportação.')
  }

  if (systemRecords.length === 0 && cardRecords.length === 0) {
    errors.push('Nenhum dado de origem foi importado.')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

function escapeCSV(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatNum(value: number | null): string {
  if (value === null) return ''
  return value.toFixed(2).replace('.', ',')
}

function statusLabel(s: string): string {
  if (s === 'GREEN') return 'Conciliado'
  if (s === 'YELLOW') return 'Divergente'
  return 'Nao Encontrado'
}

export function generateExportCSV(results: ReconciliationResult[]): string {
  const headers = [
    'Data',
    'Lançamento Diário',
    'Parceiro',
    'Estabelecimento',
    'Categoria',
    'Débito',
    'Crédito',
    'Valor Fatura',
    'Diferença',
    'Status',
    'Origem',
  ]

  const rows = results.map((r) =>
    [
      r.data,
      r.lancamentoDiario,
      r.parceiro,
      r.estabelecimento,
      r.categoria,
      formatNum(r.debito),
      formatNum(r.credito),
      formatNum(r.valorFatura),
      formatNum(r.diferenca),
      statusLabel(r.status),
      r.origem,
    ]
      .map(escapeCSV)
      .join(';'),
  )

  return [headers.join(';'), ...rows].join('\n')
}
