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
    <div className={`p-4 rounded-xl border ${getRowClass(r.status)} shadow-sm`}>
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold">{r.data}</span>
        <Badge
          variant="outline"
          className="bg-white/50 dark:bg-black/20 font-semibold border-current/20 shadow-none"
        >
          {statusLabel(r.status)}
        </Badge>
      </div>
      <div className="space-y-2 text-sm">
        <p>
          <span className="opacity-70">Parceiro:</span>{' '}
          <strong className="font-semibold">{r.parceiro}</strong>
        </p>
        <p>
          <span className="opacity-70">Estabelecimento:</span>{' '}
          <strong className="font-semibold">{r.estabelecimento}</strong>
        </p>
        {bank === 'itau' && r.numero && (
          <p>
            <span className="opacity-70">Número:</span>{' '}
            <strong className="font-semibold">{r.numero}</strong>
          </p>
        )}
        {bank === 'itau' && r.referencia && (
          <p>
            <span className="opacity-70">Referência:</span>{' '}
            <strong className="font-semibold">{r.referencia}</strong>
          </p>
        )}
        {bank === 'santander' && r.lancamentoDiario && (
          <p>
            <span className="opacity-70">Lançamento Diário:</span>{' '}
            <strong className="font-semibold">{r.lancamentoDiario}</strong>
          </p>
        )}
        <p>
          <span className="opacity-70">Categoria:</span>{' '}
          <strong className="font-semibold">{r.categoria}</strong>
        </p>
        <div className="flex justify-between pt-3 border-t border-current/10 mt-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold opacity-60">Crédito</span>
            <span className="font-bold">{formatCurrency(r.credito)}</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[10px] uppercase font-bold opacity-60">Fatura</span>
            <span className="font-bold">{formatCurrency(r.valorFatura)}</span>
          </div>
        </div>
        {r.status !== 'RED' && r.diferenca !== null && (
          <div className="flex justify-between pt-2 mt-1">
            <span className="text-[10px] uppercase font-bold opacity-60">Diferença</span>
            <span className="font-bold">{formatCurrency(r.diferenca)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
