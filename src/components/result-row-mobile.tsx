import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult, BankType } from '@/lib/types'

interface ResultRowMobileProps {
  r: ReconciliationResult
  bank: BankType
  getRowClass: (status: string) => string
  statusLabel: (s: string) => string
}

export function ResultRowMobile({ r, bank, getRowClass, statusLabel }: ResultRowMobileProps) {
  return (
    <div className={`p-4 rounded-2xl border ${getRowClass(r.status)} shadow-sm transition-all`}>
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-sm tracking-tight">{r.data}</span>
        <Badge
          variant="outline"
          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none ${
            r.status === 'GREEN'
              ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
              : r.status === 'YELLOW'
                ? 'bg-amber-100/90 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                : 'bg-rose-100/90 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
          }`}
        >
          {statusLabel(r.status)}
        </Badge>
      </div>
      <div className="space-y-1.5 text-xs sm:text-sm">
        <p>
          <span className="opacity-70 font-medium">Parceiro:</span>{' '}
          <strong className="font-semibold">{r.parceiro}</strong>
        </p>
        <p>
          <span className="opacity-70 font-medium">Estabelecimento:</span>{' '}
          <strong className="font-semibold">{r.estabelecimento}</strong>
        </p>
        {bank === 'itau' && r.numero && (
          <p>
            <span className="opacity-70 font-medium">Número:</span>{' '}
            <strong className="font-semibold font-mono">{r.numero}</strong>
          </p>
        )}
        {bank === 'itau' && r.referencia && (
          <p>
            <span className="opacity-70 font-medium">Referência:</span>{' '}
            <strong className="font-semibold">{r.referencia}</strong>
          </p>
        )}
        {bank === 'santander' && r.lancamentoDiario && (
          <p>
            <span className="opacity-70 font-medium">Lançamento Diário:</span>{' '}
            <strong className="font-semibold font-mono">{r.lancamentoDiario}</strong>
          </p>
        )}
        <p>
          <span className="opacity-70 font-medium">Categoria:</span>{' '}
          <strong className="font-semibold">{r.categoria}</strong>
        </p>
        <div className="flex justify-between pt-3 border-t border-current/10 mt-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold opacity-70">Crédito (Sistema)</span>
            <span className="font-bold text-sm">{formatCurrency(r.credito)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] uppercase font-bold opacity-70">Fatura (Cartão)</span>
            <span className="font-bold text-sm">{formatCurrency(r.valorFatura)}</span>
          </div>
        </div>
        {r.status !== 'RED' && r.diferenca !== null && (
          <div className="flex justify-between pt-2 mt-1 border-t border-current/10">
            <span className="text-[10px] uppercase font-bold opacity-70">Diferença</span>
            <span className="font-bold text-sm">{formatCurrency(r.diferenca)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
