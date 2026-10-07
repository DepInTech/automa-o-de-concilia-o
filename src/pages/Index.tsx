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
      <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-fade-in">
        {/* Banner / Cabeçalho Corporativo Grupo EPA com formas sutis inspiradas em folhas/sustentabilidade */}
        <div className="relative overflow-hidden rounded-2xl border border-[#008F83]/20 bg-gradient-to-r from-[#006B67] via-[#008F83] to-[#043330] p-6 sm:p-8 text-white shadow-md">
          {/* Formas abstratas discretas inspiradas em natureza e sustentabilidade */}
          <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-white/5 blur-2xl pointer-events-none" />
          <div className="absolute right-24 -top-8 w-32 h-32 rounded-full bg-[#20C9A6]/10 blur-xl pointer-events-none" />
          <svg
            className="absolute right-4 bottom-2 w-32 h-32 text-white/5 pointer-events-none hidden sm:block"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            <path d="M50 0 C60 30 90 40 100 50 C70 60 60 90 50 100 C40 70 10 60 0 50 C30 40 40 10 50 0 Z" />
          </svg>

          <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-semibold text-[#DDF5F0] mb-2.5">
                <span className="w-2 h-2 rounded-full bg-[#20C9A6] animate-pulse" />
                Auditoria e Conciliação Concluída
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Resultado da Conciliação
              </h1>
              <p className="text-sm text-[#DDF5F0]/90 mt-1 font-medium">
                {bankLabels[bank]} • {results.length} registros analisados
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleReset}
              className="bg-white/95 text-[#006B67] hover:bg-white hover:text-[#004D4A] border-none shadow-md font-semibold rounded-xl"
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
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DDF5F0] dark:bg-[#008F83]/20 border border-[#008F83]/20 text-[#006B67] dark:text-[#20C9A6] text-xs font-bold uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-[#008F83] dark:bg-[#20C9A6]" />
          Tecnologia & Controladoria Financeira
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-[#12343B] dark:text-[#F1F5F4] tracking-tight">
          Conciliação Financeira
        </h1>
        <p className="text-[#64748B] dark:text-[#A7C4C0] text-base sm:text-lg max-w-2xl mx-auto">
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

      {/* Cards de Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-[#006B67] dark:text-[#20C9A6] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#008F83]" /> Sistema (Odoo)
            </h2>
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-[#A7C4C0]">
              Relatório Contábil
            </span>
          </div>
          <UploadZone
            title="Sistema (Odoo)"
            id="system-file"
            file={systemFile}
            onChange={setSystemFile}
            onDownloadSample={handleDownloadSystemSample}
          />
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-[#006B67] dark:text-[#20C9A6] flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#008F83] dark:text-[#20C9A6]" />
              Fatura do Cartão ({bankLabels[bank]})
            </h2>
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-[#A7C4C0]">
              Arquivo Bancário
            </span>
          </div>
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            onDownloadSample={handleDownloadCardSample}
          />
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-2">
        <Button
          variant="outline"
          onClick={handleDemoData}
          size="lg"
          className="w-full sm:w-auto h-12 px-6 rounded-xl border-[#008F83]/30 hover:border-[#008F83] text-[#006B67] dark:text-[#20C9A6] bg-white dark:bg-[#0D3834] hover:bg-[#DDF5F0] dark:hover:bg-[#008F83]/20 font-semibold shadow-sm transition-all"
        >
          <Wand2 className="w-4 h-4 mr-2 text-[#008F83] dark:text-[#20C9A6]" /> Usar Dados de
          Demonstração
        </Button>
        <Button
          onClick={handleProcessFiles}
          size="lg"
          disabled={isProcessing}
          className="w-full sm:w-auto h-12 px-8 rounded-xl font-bold shadow-lg shadow-[#008F83]/20 text-white bg-[#008F83] hover:bg-[#006B67] transition-all"
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
