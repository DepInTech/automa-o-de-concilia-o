import { useState } from 'react'
import { BankSelector } from '@/components/bank-selector'
import { UploadZone } from '@/components/upload-zone'
import { ImportStats } from '@/components/import-stats'
import { SummaryCards } from '@/components/summary-cards'
import { ResultsTable } from '@/components/results-table'
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
} from 'lucide-react'
import { bankLabels } from '@/lib/bank-config'
import { parseSystemFile, parseCardPdfFile } from '@/lib/file-parser'
import { mapSystemRecords } from '@/lib/csv-parser'
import { reconcileData } from '@/lib/reconciliation'
import { generateSystemCSV, downloadCSV } from '@/lib/sample-csv'
import { createMockInvoicePdfFile } from '@/lib/sample-pdf'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import type { StructuredCardRecord } from '@/lib/card-pdf-parser'
import type { BankType, SystemRecord, CardRecord, ReconciliationResult } from '@/lib/types'

type Step = 'upload' | 'confirm' | 'results'

export default function Index() {
  const [bank, setBank] = useState<BankType>('itau')
  const [step, setStep] = useState<Step>('upload')
  const [systemFile, setSystemFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([])
  const [cardRecords, setCardRecords] = useState<CardRecord[]>([])
  const [previewCardRecords, setPreviewCardRecords] = useState<
    (CardRecord | StructuredCardRecord)[]
  >([])
  const [previewSystemRecords, setPreviewSystemRecords] = useState<SystemRecord[]>([])
  const [sysDetected, setSysDetected] = useState(0)
  const [cardDetected, setCardDetected] = useState(0)
  const [cardPdfPages, setCardPdfPages] = useState<number | undefined>(undefined)
  const [results, setResults] = useState<ReconciliationResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleBankChange = (b: BankType) => {
    setBank(b)
    setSystemFile(null)
    setCardFile(null)
    setSystemRecords([])
    setCardRecords([])
    setPreviewCardRecords([])
    setResults([])
    setWarning(null)
    setImportError(null)
    setParseError(null)
    setStep('upload')
  }

  const handleProcessFiles = async () => {
    setIsProcessing(true)
    setParseError(null)
    setWarning(null)
    setImportError(null)

    try {
      let sysRecords: SystemRecord[]
      let cardRecs: CardRecord[]
      let sysDet = 0
      let cardDet = 0
      let pdfPages: number | undefined
      let identifiedWarning: string | null = null

      // 1. Processar Planilha do Sistema (Odoo): .xlsx ou .csv
      if (systemFile) {
        const sysParsed = await parseSystemFile(systemFile, bank)
        sysDet = sysParsed.detectedRows
        sysRecords = mapSystemRecords(sysParsed)
      } else {
        sysRecords = MOCK_SYSTEM_RECORDS
        sysDet = sysRecords.length
      }

      // 2. Processar Fatura do Cartão (Direto em PDF sem macro)
      if (cardFile) {
        const cardParsed = await parseCardPdfFile(cardFile, bank)
        pdfPages = cardParsed.numPages

        if (cardParsed.isScannedOrEmpty) {
          throw new Error(
            'Não foi possível identificar dados estruturados neste arquivo PDF. Ele parece ser escaneado ou uma imagem. O sistema requer um PDF pesquisável/legível ou com texto estruturado.',
          )
        }

        if (cardParsed.records.length === 0) {
          throw new Error(
            'Não foi possível identificar os dados da fatura neste PDF. Verifique se o arquivo está legível e tente novamente.',
          )
        }

        cardDet = cardParsed.detectedRows
        cardRecs = cardParsed.records
        setPreviewCardRecords(cardParsed.records)

        if (cardParsed.warning) {
          identifiedWarning = cardParsed.warning
        }
      } else {
        // Dados de demonstração como se viessem de PDF estruturado
        cardRecs = MOCK_CARD_RECORDS
        cardDet = cardRecs.length
        pdfPages = 2
        setPreviewCardRecords(MOCK_CARD_RECORDS)
      }

      setSystemRecords(sysRecords)
      setPreviewSystemRecords(sysRecords)
      setCardRecords(cardRecs)
      setSysDetected(sysDet)
      setCardDetected(cardDet)
      setCardPdfPages(pdfPages)
      setWarning(identifiedWarning)

      setStep('confirm')
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Erro ao processar arquivos. Verifique os formatos (.xlsx/.csv para Sistema e .pdf para Fatura) e tente novamente.',
      )
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirm = () => {
    const reconciled = reconcileData(systemRecords, cardRecords, bank)
    setResults(reconciled)
    setStep('results')
  }

  const handleReset = () => {
    setStep('upload')
    setSystemFile(null)
    setCardFile(null)
    setSystemRecords([])
    setCardRecords([])
    setPreviewCardRecords([])
    setResults([])
    setWarning(null)
    setImportError(null)
    setParseError(null)
  }

  const handleDemoData = () => {
    // Configura os arquivos de demonstração com XLSX para Sistema e PDF para Fatura
    const demoSysFile = new File([''], 'odoo_relatorio_sistema.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const demoCardPdf = createMockInvoicePdfFile(bank)

    setSystemRecords(MOCK_SYSTEM_RECORDS)
    setPreviewSystemRecords(MOCK_SYSTEM_RECORDS)
    setCardRecords(MOCK_CARD_RECORDS)
    setPreviewCardRecords(MOCK_CARD_RECORDS)
    setSysDetected(MOCK_SYSTEM_RECORDS.length)
    setCardDetected(MOCK_CARD_RECORDS.length)
    setCardPdfPages(2)
    setSystemFile(demoSysFile)
    setCardFile(demoCardPdf)
    setWarning(null)
    setImportError(null)
    setParseError(null)
    setStep('confirm')
  }

  const handleDownloadSystemSample = () => {
    downloadCSV(generateSystemCSV(bank), `modelo_sistema_odoo_${bank}.csv`)
  }

  if (step === 'confirm') {
    return (
      <ImportStats
        sysTotal={systemRecords.length}
        cardTotal={cardRecords.length}
        sysDetected={sysDetected}
        cardDetected={cardDetected}
        sysFileName={systemFile?.name ?? 'odoo_relatorio_sistema.xlsx'}
        cardFileName={cardFile?.name ?? `fatura_cartao_${bank}.pdf`}
        warning={warning}
        importError={importError}
        cardPreviewRecords={previewCardRecords}
        systemPreviewRecords={previewSystemRecords}
        isPdfSource={true}
        numPagesPdf={cardPdfPages}
        onConfirm={handleConfirm}
        onBack={handleReset}
        bank={bank}
      />
    )
  }

  if (step === 'results') {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-fade-in">
        {/* Banner / Cabeçalho Corporativo Grupo EPA */}
        <div className="relative overflow-hidden rounded-2xl border border-[#00796F]/20 bg-gradient-to-r from-[#004A46] via-[#00796F] to-[#042B28] p-6 sm:p-8 text-white shadow-md">
          {/* Elementos visuais sutis */}
          <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <div className="absolute right-24 -top-8 w-32 h-32 rounded-full bg-[#20BFA9]/10 blur-xl pointer-events-none" />
          <svg
            className="absolute right-4 bottom-2 w-32 h-32 text-white/5 pointer-events-none hidden sm:block"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            <path d="M50 0 C60 30 90 40 100 50 C70 60 60 90 50 100 C40 70 10 60 0 50 C30 40 40 10 50 0 Z" />
          </svg>

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
                {bankLabels[bank]} • {results.length} registros analisados
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleReset}
              className="bg-white/95 text-[#004A46] hover:bg-white hover:text-[#00796F] border-none shadow-md font-semibold rounded-xl"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Nova Conciliação
            </Button>
          </div>
        </div>

        {/* Indicadores Redesenhados */}
        <SummaryCards results={results} />

        {/* Tabela de Resultados */}
        <ResultsTable
          data={results}
          systemRecords={systemRecords}
          cardRecords={cardRecords}
          bank={bank}
        />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12 animate-fade-in">
      {/* Cabeçalho de Boas-Vindas & Identidade EPA */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F4F8F7] dark:bg-[#00796F]/20 border border-[#00796F]/20 text-[#004A46] dark:text-[#20BFA9] text-xs font-bold uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
          Gestão Financeira
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
          Conciliação Financeira
        </h1>
        <p className="text-[#647875] dark:text-[#A7C4C0] text-base sm:text-lg max-w-2xl mx-auto">
          Selecione o banco e faça upload dos arquivos para conciliação automática
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

      {/* Cards de Upload com clara distinção de formato */}
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
            description="Envie a planilha exportada do sistema Odoo."
            subDescription="Detecta automaticamente Data, Número, Parceiro, Referência, Diário e Total. Não requer edição ou renomeação."
            badgeText="Planilha do Sistema"
          />
        </div>
        {/* Campo 2: Fatura do Cartão - PDF Direto (Sem Macro) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-rose-600" />
              Fatura do Cartão ({bankLabels[bank]})
            </h2>
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200/50">
              Fatura em PDF • Sem Macro
            </span>
          </div>
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            acceptType="pdf"
            description="Envie a fatura original do cartão em PDF."
            subDescription="Arraste sua fatura em PDF aqui ou clique para buscar. Nunca requer conversão para Excel nem execução de macro."
            badgeText="Fatura em PDF"
          />
        </div>{' '}
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-2">
        <Button
          variant="outline"
          onClick={handleDemoData}
          size="lg"
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
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...
            </>
          ) : (
            <>
              Processar Arquivos <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
