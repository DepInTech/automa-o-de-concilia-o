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

export function generateExportCSV(
  results: ReconciliationResult[],
  systemRecords?: SystemRecord[],
  cardRecords?: CardRecord[],
): string {
  const sysMap = systemRecords
    ? new Map<string, SystemRecord>(systemRecords.map((s) => [s.id, s]))
    : null
  const cardMap = cardRecords
    ? new Map<string, CardRecord>(cardRecords.map((c) => [c.id, c]))
    : null

  const header =
    'ID Associação;ID Fatura;ID Odoo;Data da Fatura;Data do Odoo;Número;Referência;Lançamento Diário;Parceiro (Odoo);Estabelecimento (Fatura);Categoria;Valor Odoo (R$);Valor Fatura (R$);Diferença (R$);Status;Classificação;Motivo da Classificação;Origem;Anotação Fatura;Anotação Odoo'

  const rows = results.map((r) => {
    // Consulta prioritária aos registros de origem imutáveis
    const origSys = r.systemRecordId && sysMap ? sysMap.get(r.systemRecordId) : undefined
    const origCard = r.cardRecordId && cardMap ? cardMap.get(r.cardRecordId) : undefined

    const dataFatura =
      origCard?.data ||
      (r.origem === 'FATURA' || r.origem === 'AMBOS' ? r.dataFatura || r.data : '')
    const dataOdoo =
      origSys?.data || (r.origem === 'SISTEMA' || r.origem === 'AMBOS' ? r.dataOdoo || r.data : '')
    const parceiroOdoo = origSys?.parceiro || (r.parceiro !== '-' ? r.parceiro : '')
    const estabFatura =
      origCard?.estabelecimento || (r.estabelecimento !== '-' ? r.estabelecimento : '')

    const rawValOdoo = origSys !== undefined ? origSys.credito : r.credito
    const rawValFat = origCard !== undefined ? origCard.valor : r.valorFatura

    const valOdoo =
      rawValOdoo !== null && rawValOdoo !== undefined ? rawValOdoo.toFixed(2).replace('.', ',') : ''
    const valFatura =
      rawValFat !== null && rawValFat !== undefined ? rawValFat.toFixed(2).replace('.', ',') : ''
    const dif =
      r.diferenca !== null && r.diferenca !== undefined
        ? r.diferenca.toFixed(2).replace('.', ',')
        : ''

    return [
      r.id,
      r.cardRecordId ?? '',
      r.systemRecordId ?? '',
      dataFatura,
      dataOdoo,
      origSys?.numero ?? r.numero ?? '',
      origSys?.referencia ?? r.referencia ?? '',
      origSys?.lancamentoDiario ?? r.lancamentoDiario ?? '',
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
      r.observacaoManualFatura ?? '',
      r.observacaoManualOdoo ?? '',
    ].join(';')
  })
  return [header, ...rows].join('\n')
}
