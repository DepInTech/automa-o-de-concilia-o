import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BankType } from '@/lib/types'

interface BankSelectorProps {
  bank: BankType
  onChange: (bank: BankType) => void
}

export function BankSelector({ bank, onChange }: BankSelectorProps) {
  const banks: { key: BankType; label: string; badge: string }[] = [
    { key: 'itau', label: 'Banco Itaú', badge: 'Cartão Corporativo Itaú' },
    { key: 'santander', label: 'Banco Santander', badge: 'Extrato Santander' },
  ]

  return (
    <div className="inline-flex p-1.5 rounded-2xl border border-[#008F83]/20 bg-white dark:bg-[#0D3834] shadow-sm">
      {banks.map((b) => {
        const isActive = bank === b.key
        return (
          <button
            key={b.key}
            type="button"
            onClick={() => onChange(b.key)}
            className={cn(
              'px-6 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2.5 relative select-none',
              isActive
                ? 'bg-[#008F83] text-white shadow-md shadow-[#008F83]/20 dark:bg-[#008F83] dark:text-white'
                : 'text-[#64748B] dark:text-[#A7C4C0] hover:text-[#006B67] dark:hover:text-[#20C9A6] hover:bg-[#DDF5F0]/40 dark:hover:bg-[#008F83]/10',
            )}
          >
            <Building2
              className={cn(
                'w-4 h-4',
                isActive ? 'text-white' : 'text-[#008F83] dark:text-[#20C9A6]',
              )}
            />
            <span>{b.label}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#20C9A6]" />}
          </button>
        )
      })}
    </div>
  )
}
