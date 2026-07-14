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
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  Wand2,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { bankLabels, bankThemes } from '@/lib/bank-config'
import { parseFile } from '@/lib/file-parser'
import { mapSystemRecords, mapCardRecords } from '@/lib/csv-parser'
import { reconcileData } from '@/lib/reconciliation'
import { generateSystemCSV, generateCardCSV, downloadCSV } from '@/lib/sample-csv'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import type { BankType, SystemRecord, CardRecord, ReconciliationResult } from '@/lib/types'

type Step = 'upload' | 'confirm' | 'results'

export default function Index() {
  const [bank, setBank] = useState<BankType>('itau')
  const [step, setStep] = useState<Step>('upload')
  const [systemFile, setSystemFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>([])
  const [cardRecords, setCardRecords] = useState<CardRecord[]>([])
  const [sysDetected, setSysDetected] = useState(0)
  const [cardDetected, setCardDetected] = useState(0)
  const [results, setResults] = useState<ReconciliationResult[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const theme = bankThemes[bank]

  const handleBankChange = (b: BankType) => {
    setBank(b)
    setSystemFile(null)
    setCardFile(null)
    setSystemRecords([])
    setCardRecords([])
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
      let hasSanitized = false

      if (systemFile) {
        const parsed = await parseFile(systemFile, bank, 'system')
        sysDet = parsed.detectedRows
        sysRecords = mapSystemRecords(parsed)
        if (bank === 'itau' && parsed.detectedRows > parsed.rows.length) {
          hasSanitized = true
        }
      } else {
        sysRecords = MOCK_SYSTEM_RECORDS
        sysDet = sysRecords.length
      }

      if (cardFile) {
        const parsed = await parseFile(cardFile, bank, 'card')
        cardDet = parsed.detectedRows
        cardRecs = mapCardRecords(parsed)
        if (bank === 'itau' && parsed.detectedRows > parsed.rows.length) {
          hasSanitized = true
        }
      } else {
        cardRecs = MOCK_CARD_RECORDS
        cardDet = cardRecs.length
      }

      setSystemRecords(sysRecords)
      setCardRecords(cardRecs)
      setSysDetected(sysDet)
      setCardDetected(cardDet)

      if (hasSanitized) {
        setWarning(
          `Linhas administrativas foram detectadas e removidas automaticamente dos arquivos ${bankLabels[bank]}.`,
        )
      }

      setStep('confirm')
    } catch (err) {
      setParseError(
        err instanceof Error
          ? err.message
          : 'Erro ao processar arquivos. Verifique o formato e tente novamente.',
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
    setResults([])
    setWarning(null)
    setImportError(null)
    setParseError(null)
  }

  const handleDemoData = () => {
    setSystemRecords(MOCK_SYSTEM_RECORDS)
    setCardRecords(MOCK_CARD_RECORDS)
    setSysDetected(MOCK_SYSTEM_RECORDS.length)
    setCardDetected(MOCK_CARD_RECORDS.length)
    setSystemFile(null)
    setCardFile(null)
    setWarning(null)
    setImportError(null)
    setParseError(null)
    setStep('confirm')
  }

  const handleDownloadSystemSample = () => {
    downloadCSV(generateSystemCSV(bank), `modelo_sistema_${bank}.csv`)
  }

  const handleDownloadCardSample = () => {
    downloadCSV(generateCardCSV(bank), `modelo_fatura_${bank}.csv`)
  }

  if (step === 'confirm') {
    return (
      <ImportStats
        sysTotal={systemRecords.length}
        cardTotal={cardRecords.length}
        sysDetected={sysDetected}
        cardDetected={cardDetected}
        sysFileName={systemFile?.name ?? ''}
        cardFileName={cardFile?.name ?? ''}
        warning={warning}
        importError={importError}
        onConfirm={handleConfirm}
        onBack={handleReset}
        bank={bank}
      />
    )
  }

  if (step === 'results') {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Resultado da Conciliação
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {bankLabels[bank]} • {results.length} registros analisados
            </p>
          </div>
          <Button variant="outline" onClick={handleReset} className="bg-white dark:bg-slate-950">
            <RefreshCw className="w-4 h-4 mr-2" /> Nova Conciliação
          </Button>
        </div>
        <SummaryCards results={results} />
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
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Conciliação Financeira
        </h1>
        <p className="text-slate-500 text-lg">
          Selecione o banco e faça upload dos arquivos para conciliação automática
        </p>
      </div>

      <div className="flex justify-center">
        <BankSelector bank={bank} onChange={handleBankChange} />
      </div>

      {parseError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao Processar</AlertTitle>
          <AlertDescription>{parseError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h2 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600" /> Sistema (Odoo)
          </h2>
          <UploadZone
            title="Sistema (Odoo)"
            id="system-file"
            file={systemFile}
            onChange={setSystemFile}
            onDownloadSample={handleDownloadSystemSample}
          />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <FileSpreadsheet className={`w-4 h-4 ${theme.accent}`} />
            Fatura do Cartão ({bankLabels[bank]})
          </h2>
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            onDownloadSample={handleDownloadCardSample}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-center gap-4">
        <Button
          variant="outline"
          onClick={handleDemoData}
          size="lg"
          className="bg-white dark:bg-slate-950"
        >
          <Wand2 className="w-4 h-4 mr-2" /> Usar Dados de Demonstração
        </Button>
        <Button
          onClick={handleProcessFiles}
          size="lg"
          disabled={isProcessing}
          className={`text-white ${theme.primary} ${theme.hover}`}
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
