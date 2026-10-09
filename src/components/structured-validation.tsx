import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  FileSpreadsheet,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Database,
  CheckCircle2,
  Download,
  Search,
  Eye,
  ShieldCheck,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { InvoiceConversionResult, InvoiceExtractedRecord } from '@/lib/pdf-to-excel-converter'
import type { OdooImportResult, OdooParsedRecord } from '@/lib/odoo-importer'
import type { BankType } from '@/lib/types'

interface StructuredValidationProps {
  conversionResult: InvoiceConversionResult | null
  odooResult: OdooImportResult | null
  onDownloadConvertedInvoice: () => void
  onConfirmReconciliation: () => void
  onBack: () => void
  bank: BankType
}

export function StructuredValidation({
  conversionResult,
  odooResult,
  onDownloadConvertedInvoice,
  onConfirmReconciliation,
  onBack,
  bank,
}: StructuredValidationProps) {
  const [activeTab, setActiveTab] = useState<'invoice' | 'odoo'>('invoice')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [odooSearch, setOdooSearch] = useState('')

  const invoiceRecords = conversionResult?.registros || []
  const odooRecords = odooResult?.registros || []
  const invoiceSummary = conversionResult?.resumo
  const hasCriticalErrors =
    !conversionResult?.sucesso ||
    !odooResult?.sucesso ||
    invoiceRecords.length === 0 ||
    odooRecords.length === 0

  const filteredInvoice = invoiceRecords.filter((r) => {
    const q = invoiceSearch.toLowerCase()
    return (
      r.descricaoOriginal.toLowerCase().includes(q) ||
      r.nomeNormalizado.toLowerCase().includes(q) ||
      r.data.includes(q) ||
      r.valorReais.toString().includes(q)
    )
  })

  const filteredOdoo = odooRecords.filter((r) => {
    const q = odooSearch.toLowerCase()
    return (
      r.parceiro.toLowerCase().includes(q) ||
      (r.numero || '').toLowerCase().includes(q) ||
      (r.referencia || '').toLowerCase().includes(q) ||
      r.data.includes(q) ||
      r.total.toString().includes(q)
    )
  })

  const totalInvoice = invoiceSummary?.totalValorReais ?? 0
  const totalOdoo = odooResult?.totalMonetario ?? 0
  const diferencaPreliminar = Math.round((totalInvoice - totalOdoo) * 100) / 100

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Cabeçalho do Fluxo com Identidade EPA */}
      <div className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#00796F] dark:text-[#20BFA9]">
            <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9] animate-pulse" />
            Etapas 2, 3 e 4 • Conversão, Validação e Conferência Prévia
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            PDF Convertido em Excel Estruturado (.xlsx)
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
          Conferência e Validação dos Dados Extraídos
        </h1>
        <p className="text-[#647875] dark:text-[#A7C4C0] text-sm sm:text-base mt-1.5 max-w-3xl">
          Verifique se a extração da fatura foi correta e confira as quantidades e totais antes de
          iniciar a conciliação automática. Você pode baixar a planilha Excel gerada a qualquer
          momento.
        </p>

        {/* Botão de Download do Excel Convertido no Cabeçalho */}
        <div className="mt-4 pt-4 border-t border-[#00796F]/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[#647875] dark:text-[#A7C4C0]">
            <FileSpreadsheet className="w-4 h-4 text-[#00796F]" />
            <span>
              Planilha gerada com abas <strong>"Transações"</strong> e{' '}
              <strong>"Resumo da Extração"</strong>
            </span>
          </div>
          <Button
            onClick={onDownloadConvertedInvoice}
            variant="outline"
            className="rounded-xl border-[#00796F]/30 hover:border-[#00796F] text-[#004A46] dark:text-[#20BFA9] bg-[#F4F8F7] dark:bg-[#071F1D] font-semibold text-xs sm:text-sm"
          >
            <Download className="w-4 h-4 mr-2 text-[#00796F]" /> Baixar Excel Convertido (.xlsx)
          </Button>
        </div>
      </div>

      {/* Alertas de Inconsistência ou Avisos */}
      {invoiceSummary?.avisos && invoiceSummary.avisos.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 rounded-xl">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400 font-semibold">
            Avisos da Extração da Fatura
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-500 text-xs sm:text-sm space-y-1">
            {invoiceSummary.avisos.map((aviso, idx) => (
              <p key={idx}>• {aviso}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {/* Cards com os Totais Validados */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card Fatura PDF Convertida */}
        <Card className="rounded-2xl border-2 border-rose-300/40 bg-white dark:bg-[#0D3834] shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-rose-600" /> Fatura do Cartão (PDF)
            </CardTitle>
            <Badge
              variant="outline"
              className="text-[10px] font-bold bg-rose-50 text-rose-700 border-rose-200"
            >
              {invoiceRecords.length} lançamentos válidos
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
              {formatCurrency(totalInvoice)}
            </div>
            <div className="text-xs text-[#647875] dark:text-[#A7C4C0] flex justify-between">
              <span>Arquivo: {invoiceSummary?.nomeArquivo || 'fatura.pdf'}</span>
              <span>{invoiceSummary?.quantidadePaginas || 1} pág(s)</span>
            </div>
            <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0] flex justify-between">
              <span>Falhas de leitura: {invoiceSummary?.registrosComFalha ?? 0}</span>
              {invoiceSummary?.quantidadeRevisao ? (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {invoiceSummary.quantidadeRevisao} p/ conferência
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Card Sistema Odoo */}
        <Card className="rounded-2xl border-2 border-[#00796F]/30 bg-white dark:bg-[#0D3834] shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#00796F]" /> Sistema (Odoo)
            </CardTitle>
            <Badge
              variant="outline"
              className="text-[10px] font-bold bg-[#F4F8F7] text-[#004A46] border-[#00796F]/30"
            >
              {odooRecords.length} lançamentos válidos
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
              {formatCurrency(totalOdoo)}
            </div>
            <div className="text-xs text-[#647875] dark:text-[#A7C4C0] flex justify-between">
              <span>Aba: {odooResult?.abaUtilizada || 'Planilha'}</span>
              <span>Valores inválidos: {odooResult?.valoresInvalidos ?? 0}</span>
            </div>
            <div className="text-[11px] text-[#647875] dark:text-[#A7C4C0]">
              Coluna: {odooResult?.colunaTotalDetectada || 'Total / Montante'} (
              {odooResult?.colunasEncontradas?.length || 5} colunas)
            </div>
          </CardContent>
        </Card>
        {/* Card Comparativo Inicial */}
        <Card className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D3834] shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-[#647875] dark:text-[#A7C4C0] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#00796F]" /> Comparação Bruta
            </CardTitle>
            <Badge variant="outline" className="text-[10px] font-bold">
              {Math.abs(diferencaPreliminar) < 0.01 ? 'Equilibrado' : 'Diferença Bruta'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-2xl sm:text-3xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
              {diferencaPreliminar > 0
                ? `+${formatCurrency(diferencaPreliminar)}`
                : formatCurrency(diferencaPreliminar)}
            </div>
            <p className="text-xs text-[#647875] dark:text-[#A7C4C0] leading-snug">
              "A quantidade de registros extraídos não precisa ser igual à do Odoo. A diferença é
              justamente o que a conciliação identificará."
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Abas de Navegação e Visualização dos Dados Convertidos */}
      <div className="rounded-2xl border border-[#00796F]/20 bg-white dark:bg-[#0D3834] overflow-hidden shadow-sm">
        <div className="p-4 border-b border-[#00796F]/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#F4F8F7]/50 dark:bg-[#071F1D]/50">
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'invoice' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('invoice')}
              className={
                activeTab === 'invoice'
                  ? 'bg-rose-700 hover:bg-rose-800 text-white rounded-xl'
                  : 'rounded-xl border-rose-300/40 text-rose-700'
              }
            >
              <FileText className="w-4 h-4 mr-2" /> Fatura Convertida ({invoiceRecords.length})
            </Button>
            <Button
              variant={activeTab === 'odoo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('odoo')}
              className={
                activeTab === 'odoo'
                  ? 'bg-[#00796F] hover:bg-[#004A46] text-white rounded-xl'
                  : 'rounded-xl border-[#00796F]/30 text-[#004A46] dark:text-[#20BFA9]'
              }
            >
              <Database className="w-4 h-4 mr-2" /> Lançamentos Odoo ({odooRecords.length})
            </Button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#647875]" />
            <Input
              placeholder={activeTab === 'invoice' ? 'Buscar na fatura...' : 'Buscar no Odoo...'}
              value={activeTab === 'invoice' ? invoiceSearch : odooSearch}
              onChange={(e) =>
                activeTab === 'invoice'
                  ? setInvoiceSearch(e.target.value)
                  : setOdooSearch(e.target.value)
              }
              className="pl-9 h-9 text-xs rounded-xl border-[#00796F]/20 bg-white dark:bg-[#0D3834]"
            />
          </div>
        </div>

        {/* Tabela de Transações da Fatura Convertida */}
        {activeTab === 'invoice' && (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F8F7] dark:bg-[#071F1D] text-[#004A46] dark:text-[#20BFA9] font-bold sticky top-0 border-b border-[#00796F]/10">
                <tr>
                  <th className="py-2.5 px-3">Pág.</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Descrição Original</th>
                  <th className="py-2.5 px-3">Nome Normalizado</th>
                  <th className="py-2.5 px-3">Tipo</th>
                  <th className="py-2.5 px-3">Parcela</th>
                  <th className="py-2.5 px-3 text-right">Valor em R$</th>
                  <th className="py-2.5 px-3 text-center">Confiança</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#00796F]/10">
                {filteredInvoice.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#F4F8F7]/50 dark:hover:bg-[#071F1D]/50">
                    <td className="py-2 px-3 font-mono text-[#647875]">{rec.paginaOrigem}</td>
                    <td className="py-2 px-3 font-mono">{rec.data}</td>
                    <td className="py-2 px-3 font-medium">{rec.descricaoOriginal}</td>
                    <td className="py-2 px-3 text-[#647875] dark:text-[#A7C4C0]">
                      {rec.nomeNormalizado}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          rec.tipo === 'Internacional'
                            ? 'bg-blue-100 text-blue-800'
                            : rec.tipo === 'Estorno'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {rec.tipo}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[#647875]">{rec.parcela || '-'}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {formatCurrency(rec.valorReais)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="font-mono text-[11px] font-bold text-emerald-600">
                        {rec.confianca}%
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredInvoice.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#647875]">
                      Nenhuma transação encontrada com o termo pesquisado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tabela de Lançamentos do Odoo */}
        {activeTab === 'odoo' && (
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F4F8F7] dark:bg-[#071F1D] text-[#004A46] dark:text-[#20BFA9] font-bold sticky top-0 border-b border-[#00796F]/10">
                <tr>
                  <th className="py-2.5 px-3">Linha</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Parceiro</th>
                  <th className="py-2.5 px-3">Parceiro Normalizado</th>
                  <th className="py-2.5 px-3">Número / NF</th>
                  <th className="py-2.5 px-3">Referência</th>
                  <th className="py-2.5 px-3 text-right">Total (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#00796F]/10">
                {filteredOdoo.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#F4F8F7]/50 dark:hover:bg-[#071F1D]/50">
                    <td className="py-2 px-3 font-mono text-[#647875]">{rec.linhaOrigem}</td>
                    <td className="py-2 px-3 font-mono">{rec.data}</td>
                    <td className="py-2 px-3 font-medium">{rec.parceiro}</td>
                    <td className="py-2 px-3 text-[#647875] dark:text-[#A7C4C0]">
                      {rec.parceiroNormalizado}
                    </td>
                    <td className="py-2 px-3 font-mono text-[#647875]">{rec.numero || '-'}</td>
                    <td className="py-2 px-3 text-[#647875]">{rec.referencia || '-'}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {formatCurrency(rec.total)}
                    </td>
                  </tr>
                ))}
                {filteredOdoo.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#647875]">
                      Nenhum lançamento encontrado com o termo pesquisado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barra de Ações: Voltar ou Iniciar Conciliação */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          onClick={onBack}
          className="rounded-xl border-[#00796F]/30 hover:border-[#00796F] text-[#004A46] dark:text-[#20BFA9] bg-white dark:bg-[#0D3834]"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao Upload
        </Button>
        <Button
          size="lg"
          onClick={onConfirmReconciliation}
          disabled={hasCriticalErrors}
          className="h-12 px-8 text-base font-bold shadow-lg rounded-xl text-white bg-[#00796F] hover:bg-[#004A46] transition-all"
        >
          Iniciar Conciliação Automática <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  )
}
