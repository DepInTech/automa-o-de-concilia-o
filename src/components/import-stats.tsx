import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { bankLabels } from '@/lib/bank-config'
import type { BankType, CardRecord } from '@/lib/types'
import {
  FileSpreadsheet,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Database,
  CheckCircle2,
  Eye,
} from 'lucide-react'
import type { StructuredCardRecord } from '@/lib/card-pdf-parser'

interface ImportStatsProps {
  sysTotal: number
  cardTotal: number
  sysDetected: number
  cardDetected: number
  sysFileName: string
  cardFileName: string
  warning: string | null
  importError: string | null
  cardPreviewRecords?: (CardRecord | StructuredCardRecord)[]
  isPdfSource?: boolean
  numPagesPdf?: number
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
  cardPreviewRecords = [],
  isPdfSource = true,
  numPagesPdf,
  onConfirm,
  onBack,
  bank,
}: ImportStatsProps) {
  const hasError = sysTotal === 0 || cardTotal === 0
  const hasImportError = !!importError

  // Mostra até 8 registros representativos na pré-visualização
  const previewSlice = cardPreviewRecords.slice(0, 8)

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Cabeçalho de Confirmação com Identidade EPA */}
      <div className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#00796F] dark:text-[#20BFA9]">
            <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
            Etapa 2 de 3 • Confirmação de Importação
          </div>
          {isPdfSource && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Processamento Direto de PDF (Sem Macro)
            </div>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#163A38] dark:text-[#F1F5F4]">
          Confirmação de Importação
        </h1>
        <p className="text-[#647875] dark:text-[#A7C4C0] text-sm sm:text-base mt-1.5">
          Revise os dados importados do Odoo e extraídos do PDF da fatura antes de iniciar a
          conciliação.
        </p>
      </div>

      {warning && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400 font-semibold">
            Aviso de Leitura
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
            Não foi possível identificar os dados da fatura neste PDF ou na planilha. Verifique se o
            arquivo está legível e tente novamente.
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

      {/* Cards de Resumo dos Arquivos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card Sistema Odoo */}
        <Card className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-bold text-[#004A46] dark:text-[#20BFA9] flex items-center gap-2">
              <Database className="h-4 w-4 text-[#00796F]" />
              Sistema (Odoo)
            </CardTitle>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F8F7] dark:bg-[#00796F]/20 text-[#004A46] dark:text-[#20BFA9]">
              Planilha Contábil
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F4F8F7] dark:bg-[#071F1D] border border-[#00796F]/15">
              <FileSpreadsheet className="h-4 w-4 text-[#00796F] shrink-0" />
              <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-medium truncate">
                {sysFileName || 'arquivo_sistema_odoo.xlsx (Demonstração)'}
              </span>
            </div>
            <div>
              <div className="text-4xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
                {sysTotal}
              </div>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] font-medium mt-1">
                {sysTotal} registros importados
              </p>
            </div>
            {sysDetected > sysTotal && (
              <p className="text-xs text-rose-600 font-semibold">
                {sysDetected} registros detectados no arquivo
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card Fatura do Cartão (PDF) */}
        <Card className="rounded-2xl border border-rose-300/40 dark:border-rose-900/40 bg-white dark:bg-[#0D3834] shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-bold text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-rose-600" />
              Fatura do Cartão ({bankLabels[bank]})
            </CardTitle>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/50">
              Origem: Fatura PDF
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-rose-50/40 dark:bg-[#071F1D] border border-rose-200/40">
              <FileText className="h-4 w-4 text-rose-600 shrink-0" />
              <span className="text-xs text-[#647875] dark:text-[#A7C4C0] font-medium truncate">
                {cardFileName || `fatura_${bank}.pdf (Demonstração)`}
              </span>
            </div>
            <div>
              <div className="text-4xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
                {cardTotal}
              </div>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] font-medium mt-1">
                {cardTotal} registros encontrados
              </p>
            </div>
            <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] flex items-center gap-2">
              <span>Leitura direta de PDF sem macro</span>
              {numPagesPdf && (
                <span>
                  • {numPagesPdf} {numPagesPdf === 1 ? 'página' : 'páginas'}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seção de Pré-Visualização dos Dados Extraídos da Fatura */}
      {previewSlice.length > 0 && (
        <div className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-[#00796F]/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-[#F4F8F7]/50 dark:bg-[#071F1D]/50">
            <div>
              <h3 className="font-bold text-base text-[#163A38] dark:text-[#F1F5F4] flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#00796F] dark:text-[#20BFA9]" />
                Fatura do Cartão — dados identificados
              </h3>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] mt-0.5">
                Prévia da extração estruturada do PDF ({cardTotal} registros encontrados no total)
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
              {cardTotal} registros encontrados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#F4F8F7] dark:bg-[#071F1D] text-[#004A46] dark:text-[#20BFA9] font-bold border-b border-[#00796F]/10">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Número</th>
                  <th className="py-3 px-4">Referência</th>
                  <th className="py-3 px-4">Estabelecimento</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#00796F]/10">
                {previewSlice.map((rec, idx) => {
                  const structured = rec as StructuredCardRecord
                  return (
                    <tr
                      key={rec.id || idx}
                      className="hover:bg-[#F4F8F7]/60 dark:hover:bg-[#071F1D]/60 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono font-medium text-[#163A38] dark:text-[#F1F5F4]">
                        {rec.data || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-[#647875] dark:text-[#A7C4C0]">
                        {structured.numero || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-[#647875] dark:text-[#A7C4C0]">
                        {structured.referencia || '-'}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-[#163A38] dark:text-[#F1F5F4]">
                        {rec.estabelecimento}
                      </td>
                      <td className="py-2.5 px-4 text-[#647875] dark:text-[#A7C4C0]">
                        {rec.categoria || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-[#163A38] dark:text-[#F1F5F4]">
                        R$ {rec.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {cardTotal > previewSlice.length && (
            <div className="py-2 px-4 text-center bg-[#F4F8F7]/30 dark:bg-[#071F1D]/30 border-t border-[#00796F]/10 text-xs text-[#647875] dark:text-[#A7C4C0]">
              Exibindo 8 de {cardTotal} registros identificados na fatura. Todos serão conciliados.
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="rounded-xl border-[#00796F]/30 hover:border-[#00796F] text-[#004A46] dark:text-[#20BFA9] bg-white dark:bg-[#0D3834] hover:bg-[#F4F8F7] dark:hover:bg-[#00796F]/20"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button
          size="lg"
          onClick={onConfirm}
          disabled={hasError || hasImportError}
          className="h-12 px-8 text-base font-semibold shadow-lg rounded-xl text-white bg-[#00796F] hover:bg-[#004A46] transition-all"
        >
          Confirmar Conciliação <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  )
}
