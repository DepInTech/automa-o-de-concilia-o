import { useState } from 'react'
import { BankSelector } from '@/components/bank-selector'
import { UploadZone } from '@/components/upload-zone'
import { SummaryCards } from '@/components/summary-cards'
import { ResultsTable } from '@/components/results-table'
import { StructuredValidation } from '@/components/structured-validation'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Database,
  FileText,
  ArrowRight,
  RefreshCw,
  Wand2,
  Loader2,
  AlertTriangle,
  FileSpreadsheet,
  Download,
} from 'lucide-react'
import { bankLabels } from '@/lib/bank-config'
import {
  convertInvoicePdfToExcel,
  type InvoiceConversionResult,
} from '@/lib/pdf-to-excel-converter'
import { importOdooFile, type OdooImportResult } from '@/lib/odoo-importer'
import { reconcileData } from '@/lib/reconciliation'
import { downloadXlsxFile } from '@/lib/xlsx-generator'
import { generateSystemCSV, downloadCSV } from '@/lib/sample-csv'
import { createMockInvoicePdfFile } from '@/lib/sample-pdf'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import type { BankType, SystemRecord, CardRecord, ReconciliationResult } from '@/lib/types'

type Step = 'upload' | 'validation' | 'results'

export default function Index() {
  const [bank, setBank] = useState<BankType>('itau')
  const [step, setStep] = useState<Step>('upload')
  const [systemFile, setSystemFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)

  // Resultados dos módulos estruturados
  const [invoiceConversion, setInvoiceConversion] = useState<InvoiceConversionResult | null>(null)
  const [odooImport, setOdooImport] = useState<OdooImportResult | null>(null)

  // Registros mapeados para o motor de conciliação
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([])
  const [cardRecords, setCardRecords] = useState<CardRecord[]>([])
  const [results, setResults] = useState<ReconciliationResult[]>([])

  const [isProcessing, setIsProcessing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleBankChange = (b: BankType) => {
    setBank(b)
    setSystemFile(null)
    setCardFile(null)
    setInvoiceConversion(null)
    setOdooImport(null)
    setSystemRecords([])
    setCardRecords([])
    setResults([])
    setParseError(null)
    setStep('upload')
  }

  /**
   * ETAPAS 1 e 2: Upload e Conversão da Fatura PDF para Excel + Importação do Odoo
   */
  const handleProcessFiles = async () => {
    setIsProcessing(true)
    setParseError(null)

    try {
      // 1. Processamento e conversão da Fatura PDF para Excel Estruturado
      let convResult: InvoiceConversionResult
      if (cardFile) {
        convResult = await convertInvoicePdfToExcel(cardFile, cardFile.name)
        if (!convResult.sucesso) {
          throw new Error(
            convResult.erroCritico ||
              'Não foi possível converter a fatura em PDF para Excel. Verifique se o arquivo está legível.',
          )
        }
      } else {
        // Fallback de demonstração caso nenhum arquivo tenha sido selecionado
        const demoCardPdf = createMockInvoicePdfFile(bank)
        convResult = await convertInvoicePdfToExcel(demoCardPdf, `fatura_${bank}_exemplo.pdf`)
      }

      // 2. Importação independente do Odoo (Planilha .xlsx ou .csv)
      let odooRes: OdooImportResult
      if (systemFile) {
        odooRes = await importOdooFile(systemFile, systemFile.name)
        if (!odooRes.sucesso) {
          throw new Error(
            odooRes.erro ||
              'Não encontramos as colunas mínimas do Odoo (Data/Parceiro/Total) na planilha enviada.',
          )
        }
      } else {
        // Monta odooRes a partir dos dados de demonstração
        const demoSysFile = new File([''], 'odoo_relatorio_sistema.xlsx')
        odooRes = {
          sucesso: true,
          registros: MOCK_SYSTEM_RECORDS.map((s, idx) => ({
            id: s.id,
            linhaOrigem: idx + 2,
            data: s.data,
            parceiro: s.parceiro,
            parceiroNormalizado: s.parceiro.toLowerCase(),
            numero: s.numero,
            referencia: s.referencia,
            categoria: s.categoria,
            debito: s.debito,
            credito: s.credito,
            total: s.total ?? s.credito,
            rawRow: {},
          })),
          detectedRows: MOCK_SYSTEM_RECORDS.length,
          totalMonetario: MOCK_SYSTEM_RECORDS.reduce((acc, s) => acc + (s.total ?? s.credito), 0),
          colunaTotalDetectada: 'Total',
          colunaParceiroDetectada: 'Parceiro',
          colunaDataDetectada: 'Data',
          colunasEncontradas: ['Data', 'Número', 'Referência', 'Parceiro', 'Total'],
          avisos: [],
        }
      }

      // Prepara os registros para os próximos passos
      const mappedCards: CardRecord[] = convResult.registros.map((r) => ({
        id: r.id,
        data: r.data,
        estabelecimento: r.descricaoOriginal,
        valor: r.valorReais,
        categoria: r.tipo,
        isInternacional: r.tipo === 'Internacional',
        moedaGlobal: r.moedaOriginal,
        parcela: r.parcela,
        cartaoTitular: r.portador,
        paginaOrigem: r.paginaOrigem,
        confianca: r.confianca,
      }))

      const mappedSystem: SystemRecord[] = odooRes.registros.map((r) => ({
        id: r.id,
        data: r.data,
        parceiro: r.parceiro,
        lancamentoDiario: r.lancamentoDiario,
        numero: r.numero,
        referencia: r.referencia,
        categoria: r.categoria,
        debito: r.debito,
        credito: r.credito,
        total: r.total,
        linhaOrigem: r.linhaOrigem,
      }))

      setInvoiceConversion(convResult)
      setOdooImport(odooRes)
      setCardRecords(mappedCards)
      setSystemRecords(mappedSystem)

      // Avança para a Etapa 3 & 4 (Validação e Conferência Prévia)
      setStep('validation')
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Erro ao processar arquivos. Verifique os formatos (.xlsx/.csv para Sistema e .pdf para Fatura).',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  /**
   * ETAPA 5: Iniciar Conciliação Automática
   */
  const handleConfirmReconciliation = () => {
    const reconciled = reconcileData(systemRecords, cardRecords, bank)
    setResults(reconciled)
    setStep('results')
  }

  const handleDownloadConvertedInvoice = () => {
    if (invoiceConversion?.excelBlob) {
      downloadXlsxFile(invoiceConversion.excelBlob, invoiceConversion.nomeArquivoExcel)
    }
  }

  const handleReset = () => {
    setStep('upload')
    setSystemFile(null)
    setCardFile(null)
    setInvoiceConversion(null)
    setOdooImport(null)
    setSystemRecords([])
    setCardRecords([])
    setResults([])
    setParseError(null)
  }

  const handleDemoData = async () => {
    setIsProcessing(true)
    setParseError(null)
    try {
      const demoCardPdf = createMockInvoicePdfFile(bank)
      const convResult = await convertInvoicePdfToExcel(
        demoCardPdf,
        `fatura_${bank}_demonstracao.pdf`,
      )

      const odooRes: OdooImportResult = {
        sucesso: true,
        registros: MOCK_SYSTEM_RECORDS.map((s, idx) => ({
          id: s.id,
          linhaOrigem: idx + 2,
          data: s.data,
          parceiro: s.parceiro,
          parceiroNormalizado: s.parceiro.toLowerCase(),
          numero: s.numero,
          referencia: s.referencia,
          categoria: s.categoria,
          debito: s.debito,
          credito: s.credito,
          total: s.total ?? s.credito,
          rawRow: {},
        })),
        detectedRows: MOCK_SYSTEM_RECORDS.length,
        totalMonetario: MOCK_SYSTEM_RECORDS.reduce((acc, s) => acc + (s.total ?? s.credito), 0),
        colunaTotalDetectada: 'Total',
        colunaParceiroDetectada: 'Parceiro',
        colunaDataDetectada: 'Data',
        colunasEncontradas: ['Data', 'Número', 'Referência', 'Parceiro', 'Total'],
        avisos: [],
      }

      const mappedCards: CardRecord[] = convResult.registros.map((r) => ({
        id: r.id,
        data: r.data,
        estabelecimento: r.descricaoOriginal,
        valor: r.valorReais,
        categoria: r.tipo,
        isInternacional: r.tipo === 'Internacional',
        moedaGlobal: r.moedaOriginal,
        parcela: r.parcela,
        cartaoTitular: r.portador,
        paginaOrigem: r.paginaOrigem,
        confianca: r.confianca,
      }))

      const mappedSystem: SystemRecord[] = odooRes.registros.map((r) => ({
        id: r.id,
        data: r.data,
        parceiro: r.parceiro,
        lancamentoDiario: r.lancamentoDiario,
        numero: r.numero,
        referencia: r.referencia,
        categoria: r.categoria,
        debito: r.debito,
        credito: r.credito,
        total: r.total,
        linhaOrigem: r.linhaOrigem,
      }))

      setInvoiceConversion(convResult)
      setOdooImport(odooRes)
      setCardRecords(mappedCards)
      setSystemRecords(mappedSystem)
      setSystemFile(new File([''], 'odoo_relatorio_sistema.xlsx'))
      setCardFile(demoCardPdf)
      setStep('validation')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Falha ao carregar demonstração.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleDownloadSystemSample = () => {
    downloadCSV(generateSystemCSV(bank), `modelo_sistema_odoo_${bank}.csv`)
  }

  // ETAPA 3 & 4: Tela de Conferência Prévia e Validação Estruturada
  if (step === 'validation') {
    return (
      <StructuredValidation
        conversionResult={invoiceConversion}
        odooResult={odooImport}
        onDownloadConvertedInvoice={handleDownloadConvertedInvoice}
        onConfirmReconciliation={handleConfirmReconciliation}
        onBack={handleReset}
        bank={bank}
      />
    )
  }

  // ETAPA 6 & 7: Tela de Resultados e Exportação
  if (step === 'results') {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-fade-in">
        {/* Banner / Cabeçalho Corporativo Grupo EPA */}
        <div className="relative overflow-hidden rounded-2xl border border-[#00796F]/20 bg-gradient-to-r from-[#004A46] via-[#00796F] to-[#042B28] p-6 sm:p-8 text-white shadow-md">
          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-semibold text-white/90 mb-2.5">
                <span className="w-2 h-2 rounded-full bg-[#20BFA9] animate-pulse" />
                Auditoria e Conciliação Concluída
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Resultado da Conciliação
              </h1>
              <p className="text-sm text-white/80 mt-1 font-medium">
                {bankLabels[bank]} • {results.length} registros analisados lado a lado
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {invoiceConversion?.excelBlob && (
                <Button
                  variant="outline"
                  onClick={handleDownloadConvertedInvoice}
                  className="bg-white/15 text-white hover:bg-white hover:text-[#00796F] border-white/30 font-semibold rounded-xl text-xs sm:text-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel da Fatura
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleReset}
                className="bg-white/95 text-[#004A46] hover:bg-white hover:text-[#00796F] border-none shadow-md font-semibold rounded-xl"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Nova Conciliação
              </Button>
            </div>
          </div>
        </div>

        {/* Indicadores Redesenhados */}
        <SummaryCards
          results={results}
          systemRecordsCount={systemRecords.length}
          cardRecordsCount={cardRecords.length}
        />

        {/* Tabela de Resultados Lado a Lado com Exportação */}
        <ResultsTable
          data={results}
          systemRecords={systemRecords}
          cardRecords={cardRecords}
          bank={bank}
          onDownloadConvertedInvoice={handleDownloadConvertedInvoice}
          hasConvertedInvoice={!!invoiceConversion?.excelBlob}
        />
      </div>
    )
  }

  // ETAPA 1: Upload dos Arquivos
  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-fade-in">
      {/* Cabeçalho de Boas-Vindas & Identidade EPA */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F8F7] dark:bg-[#00796F]/20 border border-[#00796F]/20 text-[#004A46] dark:text-[#20BFA9] text-xs font-bold uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
          Gestão Financeira • Grupo EPA
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
          Conciliação Financeira
        </h1>
        <p className="text-[#647875] dark:text-[#A7C4C0] text-base sm:text-lg max-w-2xl mx-auto">
          Envie a fatura do cartão em PDF e o Lançamento de Diário do Odoo em Excel para conversão e
          conciliação automática.
        </p>
      </div>

      {/* Seletor de Banco */}
      <div className="flex justify-center">
        <BankSelector bank={bank} onChange={handleBankChange} />
      </div>

      {parseError && (
        <Alert variant="destructive" className="rounded-xl shadow-sm">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold">Erro ao Processar</AlertTitle>
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      {/* Cards de Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Campo 1: Sistema (Odoo) - Planilha */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-[#004A46] dark:text-[#20BFA9] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#00796F]" /> Sistema (Odoo)
            </h2>
            <span className="text-[11px] font-semibold text-[#00796F] dark:text-[#20BFA9] bg-[#F4F8F7] dark:bg-[#071F1D] px-2.5 py-0.5 rounded-full border border-[#00796F]/15">
              Planilha do Sistema (.xlsx / .csv)
            </span>
          </div>
          <UploadZone
            title="Planilha do Sistema (Odoo)"
            id="system-file"
            file={systemFile}
            onChange={setSystemFile}
            onDownloadSample={handleDownloadSystemSample}
            acceptType="spreadsheet"
            description="Envie a planilha original de Lançamento de Diário do Odoo."
            subDescription="Mapeia automaticamente Data, Número, Parceiro, Referência, Diário e Total sem posições fixas."
            badgeText="Planilha do Sistema"
          />
        </div>

        {/* Campo 2: Fatura do Cartão - PDF */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-rose-600" />
              Fatura do Cartão ({bankLabels[bank]})
            </h2>
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200/50">
              Fatura em PDF • Conversor Automático
            </span>
          </div>
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            acceptType="card"
            description="Envie o PDF original da fatura Itaú (nacionais e internacionais)."
            subDescription="O sistema converterá o PDF em Excel (.xlsx) com conferência de transações antes de conciliar."
            badgeText="Fatura em PDF"
          />
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-2">
        <Button
          variant="outline"
          onClick={handleDemoData}
          size="lg"
          disabled={isProcessing}
          className="w-full sm:w-auto h-12 px-6 rounded-xl border-[#00796F]/30 hover:border-[#00796F] text-[#004A46] dark:text-[#20BFA9] bg-white dark:bg-[#0D3834] hover:bg-[#F4F8F7] dark:hover:bg-[#00796F]/20 font-semibold shadow-sm transition-all"
        >
          <Wand2 className="w-4 h-4 mr-2 text-[#00796F] dark:text-[#20BFA9]" /> Usar Dados de
          Demonstração
        </Button>
        <Button
          onClick={handleProcessFiles}
          size="lg"
          disabled={isProcessing}
          className="w-full sm:w-auto h-12 px-8 rounded-xl font-bold shadow-lg shadow-[#00796F]/20 text-white bg-[#00796F] hover:bg-[#004A46] transition-all"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Convertendo PDF e Lendo Odoo...
            </>
          ) : (
            <>
              Converter PDF e Validar Dados <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
