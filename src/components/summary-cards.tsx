import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult } from '@/lib/types'
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

interface MetricConfig {
  label: string
  value: string
  icon: typeof Database
  color: string
  bg: string
}

export function SummaryCards({ results }: { results: ReconciliationResult[] }) {
  const conciliated = results.filter((r) => r.status === 'GREEN')
  const divergent = results.filter((r) => r.status === 'YELLOW')

  // 🟢 CORRIGIDO: Identifica "Somente Sistema" se não tiver Estabelecimento atribuído
  const onlySystem = results.filter(
    (r) => r.status === 'RED' && (!r.estabelecimento || r.estabelecimento === '-'),
  )
  // 🟢 CORRIGIDO: Identifica "Somente Fatura" se não tiver Parceiro atribuído
  const onlyInvoice = results.filter(
    (r) => r.status === 'RED' && (!r.parceiro || r.parceiro === '-'),
  )

  // Contadores baseados na existência real dos dados
  const totalSystem = results.filter((r) => r.parceiro && r.parceiro !== '-').length
  const totalInvoice = results.filter((r) => r.estabelecimento && r.estabelecimento !== '-').length

  const totalCreditoSistema = results.reduce((acc, r) => acc + (r.credito || 0), 0)
  const totalValorFatura = results.reduce((acc, r) => acc + (r.valorFatura || 0), 0)

  // 🟢 CORRIGIDO: Soma a diferença APENAS dos registros Amarelos (Divergentes)
  const diferencaTotal =
    Math.round(
      results.filter((r) => r.status === 'YELLOW').reduce((acc, r) => acc + (r.diferenca || 0), 0) *
        100,
    ) / 100

  const percentual = results.length > 0 ? (conciliated.length / results.length) * 100 : 0

  const metrics: MetricConfig[] = [
    {
      label: 'Registros Sistema',
      value: totalSystem.toString(),
      icon: Database,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'Registros Fatura',
      value: totalInvoice.toString(),
      icon: FileText,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    },
    {
      label: 'Conciliados (Verde)',
      value: conciliated.length.toString(),
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    },
    {
      label: 'Divergentes (Amarelo)',
      value: divergent.length.toString(),
      icon: AlertTriangle,
      color: 'text-amber-600',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
    },
    {
      label: 'Somente Sistema',
      value: onlySystem.length.toString(),
      icon: Building2,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-500/10',
    },
    {
      label: 'Somente Fatura',
      value: onlyInvoice.length.toString(),
      icon: XCircle,
      color: 'text-rose-600',
      bg: 'bg-rose-50 dark:bg-rose-500/10',
    },
    {
      label: 'Total Crédito Sistema',
      value: formatCurrency(totalCreditoSistema),
      icon: DollarSign,
      color: 'text-slate-700 dark:text-slate-300',
      bg: 'bg-slate-100 dark:bg-slate-800/50',
    },
    {
      label: 'Total Valor Fatura',
      value: formatCurrency(totalValorFatura),
      icon: CreditCard,
      color: 'text-slate-700 dark:text-slate-300',
      bg: 'bg-slate-100 dark:bg-slate-800/50',
    },
    {
      label: 'Diferença Total',
      value: formatCurrency(diferencaTotal),
      icon: Scale,
      color: diferencaTotal === 0 ? 'text-emerald-600' : 'text-rose-600',
      bg:
        diferencaTotal === 0
          ? 'bg-emerald-50 dark:bg-emerald-950/30'
          : 'bg-rose-50 dark:bg-rose-950/30',
    },
    {
      label: 'Percentual Conciliação',
      value: `${percentual.toFixed(1)}%`,
      icon: Percent,
      color: 'text-blue-600',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <Card key={m.label} className="shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md shrink-0 ${m.bg}`}>
                  <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-tight">
                  {m.label}
                </span>
              </div>
              <p className={`text-base font-bold ${m.color} truncate`}>{m.value}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
