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

  // Identifica "Somente Sistema" se não tiver Estabelecimento atribuído
  const onlySystem = results.filter(
    (r) => r.status === 'RED' && (!r.estabelecimento || r.estabelecimento === '-'),
  )
  // Identifica "Somente Fatura" se não tiver Parceiro atribuído
  const onlyInvoice = results.filter(
    (r) => r.status === 'RED' && (!r.parceiro || r.parceiro === '-'),
  )

  // Contadores baseados na existência real dos dados
  const totalSystem = results.filter((r) => r.parceiro && r.parceiro !== '-').length
  const totalInvoice = results.filter((r) => r.estabelecimento && r.estabelecimento !== '-').length

  const totalCreditoSistema = results.reduce((acc, r) => acc + (r.credito || 0), 0)
  const totalValorFatura = results.reduce((acc, r) => acc + (r.valorFatura || 0), 0)

  // Soma a diferença APENAS dos registros Amarelos (Divergentes)
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
      color: 'text-[#00796F] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: 'Registros Fatura',
      value: totalInvoice.toString(),
      icon: FileText,
      color: 'text-[#004A46] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
    {
      label: 'Conciliados (Verde)',
      value: conciliated.length.toString(),
      icon: CheckCircle2,
      color: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-500/15',
    },
    {
      label: 'Divergentes (Amarelo)',
      value: divergent.length.toString(),
      icon: AlertTriangle,
      color: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/15',
    },
    {
      label: 'Somente Sistema',
      value: onlySystem.length.toString(),
      icon: Building2,
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/15',
    },
    {
      label: 'Somente Fatura',
      value: onlyInvoice.length.toString(),
      icon: XCircle,
      color: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-500/15',
    },
    {
      label: 'Total Crédito Sistema',
      value: formatCurrency(totalCreditoSistema),
      icon: DollarSign,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: 'Total Valor Fatura',
      value: formatCurrency(totalValorFatura),
      icon: CreditCard,
      color: 'text-[#163A38] dark:text-[#F1F5F4]',
      bg: 'bg-[#F4F8F7] dark:bg-[#071F1D]',
    },
    {
      label: 'Diferença Total',
      value: formatCurrency(diferencaTotal),
      icon: Scale,
      color:
        diferencaTotal === 0
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-rose-700 dark:text-rose-400',
      bg:
        diferencaTotal === 0
          ? 'bg-emerald-50 dark:bg-emerald-950/30'
          : 'bg-rose-50 dark:bg-rose-950/30',
    },
    {
      label: 'Percentual Conciliação',
      value: `${percentual.toFixed(1)}%`,
      icon: Percent,
      color: 'text-[#00796F] dark:text-[#20BFA9]',
      bg: 'bg-[#F4F8F7] dark:bg-[#00796F]/20',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => {
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
              <p className={`text-base font-bold ${m.color} truncate tracking-tight`}>{m.value}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
