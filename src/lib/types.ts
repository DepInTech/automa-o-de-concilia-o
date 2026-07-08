export interface SystemRecord {
  id: string
  data: string
  parceiro: string
  categoria: string
  parcela: string
  lancamentoDiario: string
  valor: number
}

export interface CardRecord {
  id: string
  data: string
  estabelecimento: string
  valor: number
}

export interface ReconciliationResult {
  id: string
  data: string
  parceiro: string
  estabelecimentoFatura: string
  categoria: string
  parcela: string
  lancamentoDiario: string
  valorSistema: number | null
  valorFatura: number | null
  diferenca: number | null
  status: 'GREEN' | 'YELLOW' | 'RED'
}
