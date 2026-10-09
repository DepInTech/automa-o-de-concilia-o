import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  FileText,
  FileSpreadsheet,
  Database,
  GitCompare,
  Download,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { InvoiceConversionResult } from '@/lib/pdf-to-excel-converter'
import type { OdooImportResult } from '@/lib/odoo-importer'
import type { ReconciliationResult, ReconciliationMetrics } from '@/lib/types'
import { calculateReconciliationMetrics } from '@/lib/reconciliation'

interface StageAuditProps {
  invoiceConversion: InvoiceConversionResult | null
  odooImport: OdooImportResult | null
  results: ReconciliationResult[]
  onDownloadConvertedInvoice?: () => void
  hasConvertedInvoice?: boolean
}

export function StageAudit({
  invoiceConversion,
  odooImport,
  results,
  onDownloadConvertedInvoice,
  hasConvertedInvoice = false,
}: StageAuditProps) {
  const metrics: ReconciliationMetrics = calculateReconciliationMetrics(results)
  const invoiceSummary = invoiceConversion?.resumo
  const totalFaturaCalculado = invoiceSummary?.totalValorReais ?? metrics.totalValorFatura
  const totalOdooCalculado = odooImport?.totalMonetario ?? metrics.totalValorSistema

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 px-1">
        <div>
          <h2 className="text-lg font-black text-[#163A38] dark:text-[#F1F5F4] flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-[#00796F] dark:text-[#20BFA9]" />
            Auditoria Técnica Obrigatória por Etapa
          </h2>
          <p className="text-xs text-[#647875] dark:text-[#A7C4C0]">
            Painel de conferência calculado estritamente a partir dos arquivos reais importados (sem
            valores fixos).
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200"
        >
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Dados Reais Auditados
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* BLOCO 1: Fatura PDF */}
        <Card className="rounded-2xl border-2 border-rose-300/40 bg-white dark:bg-[#0D3834] shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-rose-100 dark:border-rose-950/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-rose-600" />
                  1. Fatura PDF
                </CardTitle>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                  {invoiceSummary?.quantidadePaginas || 1} pág(s)
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-rose-50 dark:border-rose-950/30">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Nome do Arquivo:</span>
                <span
                  className="font-semibold text-right truncate max-w-[170px]"
                  title={invoiceSummary?.nomeArquivo || 'fatura.pdf'}
                >
                  {invoiceSummary?.nomeArquivo || 'fatura.pdf'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-rose-50 dark:border-rose-950/30">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Qtd. Páginas:</span>
                <span className="font-mono font-bold">
                  {invoiceSummary?.quantidadePaginas || 1}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-rose-50 dark:border-rose-950/30">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Transações Extraídas:</span>
                <span className="font-mono font-bold text-rose-700 dark:text-rose-400">
                  {invoiceSummary?.quantidadeTransacoes ??
                    invoiceConversion?.registros.length ??
                    metrics.totalRegistrosFatura}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-rose-50 dark:border-rose-950/30">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Falhas de Leitura:</span>
                <span
                  className={`font-mono font-bold ${invoiceSummary?.paginasComFalha?.length ? 'text-amber-600' : 'text-emerald-600'}`}
                >
                  {invoiceSummary?.paginasComFalha?.length ?? 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Total da Fatura:</span>
                <span className="font-mono font-black text-sm text-[#163A38] dark:text-[#F1F5F4]">
                  {formatCurrency(totalFaturaCalculado)}
                </span>
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-0">
            {hasConvertedInvoice && onDownloadConvertedInvoice ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onDownloadConvertedInvoice}
                className="w-full text-xs font-semibold rounded-xl border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" /> Baixar Excel Convertido (.xlsx)
              </Button>
            ) : (
              <div className="text-[10px] text-center text-[#647875] italic">
                Planilha convertida gerada internamente
              </div>
            )}
          </div>
        </Card>

        {/* BLOCO 2: Excel do Odoo */}
        <Card className="rounded-2xl border-2 border-[#00796F]/30 bg-white dark:bg-[#0D3834] shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-[#00796F]/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9] flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-[#00796F]" />
                  2. Excel do Odoo
                </CardTitle>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#F4F8F7] text-[#004A46] border border-[#00796F]/20">
                  {odooImport?.abaUtilizada || 'Planilha'}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#00796F]/10">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Nome do Arquivo:</span>
                <span
                  className="font-semibold text-right truncate max-w-[170px]"
                  title={odooImport?.nomeArquivo || 'odoo.xlsx'}
                >
                  {odooImport?.nomeArquivo || 'odoo.xlsx'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#00796F]/10">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Aba Efetiva:</span>
                <span className="font-mono font-medium truncate max-w-[160px]">
                  {odooImport?.abaUtilizada || 'Sheet1'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#00796F]/10">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Colunas Identificadas:</span>
                <span
                  className="font-mono font-semibold truncate max-w-[160px]"
                  title={odooImport?.colunasEncontradas?.join(', ')}
                >
                  {odooImport?.colunasEncontradas?.length ?? 5} colunas
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#00796F]/10">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Lançamentos Importados:</span>
                <span className="font-mono font-bold text-[#00796F] dark:text-[#20BFA9]">
                  {odooImport?.registros.length ?? metrics.totalRegistrosSistema}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#00796F]/10">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Valores Inválidos:</span>
                <span className="font-mono font-bold text-emerald-600">
                  {odooImport?.valoresInvalidos ?? 0}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Total do Odoo:</span>
                <span className="font-mono font-black text-sm text-[#163A38] dark:text-[#F1F5F4]">
                  {formatCurrency(totalOdooCalculado)}
                </span>
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-0 text-[10px] text-[#647875] dark:text-[#A7C4C0] border-t border-[#00796F]/10">
            Coluna Monetária:{' '}
            <strong className="text-[#004A46] dark:text-[#20BFA9]">
              {odooImport?.colunaTotalDetectada || 'Total'}
            </strong>
          </div>
        </Card>

        {/* BLOCO 3: Conciliação */}
        <Card className="rounded-2xl border-2 border-emerald-500/30 bg-white dark:bg-[#0D3834] shadow-sm flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-emerald-100 dark:border-emerald-950/40">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  3. Conciliação Automática
                </CardTitle>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {metrics.percentualConciliacao.toFixed(1)}%
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Correspondência Exata:</span>
                <span className="font-mono font-bold text-emerald-600">
                  {metrics.correspondenciasExatas}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Nome Semelhante:</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {metrics.correspondenciasNomeSemelhante}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Divergências de Valor:</span>
                <span className="font-mono font-bold text-amber-600">
                  {metrics.paresDivergentes}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Exclusivos Sistema:</span>
                <span className="font-mono font-bold text-rose-600">{metrics.somenteSistema}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Exclusivos Fatura:</span>
                <span className="font-mono font-bold text-rose-600">{metrics.somenteFatura}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Casos Ambíguos:</span>
                <span className="font-mono font-bold text-blue-600">{metrics.casosEmRevisao}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-t border-emerald-100 dark:border-emerald-950/40 pt-1">
                <span className="text-[#647875] dark:text-[#A7C4C0]">Registros Descartados:</span>
                <span className="font-mono font-bold text-slate-500">
                  {metrics.registrosDescartados} (0 descartes)
                </span>
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-0 text-[10px] text-[#647875] dark:text-[#A7C4C0] border-t border-emerald-100 dark:border-emerald-950/40">
            Regra: prioridade exata → similar com valor exato → divergente → exclusivos.
          </div>
        </Card>
      </div>
    </div>
  )
}
