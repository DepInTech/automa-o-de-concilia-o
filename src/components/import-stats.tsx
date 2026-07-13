import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { FileSpreadsheet, ArrowRight, ArrowLeft, AlertTriangle, Database } from 'lucide-react'

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
}: ImportStatsProps) {
  const hasError = sysTotal === 0 || cardTotal === 0
  const hasImportError = !!importError

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Confirmacao de Importacao
        </h1>
        <p className="text-slate-500 text-lg">
          Revise os dados importados antes de iniciar a conciliacao.
        </p>
      </div>

      {warning && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400">
            Aviso de Importacao
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-500">
            {warning}
          </AlertDescription>
        </Alert>
      )}

      {hasError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro de Importacao</AlertTitle>
          <AlertDescription>
            Um ou mais arquivos não puderam ser importados. Verifique os arquivos e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {importError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Perda de Dados Detectada</AlertTitle>
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Sistema (Odoo)
            </CardTitle>
            <Database className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <FileSpreadsheet className="h-5 w-5 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 truncate">
                {sysFileName || 'Dados de demonstração'}
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {sysTotal}{' '}
              <span className="text-base font-normal text-slate-500">registros importados</span>
            </div>
            {sysDetected > sysTotal && (
              <p className="text-xs text-rose-600 font-semibold mt-2">
                {sysDetected} registros detectados no arquivo
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Fatura do Cartao
            </CardTitle>
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-2">
              <FileSpreadsheet className="h-5 w-5 text-slate-400 shrink-0" />
              <span className="text-sm text-slate-500 truncate">
                {cardFileName || 'Dados de demonstração'}
              </span>
            </div>
            <div className="text-3xl font-bold text-slate-900 dark:text-white">
              {cardTotal}{' '}
              <span className="text-base font-normal text-slate-500">registros importados</span>
            </div>
            {cardDetected > cardTotal && (
              <p className="text-xs text-rose-600 font-semibold mt-2">
                {cardDetected} registros detectados no arquivo
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="bg-white dark:bg-slate-950">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={hasError || hasImportError}
          className="h-12 px-8 text-base shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
        >
          Confirmar Conciliacao <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  )
}
