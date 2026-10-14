import React, { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type {
  BankType,
  ReconciliationResult,
  SystemRecord,
  CardRecord,
  ReconciliationMetrics,
} from '@/lib/types'
import { calculateReconciliationMetrics } from '@/lib/reconciliation'
import type { InvoiceConversionResult } from '@/lib/pdf-to-excel-converter'
import type { OdooImportResult } from '@/lib/odoo-importer'

export interface ReconciliationSessionData {
  bank: BankType
  results: ReconciliationResult[]
  systemRecords: SystemRecord[]
  cardRecords: CardRecord[]
  invoiceConversion: InvoiceConversionResult | null
  odooImport: OdooImportResult | null
  metrics: ReconciliationMetrics | null
  executedAt: string | null
}

interface ReconciliationContextType {
  lastSession: ReconciliationSessionData | null
  hasSession: boolean
  saveSession: (data: {
    bank: BankType
    results: ReconciliationResult[]
    systemRecords: SystemRecord[]
    cardRecords: CardRecord[]
    invoiceConversion: InvoiceConversionResult | null
    odooImport: OdooImportResult | null
  }) => void
  clearSession: () => void
}

const ReconciliationContext = createContext<ReconciliationContextType | undefined>(undefined)

export function ReconciliationProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ReconciliationSessionData | null>(null)

  const saveSession = ({
    bank,
    results,
    systemRecords,
    cardRecords,
    invoiceConversion,
    odooImport,
  }: {
    bank: BankType
    results: ReconciliationResult[]
    systemRecords: SystemRecord[]
    cardRecords: CardRecord[]
    invoiceConversion: InvoiceConversionResult | null
    odooImport: OdooImportResult | null
  }) => {
    // Calcula métricas estritas com base nos registros originais congelados
    const metrics =
      results && results.length > 0
        ? calculateReconciliationMetrics(results, systemRecords, cardRecords, bank)
        : null

    setSession({
      bank,
      results,
      systemRecords,
      cardRecords,
      invoiceConversion,
      odooImport,
      metrics,
      executedAt: new Date().toISOString(),
    })
  }

  const clearSession = () => {
    setSession(null)
  }

  const value = useMemo(
    () => ({
      lastSession: session,
      hasSession: Boolean(session && session.results && session.results.length > 0),
      saveSession,
      clearSession,
    }),
    [session],
  )

  return <ReconciliationContext.Provider value={value}>{children}</ReconciliationContext.Provider>
}

export function useReconciliationSession() {
  const context = useContext(ReconciliationContext)
  if (!context) {
    throw new Error('useReconciliationSession deve ser usado dentro de um ReconciliationProvider')
  }
  return context
}
