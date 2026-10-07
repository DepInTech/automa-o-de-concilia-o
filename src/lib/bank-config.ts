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
    primary: 'bg-[#008F83]',
    hover: 'hover:bg-[#006B67]',
    accent: 'text-[#008F83] dark:text-[#20C9A6]',
    light: 'bg-[#DDF5F0]/60 dark:bg-[#008F83]/15',
    border: 'border-[#008F83]/40',
  },
  santander: {
    primary: 'bg-[#008F83]',
    hover: 'hover:bg-[#006B67]',
    accent: 'text-[#008F83] dark:text-[#20C9A6]',
    light: 'bg-[#DDF5F0]/60 dark:bg-[#008F83]/15',
    border: 'border-[#008F83]/40',
  },
}
