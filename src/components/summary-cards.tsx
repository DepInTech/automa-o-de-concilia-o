import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult } from '@/lib/types'
import { calculateReconciliationMetrics } from '@/lib/reconciliation'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  FileText,
  DollarSign,
  CreditCard,
  Scale,
  Percent,
  Building2,
} from 'lucide-react'

export function SummaryCards({
  results,
  systemRecordsCount,
  cardRecordsCount,
}: {
  results: ReconciliationResult[]
  systemRecordsCount?: number
  cardRecordsCount?: number
}) {
  const metrics = calculateReconciliationMetrics(results, systemRecordsCount, cardRecordsCount)
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

  const secondaryMetrics = [
    {
      label: 'Registros Sistema (Odoo)',
      value: metrics.totalRegistrosSistema.toString(),
      icon: Database,
      color: 'text-[#00796F] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: 'Registros Fatura (PDF)',
      value: metrics.totalRegistrosFatura.toString(),
      icon: FileText,
      color: 'text-[#004A46] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: 'Conciliados (Verde)',
      value: metrics.paresConciliados.toString(),
      icon: CheckCircle2,
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    },
    {
      label: 'Divergentes (Amarelo)',
      value: metrics.paresDivergentes.toString(),
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/15',
    },
    {
      label: 'Somente Sistema',
      value: metrics.somenteSistema.toString(),
      icon: Building2,
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/15',
    },
    {
      label: 'Somente Fatura',
      value: metrics.somenteFatura.toString(),
      icon: XCircle,
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/15',
    },
    {
      label: 'Total Odoo (Sistema)',
      value: formatCurrency(metrics.totalValorSistema),
      icon: DollarSign,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: 'Total Fatura (Cartão)',
      value: formatCurrency(metrics.totalValorFatura),
      icon: CreditCard,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: 'Diferença Fatura − Odoo',
      value: formatDifferenceValue(metrics.diferencaTotal),
      icon: Scale,
      color: isZeroDiff
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-rose-700 dark:text-rose-400',
      bg: isZeroDiff ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-rose-50 dark:bg-rose-950/30',
    },
    {
      label: 'Percentual Conciliação',
      value: `${metrics.percentualConciliacao.toFixed(1)}%`,
      icon: Percent,
      color: 'text-[#00796F] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
  ]

  return (
    <div className="space-y-4">
      {/* LINHA SUPERIOR DE DESTAQUE PROEMINENTE: Três Totais Principais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Total Fatura */}
        <Card className="relative overflow-hidden rounded-2xl border-2 border-[#00796F]/25 bg-gradient-to-br from-white to-[#F4F8F7] dark:from-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#00796F]" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                Total Fatura
              </span>
              <p className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
                {formatCurrency(metrics.totalValorFatura)}
              </p>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0]">
                {metrics.totalRegistrosFatura} lançamentos na fatura
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#00796F]/10 dark:bg-[#00796F]/30 flex items-center justify-center shrink-0 border border-[#00796F]/20">
              <CreditCard className="w-6 h-6 text-[#00796F] dark:text-[#20BFA9]" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Total Sistema */}
        <Card className="relative overflow-hidden rounded-2xl border-2 border-[#00796F]/25 bg-gradient-to-br from-white to-[#F4F8F7] dark:from-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#004A46]" />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                Total Sistema
              </span>
              <p className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
                {formatCurrency(metrics.totalValorSistema)}
              </p>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0]">
                {metrics.totalRegistrosSistema} lançamentos no Odoo
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#004A46]/10 dark:bg-[#004A46]/30 flex items-center justify-center shrink-0 border border-[#004A46]/20">
              <DollarSign className="w-6 h-6 text-[#004A46] dark:text-[#20BFA9]" />
            </div>
          </CardContent>
        </Card>

        {/* 3. Diferença de Valor */}
        <Card
          className={`relative overflow-hidden rounded-2xl border-2 transition-all shadow-md hover:shadow-lg ${
            isZeroDiff
              ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-50/50 to-white dark:from-emerald-950/20 dark:to-[#0D3834]'
              : 'border-rose-500/40 bg-gradient-to-br from-rose-50/60 to-white dark:from-rose-950/25 dark:to-[#0D3834]'
          }`}
        >
          <div
            className={`absolute top-0 left-0 right-0 h-1.5 ${
              isZeroDiff ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                  Diferença
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isZeroDiff
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
                  }`}
                >
                  {isZeroDiff ? 'Equilibrado' : 'Resíduo Identificado'}
                </span>
              </div>
              <p
                className={`text-2xl sm:text-3xl font-black tracking-tight ${
                  isZeroDiff
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {formatDifferenceValue(metrics.diferencaTotal)}
              </p>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0]">
                {isZeroDiff
                  ? 'Fatura e Odoo sem resíduo de valor'
                  : metrics.diferencaTotal > 0
                    ? 'Fatura maior que o Sistema'
                    : 'Sistema maior que a Fatura'}
              </p>
            </div>
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                isZeroDiff
                  ? 'bg-emerald-100/60 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-400'
                  : 'bg-rose-100/60 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-400'
              }`}
            >
              <Scale className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade com os 10 indicadores complementares */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {secondaryMetrics.map((m) => {
          const Icon = m.icon
          return (
            <Card
              key={m.label}
              className="rounded-xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow transition-shadow"
            >
              <CardContent className="p-3.5 flex flex-col justify-between h-full">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${m.bg}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                  </div>
                  <span className="text-[11px] font-semibold text-[#647875] dark:text-[#A7C4C0] leading-tight">
                    {m.label}
                  </span>
                </div>
                <p className={`text-base font-bold ${m.color} truncate tracking-tight`}>
                  {m.value}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
