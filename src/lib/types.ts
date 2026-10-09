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
  total?: number | null
  /** Linha de origem no arquivo para auditoria */
  linhaOrigem?: number
}

export interface CardRecord {
  id: string
  data: string
  estabelecimento: string
  categoria?: string
  valor: number
  moedaLocal?: string
  moedaGlobal?: string
  cotacao?: number
  isInternacional?: boolean
  cartaoTitular?: string
  parcela?: string
  observacao?: string
  /** Página do PDF de onde foi extraído */
  paginaOrigem?: number
  /** Score de confiança da extração */
  confianca?: number
}

export type MatchClassification =
  | 'CONCILIADO'
  | 'DIVERGENTE'
  | 'SOMENTE_SISTEMA'
  | 'SOMENTE_FATURA'
  | 'POSSIVEL_CORRESPONDENCIA'

export interface ReconciliationResult {
  id: string
  /** Data da fatura (quando aplicável) */
  dataFatura?: string
  /** Data do sistema Odoo (quando aplicável) */
  dataOdoo?: string
  /** Data genérica para compatibilidade */
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
  /** GREEN = Conciliado | YELLOW = Divergente | RED = Somente Sistema / Somente Fatura */
  status: 'GREEN' | 'YELLOW' | 'RED'
  origem: 'SISTEMA' | 'FATURA' | 'AMBOS'
  classificacao: MatchClassification
  motivo: string
  scoreConfianca?: number
  /** Rastreabilidade de auditoria */
  linhaOdooOrigem?: number
  paginaFaturaOrigem?: number
  isInternacional?: boolean
  moedaOriginal?: string
}

export interface ReconciliationMetrics {
  totalRegistrosSistema: number
  totalRegistrosFatura: number
  paresConciliados: number
  correspondenciasExatas: number
  correspondenciasNomeSemelhante: number
  paresDivergentes: number
  somenteSistema: number
  somenteFatura: number
  casosEmRevisao: number
  registrosDescartados: number
  justificativaDescartes?: string
  totalValorSistema: number
  totalValorFatura: number
  totalValorConciliadoSistema: number
  totalValorConciliadoFatura: number
  totalValorExclusivoSistema: number
  totalValorExclusivoFatura: number
  totalDiferencaDivergentes: number
  diferencaTotal: number
  percentualConciliacao: number
}
