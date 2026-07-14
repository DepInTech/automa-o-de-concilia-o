import type { BankType } from './types'

export const bankLabels: Record<BankType, string> = {
  itau: 'Banco Itaú',
  santander: 'Banco Santander',
}

export interface BankTheme {
  primary: string
  hover: string
  accent: string
  light: string
  border: string
}

export const bankThemes: Record<BankType, BankTheme> = {
  itau: {
    primary: 'bg-orange-600',
    hover: 'hover:bg-orange-700',
    accent: 'text-orange-600',
    light: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-400',
  },
  santander: {
    primary: 'bg-red-600',
    hover: 'hover:bg-red-700',
    accent: 'text-red-600',
    light: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-400',
  },
}
