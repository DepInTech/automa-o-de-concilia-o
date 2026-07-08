export interface SystemRecord {
  id: string
  data: string
  lancamentoDiario: string
  parceiro: string
  debito: number | null
  credito: number
  categoria: string
}

export interface CardRecord {
  id: string
  data: string
  estabelecimento: string
  categoria: string
  valor: number
}

export interface ReconciliationResult {
  id: string
  data: string
  lancamentoDiario: string
  parceiro: string
  estabelecimento: string
  categoria: string
  debito: number | null
  credito: number | null
  valorFatura: number | null
  diferenca: number | null
  status: 'GREEN' | 'YELLOW' | 'RED'
  origem: 'AMBOS' | 'SISTEMA' | 'FATURA'
}
