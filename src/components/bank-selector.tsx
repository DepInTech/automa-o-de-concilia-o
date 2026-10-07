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
    <div className="inline-flex p-1.5 rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] shadow-sm">
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
                ? 'bg-[#00796F] text-white shadow-md shadow-[#00796F]/20 dark:bg-[#00796F] dark:text-white'
                : 'text-[#647875] dark:text-[#A7C4C0] hover:text-[#004A46] dark:hover:text-[#20BFA9] hover:bg-[#F4F8F7] dark:hover:bg-[#00796F]/10',
            )}
          >
            <Building2
              className={cn(
                'w-4 h-4',
                isActive ? 'text-white' : 'text-[#00796F] dark:text-[#20BFA9]',
              )}
            />
            <span>{b.label}</span>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#20BFA9]" />}
          </button>
        )
      })}
    </div>
  )
}
