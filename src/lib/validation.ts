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

  return { isValid: errors.length === 0, errors }
}

export function generateExportCSV(results: ReconciliationResult[]): string {
  const header =
    'Data da Fatura;Data do Odoo;Número;Referência;Lançamento Diário;Parceiro (Odoo);Estabelecimento (Fatura);Categoria;Valor Odoo (R$);Valor Fatura (R$);Diferença (R$);Status;Classificação;Motivo da Classificação;Origem'
  const rows = results.map((r) => {
    const dataFatura = r.origem === 'FATURA' || r.origem === 'AMBOS' ? r.data : ''
    const dataOdoo = r.origem === 'SISTEMA' || r.origem === 'AMBOS' ? r.data : ''
    const parceiroOdoo = r.parceiro !== '-' ? r.parceiro : ''
    const estabFatura = r.estabelecimento !== '-' ? r.estabelecimento : ''
    const valOdoo =
      r.credito !== null && r.credito !== undefined ? r.credito.toFixed(2).replace('.', ',') : ''
    const valFatura =
      r.valorFatura !== null && r.valorFatura !== undefined
        ? r.valorFatura.toFixed(2).replace('.', ',')
        : ''
    const dif =
      r.diferenca !== null && r.diferenca !== undefined
        ? r.diferenca.toFixed(2).replace('.', ',')
        : ''

    return [
      dataFatura,
      dataOdoo,
      r.numero ?? '',
      r.referencia ?? '',
      r.lancamentoDiario ?? '',
      parceiroOdoo,
      estabFatura,
      r.categoria ?? '',
      valOdoo,
      valFatura,
      dif,
      r.status,
      r.classificacao ?? '',
      r.motivo ?? '',
      r.origem,
    ].join(';')
  })
  return [header, ...rows].join('\n')
}
