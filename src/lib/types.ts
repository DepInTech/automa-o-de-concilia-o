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
  /** Observação manual presente no arquivo de conferência */
  observacaoManual?: string
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
  valorUSD?: number | null
  /** Observação manual presente no arquivo de conferência (ex.: "Apenas Fatura", "divergente") */
  observacaoManual?: string
  /** Página do PDF de onde foi extraído */
  paginaOrigem?: number
  /** Score de confiança da extração */
  confianca?: number
}

export type MatchClassification = 'CONCILIADO' | 'DIVERGENTE' | 'SOMENTE_SISTEMA' | 'SOMENTE_FATURA'

export interface ReconciliationResult {
  id: string
  /** ID estável e imutável do registro do sistema Odoo associado (se houver) */
  systemRecordId?: string
  /** ID estável e imutável do registro da fatura Itaú associado (se houver) */
  cardRecordId?: string
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
  /** Anotação manual original detectada na fatura ou no Odoo */
  observacaoManualFatura?: string
  observacaoManualOdoo?: string
}

export type ManualAnnotationCategory =
  | 'APENAS_FATURA'
  | 'APENAS_ODOO'
  | 'DIVERGENTE'
  | 'CONCILIADO_ESPERADO'
  | 'SEM_ANOTACAO'

export interface AdherenceItem {
  id: string
  origem: 'AMBOS' | 'FATURA' | 'SISTEMA'
  estabelecimento: string
  parceiro: string
  valorFatura: number | null
  valorOdoo: number | null
  anotacaoFatura?: string
  anotacaoOdoo?: string
  classificacaoAlgoritmo: MatchClassification
  statusAlgoritmo: 'GREEN' | 'YELLOW' | 'RED'
  statusConferencia: ManualAnnotationCategory
  aderente: boolean
  tipoAderencia: 'CONCORDA' | 'DISCORDA' | 'REVISAO_SUGERIDA'
  detalhe: string
}

export interface AdherenceReport {
  hasAnnotations: boolean
  totalItensComAnotacao: number
  totalConcordantes: number
  totalDiscordantes: number
  totalRevisaoSugerida: number
  taxaAderenciaPercentual: number
  itens: AdherenceItem[]
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
  casosEmRevisao?: number
  registrosDescartados: number
  justificativaDescartes?: string
  totalValorSistema: number
  totalValorFatura: number
  totalValorConciliadoSistema: number
  totalValorConciliadoFatura: number
  totalValorExclusivoSistema: number
  totalValorExclusivoFatura: number
  totalDiferencaDivergentes: number
  totalValorDivergentesFatura?: number
  totalValorDivergentesSistema?: number
  diferencaTotal: number
  percentualConciliacao: number
}
