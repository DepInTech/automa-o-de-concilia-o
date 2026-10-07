import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FileSpreadsheet, ArrowRight, ArrowLeft, AlertTriangle, Database } from 'lucide-react'
import { bankLabels, bankThemes } from '@/lib/bank-config'
import type { BankType } from '@/lib/types'

interface ImportStatsProps {
  sysTotal: number
  cardTotal: number
  sysDetected: number
  cardDetected: number
  sysFileName: string
  cardFileName: string
  warning: string | null
  importError: string | null
  onConfirm: () => void
  onBack: () => void
  bank: BankType
}

export function ImportStats({
  sysTotal,
  cardTotal,
  sysDetected,
  cardDetected,
  sysFileName,
  cardFileName,
  warning,
  importError,
  onConfirm,
  onBack,
  bank,
}: ImportStatsProps) {
  const hasError = sysTotal === 0 || cardTotal === 0
  const hasImportError = !!importError
  const theme = bankThemes[bank]

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      {/* Cabeçalho de Confirmação com Identidade EPA */}
      <div className="rounded-2xl border border-[#008F83]/20 bg-white dark:bg-[#0D3834] p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#008F83] dark:text-[#20C9A6] mb-2">
          <span className="w-2 h-2 rounded-full bg-[#008F83] dark:bg-[#20C9A6]" />
          Etapa 2 de 3 • Validação Prévia
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#12343B] dark:text-[#F1F5F4]">
          Confirmação de Importação
        </h1>
        <p className="text-[#64748B] dark:text-[#A7C4C0] text-sm sm:text-base mt-1.5">
          Revise os dados importados antes de iniciar a conciliação com {bankLabels[bank]}.
        </p>
      </div>

      {warning && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400 font-semibold">
            Aviso de Importação
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-500">
            {warning}
          </AlertDescription>
        </Alert>
      )}

      {hasError && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Erro de Importação</AlertTitle>
          <AlertDescription>
            Um ou mais arquivos não puderam ser importados. Verifique os arquivos e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {importError && (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Perda de Dados Detectada</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Sistema Odoo */}
        <Card className="rounded-2xl border border-[#008F83]/20 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-bold text-[#006B67] dark:text-[#20C9A6] flex items-center gap-2">
              <Database className="h-4 w-4 text-[#008F83]" />
              Sistema (Odoo)
            </CardTitle>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#DDF5F0] dark:bg-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6]">
              Origem Contábil
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F5F8F8] dark:bg-[#071F1D] border border-[#008F83]/15">
              <FileSpreadsheet className="h-4 w-4 text-[#008F83] shrink-0" />
              <span className="text-xs text-[#64748B] dark:text-[#A7C4C0] font-medium truncate">
                {sysFileName || 'Dados de demonstração (Odoo Contabilidade)'}
              </span>
            </div>
            <div>
              <div className="text-4xl font-black text-[#12343B] dark:text-[#F1F5F4] tracking-tight">
                {sysTotal}
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#A7C4C0] font-medium mt-1">
                registros importados com sucesso
              </p>
            </div>
            {sysDetected > sysTotal && (
              <p className="text-xs text-rose-600 font-semibold">
                {sysDetected} registros detectados no arquivo
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card Fatura do Cartão */}
        <Card className="rounded-2xl border border-[#008F83]/20 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-bold text-[#006B67] dark:text-[#20C9A6] flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#008F83] dark:text-[#20C9A6]" />
              Fatura do Cartão ({bankLabels[bank]})
            </CardTitle>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#DDF5F0] dark:bg-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6]">
              Extrato Bancário
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F5F8F8] dark:bg-[#071F1D] border border-[#008F83]/15">
              <FileSpreadsheet className="h-4 w-4 text-[#008F83] shrink-0" />
              <span className="text-xs text-[#64748B] dark:text-[#A7C4C0] font-medium truncate">
                {cardFileName || `Dados de demonstração (${bankLabels[bank]})`}
              </span>
            </div>
            <div>
              <div className="text-4xl font-black text-[#12343B] dark:text-[#F1F5F4] tracking-tight">
                {cardTotal}
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#A7C4C0] font-medium mt-1">
                registros importados com sucesso
              </p>
            </div>
            {cardDetected > cardTotal && (
              <p className="text-xs text-rose-600 font-semibold">
                {cardDetected} registros detectados no arquivo
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="rounded-xl border-[#008F83]/30 hover:border-[#008F83] text-[#006B67] dark:text-[#20C9A6] bg-white dark:bg-[#0D3834] hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/20"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={hasError || hasImportError}
          className="h-12 px-8 text-base font-semibold shadow-lg rounded-xl text-white bg-[#008F83] hover:bg-[#006B67] transition-all"
        >
          Confirmar Conciliação <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  )
}
