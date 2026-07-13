import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from './mock-data'

export function generateSystemCSV(): string {
  const header = 'Data;Lançamento Diário;Parceiro;Débito;Crédito'
  const rows = MOCK_SYSTEM_RECORDS.map((r) =>
    [r.data, r.lancamentoDiario, r.parceiro, r.debito ?? '', r.credito.toFixed(2)].join(';'),
  )
  return [header, ...rows].join('\n')
}

export function generateCardCSV(): string {
  const header = 'Data;Estabelecimento;Categoria;Valor'
  const rows = MOCK_CARD_RECORDS.map((r) =>
    [r.data, r.estabelecimento, r.categoria, r.valor.toFixed(2)].join(';'),
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
