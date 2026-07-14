export type BankType = 'itau' | 'santander'

export interface SystemRecord {
  id: string
  data: string
  parceiro: string
  lancamentoDiario?: string
  numero?: string
  referencia?: string
  categoria?: string
  debito: number | null
  credito: number
}

export interface CardRecord {
  id: string
  data: string
  estabelecimento: string
  categoria?: string
  valor: number
}

export interface ReconciliationResult {
  id: string
  data: string
  numero?: string
  referencia?: string
  categoria?: string
  lancamentoDiario?: string
  parceiro: string
  estabelecimento: string
  debito?: number | null
  credito: number | null
  valorFatura: number | null
  diferenca: number | null
  status: 'GREEN' | 'YELLOW' | 'RED'
  origem: 'SISTEMA' | 'FATURA' | 'AMBOS'
}
