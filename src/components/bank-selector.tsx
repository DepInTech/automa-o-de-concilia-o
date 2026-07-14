import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BankType } from '@/lib/types'

interface BankSelectorProps {
  bank: BankType
  onChange: (bank: BankType) => void
}

export function BankSelector({ bank, onChange }: BankSelectorProps) {
  const banks: { key: BankType; label: string; activeClass: string }[] = [
    { key: 'itau', label: 'Banco Itaú', activeClass: 'bg-orange-600 text-white shadow-md' },
    { key: 'santander', label: 'Banco Santander', activeClass: 'bg-red-600 text-white shadow-md' },
  ]

  return (
    <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-1 shadow-sm">
      {banks.map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={() => onChange(b.key)}
          className={cn(
            'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2',
            bank === b.key
              ? b.activeClass
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
          )}
        >
          <Building2 className="w-4 h-4" />
          {b.label}
        </button>
      ))}
    </div>
  )
}
