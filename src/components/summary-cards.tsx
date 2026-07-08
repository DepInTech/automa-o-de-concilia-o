import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult } from '@/lib/types'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  DollarSign,
  ListOrdered,
  FileText,
} from 'lucide-react'

export function SummaryCards({ results }: { results: ReconciliationResult[] }) {
  const conciliated = results.filter((r) => r.status === 'GREEN')
  const divergent = results.filter((r) => r.status === 'YELLOW')
  const missing = results.filter((r) => r.status === 'RED')

  const onlyInSystem = missing.filter((r) => r.origem === 'SISTEMA')
  const onlyInInvoice = missing.filter((r) => r.origem === 'FATURA')

  const totalSystem = results.filter((r) => r.credito !== null).length
  const totalInvoice =
    results.filter((r) => r.valorFatura !== null && r.status !== 'GREEN').length +
    conciliated.length

  const valConciliated = conciliated.reduce((acc, r) => acc + (r.credito || 0), 0)
  const valPending = [...divergent, ...missing].reduce((acc, r) => {
    if (r.status === 'YELLOW') return acc + Math.abs(r.diferenca || 0)
    if (r.status === 'RED') return acc + (r.credito || r.valorFatura || 0)
    return acc
  }, 0)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Total de Registros
          </CardTitle>
          <ListOrdered className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-slate-800 dark:text-white">
                {totalSystem}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Sistema
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-slate-800 dark:text-white">
                {totalInvoice}
              </span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Fatura
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Registros importados</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Status da Conciliação
          </CardTitle>
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-xl font-bold text-emerald-600">{conciliated.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Verdes
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-amber-600">{divergent.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Amarelos
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-rose-600">{missing.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Vermelhos
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Distribuição de resultados
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Registros Ausentes
          </CardTitle>
          <XCircle className="h-4 w-4 text-rose-600" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-rose-600">{onlyInSystem.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Só Sistema
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-rose-600">{onlyInInvoice.length}</span>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Só Fatura
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-medium mt-1">Sem contraparte</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
            Resumo Financeiro
          </CardTitle>
          <DollarSign className="h-4 w-4 text-slate-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-600">
            {formatCurrency(valConciliated)}
          </div>
          <p className="text-xs text-amber-600 font-medium mt-1">
            Pendente: {formatCurrency(valPending)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
