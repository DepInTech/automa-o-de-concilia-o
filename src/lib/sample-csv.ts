import type { BankType } from './types'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from './mock-data'

export function generateSystemCSV(bank: BankType): string {
  if (bank === 'itau') {
    const header = 'Data;Parceiro;Total;Categoria;Número;Referência'
    const rows = MOCK_SYSTEM_RECORDS.map((r) =>
      [
        r.data,
        r.parceiro,
        r.credito.toFixed(2),
        r.categoria ?? '',
        r.numero ?? '',
        r.referencia ?? '',
      ].join(';'),
    )
    return [header, ...rows].join('\n')
  }
  const header = 'Data;Parceiro;Crédito;Lançamento Diário'
  const rows = MOCK_SYSTEM_RECORDS.map((r) =>
    [r.data, r.parceiro, r.credito.toFixed(2), r.lancamentoDiario ?? ''].join(';'),
  )
  return [header, ...rows].join('\n')
}

export function generateCardCSV(bank: BankType): string {
  if (bank === 'itau') {
    const header = 'Data;Estabelecimento;Valor (R$);Categoria'
    const rows = MOCK_CARD_RECORDS.map((r) =>
      [r.data, r.estabelecimento, r.valor.toFixed(2), r.categoria ?? ''].join(';'),
    )
    return [header, ...rows].join('\n')
  }
  const header = 'Data;Estabelecimento;Valor'
  const rows = MOCK_CARD_RECORDS.map((r) =>
    [r.data, r.estabelecimento, r.valor.toFixed(2)].join(';'),
  )
  return [header, ...rows].join('\n')
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
