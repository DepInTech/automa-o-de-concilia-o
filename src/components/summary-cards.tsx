import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import type {
  ReconciliationResult,
  SystemRecord,
  CardRecord,
  BankType,
  MatchClassification,
} from '@/lib/types'
import { calculateReconciliationMetrics } from '@/lib/reconciliation'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  FileText,
  CreditCard,
  Scale,
  Building2,
  Layers,
  ArrowRight,
  TrendingUp,
  Percent,
  HelpCircle,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

export interface SummaryCardsProps {
  results: ReconciliationResult[]
  systemRecords?: SystemRecord[]
  cardRecords?: CardRecord[]
  systemRecordsCount?: number
  cardRecordsCount?: number
  bank?: BankType
  activeFilter?: string
  onSelectFilter?: (
    status: 'ALL' | 'GREEN' | 'YELLOW' | 'RED' | 'SOMENTE_SISTEMA' | 'SOMENTE_FATURA',
  ) => void
  onNavigateToResults?: () => void
}

export function SummaryCards({
  results,
  systemRecords,
  cardRecords,
  systemRecordsCount,
  cardRecordsCount,
  bank = 'itau',
  activeFilter = 'ALL',
  onSelectFilter,
  onNavigateToResults,
}: SummaryCardsProps) {
  const [showFormulaHelp, setShowFormulaHelp] = useState(false)

  const metrics = calculateReconciliationMetrics(
    results,
    systemRecords ?? systemRecordsCount,
    cardRecords ?? cardRecordsCount,
    bank,
  )

  const totalClassificados =
    metrics.paresConciliados +
    metrics.somenteSistema +
    metrics.somenteFatura +
    metrics.paresDivergentes

  const isZeroDiff = Math.abs(metrics.diferencaTotal) < 0.005

  const formatDifferenceValue = (diff: number): string => {
    if (Math.abs(diff) < 0.005) {
      return 'R$ 0,00'
    }
    const formattedAbs = formatCurrency(Math.abs(diff))
    if (diff > 0) {
      return `+${formattedAbs}`
    }
    return `−${formattedAbs}`
  }

  // Dados para o Gráfico de Distribuição por Status (apenas as 4 classes estritas)
  const statusPieData = [
    { name: 'Conciliados', value: metrics.paresConciliados, color: '#10B981', status: 'GREEN' },
    {
      name: 'Somente Odoo',
      value: metrics.somenteSistema,
      color: '#EF4444',
      status: 'SOMENTE_SISTEMA',
    },
    {
      name: 'Somente Fatura',
      value: metrics.somenteFatura,
      color: '#DC2626',
      status: 'SOMENTE_FATURA',
    },
    { name: 'Divergentes', value: metrics.paresDivergentes, color: '#F59E0B', status: 'YELLOW' },
  ].filter((d) => d.value > 0)

  // Dados para o Gráfico de Comparação de Volume Financeiro (R$)
  const financialBarData = [
    {
      categoria: 'Fatura Original',
      total: metrics.totalValorFatura,
      color: '#00796F',
    },
    {
      categoria: 'Odoo Original',
      total: metrics.totalValorSistema,
      color: '#004A46',
    },
    {
      categoria: 'Conciliado',
      total: metrics.totalValorConciliadoFatura,
      color: '#10B981',
    },
    {
      categoria: 'Pend. Fatura',
      total: metrics.totalValorExclusivoFatura,
      color: '#DC2626',
    },
    {
      categoria: 'Pend. Odoo',
      total: metrics.totalValorExclusivoSistema,
      color: '#EF4444',
    },
  ]

  const handleCardClick = (
    targetStatus: 'GREEN' | 'YELLOW' | 'RED' | 'SOMENTE_SISTEMA' | 'SOMENTE_FATURA',
  ) => {
    if (onSelectFilter) {
      onSelectFilter(targetStatus)
    }
    if (onNavigateToResults) {
      onNavigateToResults()
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. SEÇÃO PRINCIPAL: 4 CARTÕES DE INDICADORES (CONTAGEM DE REGISTROS) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
              Indicadores Principais de Conciliação
            </h2>
            <span className="text-xs text-[#647875] dark:text-[#A7C4C0]">
              (Clique em um cartão para auditar os registros correspondentes)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#647875] dark:text-[#A7C4C0]">
              Total Classificado:{' '}
              <strong className="text-[#163A38] dark:text-[#F1F5F4] font-bold">
                {totalClassificados} registros
              </strong>
            </span>
            {activeFilter !== 'ALL' && onSelectFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelectFilter('ALL')}
                className="h-6 px-2 text-[11px] text-[#00796F] dark:text-[#20BFA9] hover:bg-[#00796F]/10 rounded-lg"
              >
                Limpar filtro
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: CONCILIADOS (VERDE) */}
          <Card
            onClick={() => handleCardClick('GREEN')}
            className={`group cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
              activeFilter === 'GREEN'
                ? 'border-emerald-500 shadow-lg ring-2 ring-emerald-500/30'
                : 'border-emerald-500/35 hover:border-emerald-500 hover:shadow-md'
            } bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-emerald-950/30 dark:via-[#0D3834] dark:to-[#071F1D]`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    1. Conciliados
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/70 dark:bg-emerald-900/40 border border-emerald-300/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Pares Conciliados
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
                      {metrics.paresConciliados}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.paresConciliados === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Total Conciliado:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                    {formatCurrency(metrics.totalValorConciliadoFatura)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  <span>
                    {metrics.correspondenciasExatas} exatos •{' '}
                    {metrics.correspondenciasNomeSemelhante} semelhantes
                  </span>
                  <ArrowRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 2: SOMENTE ODOO (VERMELHO) */}
          <Card
            onClick={() => handleCardClick('SOMENTE_SISTEMA')}
            className={`group cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
              activeFilter === 'SOMENTE_SISTEMA' || activeFilter === 'RED'
                ? 'border-rose-500 shadow-lg ring-2 ring-rose-500/30'
                : 'border-rose-500/35 hover:border-rose-500 hover:shadow-md'
            } bg-gradient-to-br from-rose-50/70 via-white to-white dark:from-rose-950/30 dark:via-[#0D3834] dark:to-[#071F1D]`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    2. Somente Odoo
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 dark:bg-rose-900/40 border border-rose-300/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Building2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Não Conciliados no Odoo
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
                      {metrics.somenteSistema}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.somenteSistema === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rose-200/50 dark:border-rose-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Valor Pendente:</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                    {formatCurrency(metrics.totalValorExclusivoSistema)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  <span>Existe no Odoo, ausente na fatura</span>
                  <ArrowRight className="w-3 h-3 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 3: SOMENTE FATURA (VERMELHO) */}
          <Card
            onClick={() => handleCardClick('SOMENTE_FATURA')}
            className={`group cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
              activeFilter === 'SOMENTE_FATURA' || activeFilter === 'RED'
                ? 'border-rose-600 shadow-lg ring-2 ring-rose-600/30'
                : 'border-rose-500/35 hover:border-rose-600 hover:shadow-md'
            } bg-gradient-to-br from-rose-50/70 via-white to-white dark:from-rose-950/30 dark:via-[#0D3834] dark:to-[#071F1D]`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/60">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    3. Somente Fatura
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 dark:bg-rose-900/40 border border-rose-300/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Não Conciliados na Fatura
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
                      {metrics.somenteFatura}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.somenteFatura === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rose-200/50 dark:border-rose-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Valor Pendente:</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                    {formatCurrency(metrics.totalValorExclusivoFatura)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  <span>Existe na fatura, ausente no Odoo</span>
                  <ArrowRight className="w-3 h-3 text-rose-600 dark:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 4: DIVERGENTES (AMARELO/ÂMBAR) */}
          <Card
            onClick={() => handleCardClick('YELLOW')}
            className={`group cursor-pointer relative overflow-hidden rounded-2xl border-2 transition-all duration-200 ${
              activeFilter === 'YELLOW'
                ? 'border-amber-500 shadow-lg ring-2 ring-amber-500/30'
                : 'border-amber-500/35 hover:border-amber-500 hover:shadow-md'
            } bg-gradient-to-br from-amber-50/70 via-white to-white dark:from-amber-950/30 dark:via-[#0D3834] dark:to-[#071F1D]`}
          >
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    4. Divergentes
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-amber-100/70 dark:bg-amber-900/40 border border-amber-300/50 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Pares Divergentes
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-amber-700 dark:text-amber-400 tracking-tight">
                      {metrics.paresDivergentes}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.paresDivergentes === 1 ? 'registro' : 'registros'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-amber-200/50 dark:border-amber-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Diferença Apurada:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                    {formatCurrency(metrics.totalDiferencaDivergentes)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  <span>Mesmo fornecedor com valor divergente</span>
                  <ArrowRight className="w-3 h-3 text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 2. SEÇÃO SEPARADA: RESUMO FINANCEIRO (VALORES MONETÁRIOS ORIGINAIS E DIFERENÇAS) */}
      <div className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-[#00796F]/15">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
              Resumo Financeiro • Valores Monetários e Fórmulas de Cálculo
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFormulaHelp(!showFormulaHelp)}
            className="h-7 text-xs text-[#647875] dark:text-[#A7C4C0] hover:text-[#00796F] dark:hover:text-[#20BFA9]"
          >
            <HelpCircle className="w-3.5 h-3.5 mr-1" />
            {showFormulaHelp ? 'Ocultar fórmulas' : 'Ver fórmulas de cálculo'}
          </Button>
        </div>

        {/* Painel Explicativo das Fórmulas (quando aberto) */}
        {showFormulaHelp && (
          <div className="mb-4 p-4 rounded-xl bg-[#F4F8F7] dark:bg-[#071F1D] border border-[#00796F]/15 text-xs text-[#647875] dark:text-[#A7C4C0] space-y-2">
            <p className="font-semibold text-[#004A46] dark:text-[#20BFA9]">
              Fórmulas Oficiais Utilizadas pelo Sistema de Conciliação EPA:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Diferença Bruta entre Fontes:</strong>{' '}
                <code className="px-1.5 py-0.5 rounded bg-white dark:bg-[#0D3834] font-mono text-[11px] text-[#163A38] dark:text-[#F1F5F4]">
                  Total Fatura − Total Odoo = R$ {metrics.totalValorFatura.toFixed(2)} − R${' '}
                  {metrics.totalValorSistema.toFixed(2)} ={' '}
                  {formatDifferenceValue(metrics.diferencaTotal)}
                </code>
              </li>
              <li>
                <strong>Diferença de Registro Divergente:</strong>{' '}
                <code className="px-1.5 py-0.5 rounded bg-white dark:bg-[#0D3834] font-mono text-[11px] text-[#163A38] dark:text-[#F1F5F4]">
                  Valor Fatura − Valor Odoo (calculado individualmente por par)
                </code>
              </li>
              <li>
                <strong>Integridade das Fontes:</strong> Os valores de cada lançamento original
                permanecem imutáveis (congelados). Valores conciliados, não conciliados e
                divergentes são agregados a partir dos dados originais extraídos.
              </li>
              <li>
                <strong>Taxa de Conciliação:</strong>{' '}
                <code className="px-1.5 py-0.5 rounded bg-white dark:bg-[#0D3834] font-mono text-[11px] text-[#163A38] dark:text-[#F1F5F4]">
                  (Pares Conciliados / Total de Registros Classificados) × 100 ={' '}
                  {metrics.percentualConciliacao}%
                </code>
              </li>
            </ul>
          </div>
        )}

        {/* Grade de 5 Cartões Financeiros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* 1. Total Original da Fatura */}
          <div className="p-4 rounded-xl bg-[#F4F8F7] dark:bg-[#071F1D] border border-[#00796F]/15 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#647875] dark:text-[#A7C4C0] mb-1.5">
              <span className="font-semibold">Total Original da Fatura</span>
              <CreditCard className="w-4 h-4 text-[#00796F] dark:text-[#20BFA9]" />
            </div>
            <div>
              <p className="text-xl font-black text-[#163A38] dark:text-[#F1F5F4] font-mono tracking-tight">
                {formatCurrency(metrics.totalValorFatura)}
              </p>
              <p className="text-[11px] text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                {metrics.totalRegistrosFatura} lançamentos válidos
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-[#00796F]/10 text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Fonte: Documento da Fatura (Itaú)
            </div>
          </div>

          {/* 2. Total Original do Odoo */}
          <div className="p-4 rounded-xl bg-[#F4F8F7] dark:bg-[#071F1D] border border-[#00796F]/15 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#647875] dark:text-[#A7C4C0] mb-1.5">
              <span className="font-semibold">Total Original do Odoo</span>
              <Database className="w-4 h-4 text-[#00796F] dark:text-[#20BFA9]" />
            </div>
            <div>
              <p className="text-xl font-black text-[#163A38] dark:text-[#F1F5F4] font-mono tracking-tight">
                {formatCurrency(metrics.totalValorSistema)}
              </p>
              <p className="text-[11px] text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                {metrics.totalRegistrosSistema} lançamentos contábeis
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-[#00796F]/10 text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Fonte: Lançamento de Diário Odoo
            </div>
          </div>

          {/* 3. Diferença Bruta entre as Fontes */}
          <div className="p-4 rounded-xl bg-[#F4F8F7] dark:bg-[#071F1D] border border-[#00796F]/15 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-[#647875] dark:text-[#A7C4C0] mb-1.5">
              <span className="font-semibold">Diferença Bruta Fontes</span>
              <Scale className={`w-4 h-4 ${isZeroDiff ? 'text-emerald-600' : 'text-rose-600'}`} />
            </div>
            <div>
              <p
                className={`text-xl font-black font-mono tracking-tight ${isZeroDiff ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
              >
                {formatDifferenceValue(metrics.diferencaTotal)}
              </p>
              <p className="text-[11px] text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                Fórmula: Total Fatura − Total Odoo
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-[#00796F]/10 text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              {isZeroDiff ? 'Zero de resíduo contábil' : 'Diferença líquida a justificar'}
            </div>
          </div>

          {/* 4. Valor Total Conciliado */}
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300/50 dark:border-emerald-800/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 mb-1.5">
              <span className="font-semibold">Valor Total Conciliado</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono tracking-tight">
                {formatCurrency(metrics.totalValorConciliadoFatura)}
              </p>
              <p className="text-[11px] text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                {metrics.paresConciliados} transações 100% casadas
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-200/50 dark:border-emerald-800/50 text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">
              Taxa de Sucesso: {metrics.percentualConciliacao}%
            </div>
          </div>

          {/* 5. Valores Pendentes de Análise */}
          <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-300/50 dark:border-rose-800/50 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 mb-1.5">
              <span className="font-semibold">Pendentes de Análise</span>
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="text-xl font-black text-rose-700 dark:text-rose-400 font-mono tracking-tight">
                {formatCurrency(
                  metrics.totalValorExclusivoFatura + metrics.totalValorExclusivoSistema,
                )}
              </p>
              <p className="text-[11px] text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                {metrics.somenteFatura + metrics.somenteSistema} registros exclusivos
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-rose-200/50 dark:border-rose-800/50 text-[10px] text-rose-700 dark:text-rose-400 font-medium">
              Fat: {formatCurrency(metrics.totalValorExclusivoFatura)} • Od:{' '}
              {formatCurrency(metrics.totalValorExclusivoSistema)}
            </div>
          </div>
        </div>
      </div>

      {/* 3. SEÇÃO DE GRÁFICOS VISUAIS: DISTRIBUIÇÃO E COMPARAÇÃO FINANCEIRA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico 1: Distribuição das Transações por Categoria de Status */}
        <div className="rounded-2xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-[#00796F]/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                Distribuição dos Registros por Status
              </h4>
            </div>
            <span className="text-[11px] font-semibold text-[#647875] dark:text-[#A7C4C0]">
              Total: {totalClassificados}
            </span>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: any, name: any) => [`${val} registros`, name]}
                  contentStyle={{
                    backgroundColor: '#0D3834',
                    border: '1px solid #00796F',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legenda Discreta e Interativa */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#00796F]/10 text-xs">
            {statusPieData.map((d) => (
              <button
                key={d.name}
                type="button"
                onClick={() => handleCardClick(d.status as any)}
                className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-[#F4F8F7] dark:hover:bg-[#071F1D] text-left transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <div className="truncate">
                  <p className="font-semibold text-[#163A38] dark:text-[#F1F5F4] truncate">
                    {d.name}
                  </p>
                  <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0] font-mono">
                    {d.value} ({Math.round((d.value / totalClassificados) * 100)}%)
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Gráfico 2: Comparativo de Volume Financeiro (R$) */}
        <div className="rounded-2xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-[#00796F]/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                Volume Financeiro por Categoria (R$)
              </h4>
            </div>
            <span className="text-[11px] font-semibold text-[#647875] dark:text-[#A7C4C0]">
              Valores Originais & Agregados
            </span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={financialBarData}
                margin={{ top: 10, right: 10, left: 0, bottom: 25 }}
              >
                <XAxis
                  dataKey="categoria"
                  tick={{ fontSize: 10, fill: '#647875' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#647875' }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [formatCurrency(Number(val)), 'Total (R$)']}
                  contentStyle={{
                    backgroundColor: '#0D3834',
                    border: '1px solid #00796F',
                    borderRadius: '0.75rem',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {financialBarData.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-[#00796F]/10 flex items-center justify-between text-[11px] text-[#647875] dark:text-[#A7C4C0]">
            <span>
              Fatura Original:{' '}
              <strong className="font-mono text-[#163A38] dark:text-[#F1F5F4]">
                {formatCurrency(metrics.totalValorFatura)}
              </strong>
            </span>
            <span>
              Odoo Original:{' '}
              <strong className="font-mono text-[#163A38] dark:text-[#F1F5F4]">
                {formatCurrency(metrics.totalValorSistema)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
