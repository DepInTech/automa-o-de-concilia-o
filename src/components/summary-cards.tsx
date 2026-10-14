import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult, SystemRecord, CardRecord, BankType } from '@/lib/types'
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
  Building2,
  Layers,
} from 'lucide-react'

export interface SummaryCardsProps {
  results: ReconciliationResult[]
  systemRecords?: SystemRecord[]
  cardRecords?: CardRecord[]
  systemRecordsCount?: number
  cardRecordsCount?: number
  bank?: BankType
}

export function SummaryCards({
  results,
  systemRecords,
  cardRecords,
  systemRecordsCount,
  cardRecordsCount,
  bank = 'itau',
}: SummaryCardsProps) {
  const metrics = calculateReconciliationMetrics(
    results,
    systemRecords ?? systemRecordsCount,
    cardRecords ?? cardRecordsCount,
    bank,
  )

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

  // Contagem de não conciliados totais (soma dos dois vermelhos exclusivos)
  const totalNaoConciliados = metrics.somenteSistema + metrics.somenteFatura

  const secondaryMetrics = [
    {
      label: '1. Transações Fatura',
      value: metrics.totalRegistrosFatura.toString(),
      subValue: formatCurrency(metrics.totalValorFatura),
      icon: FileText,
      color: 'text-[#004A46] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: '2. Lançamentos Odoo',
      value: metrics.totalRegistrosSistema.toString(),
      subValue: formatCurrency(metrics.totalValorSistema),
      icon: Database,
      color: 'text-[#00796F] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: '3. Total Fatura (Orig.)',
      value: formatCurrency(metrics.totalValorFatura),
      subValue: `${metrics.totalRegistrosFatura} registros`,
      icon: CreditCard,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: '4. Total Odoo (Orig.)',
      value: formatCurrency(metrics.totalValorSistema),
      subValue: `${metrics.totalRegistrosSistema} lançamentos`,
      icon: DollarSign,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: '5. Dif. Total de Balanço',
      value: formatDifferenceValue(metrics.diferencaTotal),
      subValue: isZeroDiff ? 'Zero de resíduo' : 'Fatura − Odoo',
      icon: Scale,
      color: isZeroDiff
        ? 'text-emerald-700 dark:text-emerald-400'
        : 'text-rose-700 dark:text-rose-400',
      bg: isZeroDiff ? 'bg-emerald-50 dark:bg-emerald-500/15' : 'bg-rose-50 dark:bg-rose-500/15',
    },
    {
      label: '6. Dif. Pares Divergentes',
      value: formatCurrency(metrics.totalDiferencaDivergentes),
      subValue: `${metrics.paresDivergentes} pares com divergência`,
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/15',
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* SEÇÃO PRINCIPAL DE DESTAQUE: CONTAGEM DE LANÇAMENTOS POR STATUS (VERDE, AMARELO, VERMELHOS) */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
              Status da Conciliação • Contagem de Lançamentos
            </h2>
          </div>
          <span className="text-xs font-semibold text-[#647875] dark:text-[#A7C4C0]">
            Taxa de conciliação:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
              {metrics.percentualConciliacao}%
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: CONCILIADOS (VERDE) */}
          <Card className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/35 bg-gradient-to-br from-emerald-50/70 via-white to-white dark:from-emerald-950/30 dark:via-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />🟢 Conciliados
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/70 dark:bg-emerald-900/40 border border-emerald-300/50 flex items-center justify-center shrink-0">
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
                      {metrics.paresConciliados === 1 ? 'par pareado' : 'pares pareados'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-emerald-200/50 dark:border-emerald-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Fatura:</span>
                  <span className="font-bold text-[#163A38] dark:text-[#F1F5F4] font-mono">
                    {formatCurrency(metrics.totalValorConciliadoFatura)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Odoo:</span>
                  <span className="font-bold text-[#163A38] dark:text-[#F1F5F4] font-mono">
                    {formatCurrency(metrics.totalValorConciliadoSistema)}
                  </span>
                </div>
                <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  {metrics.correspondenciasExatas} exatos • {metrics.correspondenciasNomeSemelhante}{' '}
                  nome semelhante
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 2: DIVERGENTES (AMARELO) */}
          <Card className="relative overflow-hidden rounded-2xl border-2 border-amber-500/35 bg-gradient-to-br from-amber-50/70 via-white to-white dark:from-amber-950/30 dark:via-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />🟡 Divergentes
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-amber-100/70 dark:bg-amber-900/40 border border-amber-300/50 flex items-center justify-center shrink-0">
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
                      {metrics.paresDivergentes === 1 ? 'par com dif.' : 'pares com dif.'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-amber-200/50 dark:border-amber-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Dif. Acumulada:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 font-mono">
                    {formatCurrency(metrics.totalDiferencaDivergentes)}
                  </span>
                </div>
                {metrics.totalValorDivergentesFatura !== undefined && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#647875] dark:text-[#A7C4C0]">Fatura / Odoo:</span>
                    <span className="font-medium text-[#163A38] dark:text-[#F1F5F4] font-mono text-[11px]">
                      {formatCurrency(metrics.totalValorDivergentesFatura)} /{' '}
                      {formatCurrency(metrics.totalValorDivergentesSistema ?? 0)}
                    </span>
                  </div>
                )}
                <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  Correspondência com divergência de valor
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 3: NÃO CONCILIADOS - SOMENTE SISTEMA (VERMELHO) */}
          <Card className="relative overflow-hidden rounded-2xl border-2 border-rose-500/35 bg-gradient-to-br from-rose-50/70 via-white to-white dark:from-rose-950/30 dark:via-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/60">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />🔴 Somente Sistema
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 dark:bg-rose-900/40 border border-rose-300/50 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Não Conciliados (Odoo)
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
                      {metrics.somenteSistema}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.somenteSistema === 1 ? 'lançamento' : 'lançamentos'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rose-200/50 dark:border-rose-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Valor no Odoo:</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                    {formatCurrency(metrics.totalValorExclusivoSistema)}
                  </span>
                </div>
                <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  Existe no Odoo e não foi encontrado na fatura
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CARD 4: NÃO CONCILIADOS - SOMENTE FATURA (VERMELHO) */}
          <Card className="relative overflow-hidden rounded-2xl border-2 border-rose-500/35 bg-gradient-to-br from-rose-50/70 via-white to-white dark:from-rose-950/30 dark:via-[#0D3834] dark:to-[#071F1D] shadow-md hover:shadow-lg transition-all">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600" />
            <CardContent className="p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300/60 dark:border-rose-700/60">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />🔴 Somente Fatura
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-rose-100/70 dark:bg-rose-900/40 border border-rose-300/50 flex items-center justify-center shrink-0">
                    <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                </div>

                <div className="mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
                    Não Conciliados (Fatura)
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <p className="text-3xl sm:text-4xl font-black text-rose-700 dark:text-rose-400 tracking-tight">
                      {metrics.somenteFatura}
                    </p>
                    <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-semibold">
                      {metrics.somenteFatura === 1 ? 'transação' : 'transações'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-rose-200/50 dark:border-rose-900/50 space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#647875] dark:text-[#A7C4C0]">Valor na Fatura:</span>
                  <span className="font-bold text-rose-700 dark:text-rose-400 font-mono">
                    {formatCurrency(metrics.totalValorExclusivoFatura)}
                  </span>
                </div>
                <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] pt-1">
                  Existe na fatura e não foi encontrado no Odoo
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Barra de resumo consolidado de Não Conciliados */}
        <div className="mt-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#0D3834] border border-[#00796F]/15 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#00796F] dark:text-[#20BFA9]" />
            <span className="font-bold text-[#163A38] dark:text-[#F1F5F4]">
              Total de Não Conciliados:
            </span>
            <span className="font-black text-rose-700 dark:text-rose-400">
              {totalNaoConciliados} lançamentos
            </span>
            <span className="text-[#647875] dark:text-[#A7C4C0]">
              ({metrics.somenteSistema} Odoo + {metrics.somenteFatura} Fatura)
            </span>
          </div>
          <div className="flex items-center gap-4 text-[#647875] dark:text-[#A7C4C0]">
            <span>
              Soma não conciliada Odoo:{' '}
              <strong className="text-rose-700 dark:text-rose-400 font-mono">
                {formatCurrency(metrics.totalValorExclusivoSistema)}
              </strong>
            </span>
            <span>
              Soma não conciliada Fatura:{' '}
              <strong className="text-rose-700 dark:text-rose-400 font-mono">
                {formatCurrency(metrics.totalValorExclusivoFatura)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* SEÇÃO SECUNDÁRIA: INDICADORES GLOBAIS DE AUDITORIA & FONTES ORIGINAIS */}
      <div>
        <div className="flex items-center gap-2 mb-2.5 px-1">
          <span className="w-2 h-2 rounded-full bg-[#004A46] dark:text-[#20BFA9]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0]">
            Totais Globais das Fontes Originais & Balanço Financeiro
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {secondaryMetrics.map((m) => {
            const Icon = m.icon
            return (
              <Card
                key={m.label}
                className="rounded-xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow transition-shadow"
              >
                <CardContent className="p-3.5 flex flex-col justify-between h-full space-y-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center ${m.bg}`}
                    >
                      <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                    </div>
                    <span className="text-[11px] font-semibold text-[#647875] dark:text-[#A7C4C0] leading-tight line-clamp-1">
                      {m.label}
                    </span>
                  </div>
                  <div>
                    <p className={`text-base font-bold ${m.color} truncate tracking-tight`}>
                      {m.value}
                    </p>
                    <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0] truncate mt-0.5">
                      {m.subValue}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
