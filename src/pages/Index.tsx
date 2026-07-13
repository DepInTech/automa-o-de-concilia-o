import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { reconcileData } from '@/lib/reconciliation'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import { mapSystemRecords, mapCardRecords } from '@/lib/csv-parser'
import { parseFile } from '@/lib/file-parser'
import { generateSystemCSV, generateCardCSV, downloadCSV } from '@/lib/sample-csv'
import { SummaryCards } from '@/components/summary-cards'
import { ResultsTable } from '@/components/results-table'
import { UploadZone } from '@/components/upload-zone'
import { ImportStats } from '@/components/import-stats'
import type { ReconciliationResult, SystemRecord, CardRecord } from '@/lib/types'

type Step = 'upload' | 'stats' | 'processing' | 'results'

export default function Index() {
  const [step, setStep] = useState<Step>('upload')
  const [sysFile, setSysFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [results, setResults] = useState<ReconciliationResult[]>([])
  const [sysTotal, setSysTotal] = useState(0)
  const [cardTotal, setCardTotal] = useState(0)
  const [sourceSysRecords, setSourceSysRecords] = useState<SystemRecord[]>([])
  const [sourceCardRecords, setSourceCardRecords] = useState<CardRecord[]>([])
  const [parseWarning, setParseWarning] = useState<string | null>(null)
  const [sysDetected, setSysDetected] = useState(0)
  const [cardDetected, setCardDetected] = useState(0)
  const [importError, setImportError] = useState<string | null>(null)
  const { toast } = useToast()

  const handleParse = async () => {
    if (!sysFile || !cardFile) {
      toast({
        title: 'Atenção',
        description: 'Faça o upload dos dois arquivos para iniciar.',
        variant: 'destructive',
      })
      return
    }

    let sysRecords: SystemRecord[] = MOCK_SYSTEM_RECORDS
    let cardRecords: CardRecord[] = MOCK_CARD_RECORDS
    let warning: string | null = null
    let sysDetectedCount = 0
    let cardDetectedCount = 0
    let importErrorMsg: string | null = null

    try {
      const sysParsed = await parseFile(sysFile)
      const cardParsed = await parseFile(cardFile)
      const mappedSys = mapSystemRecords(sysParsed)
      const mappedCard = mapCardRecords(cardParsed)

      sysDetectedCount = sysParsed.detectedRows
      cardDetectedCount = cardParsed.detectedRows

      if (mappedSys.length > 0 && mappedCard.length > 0) {
        sysRecords = mappedSys
        cardRecords = mappedCard

        const errors: string[] = []
        if (mappedSys.length < sysDetectedCount) {
          errors.push(
            `Sistema: ${sysDetectedCount} registros detectados, mas apenas ${mappedSys.length} foram importados.`,
          )
        }
        if (mappedCard.length < cardDetectedCount) {
          errors.push(
            `Fatura: ${cardDetectedCount} registros detectados, mas apenas ${mappedCard.length} foram importados.`,
          )
        }
        if (errors.length > 0) {
          importErrorMsg = errors.join(' ')
        }
      } else {
        warning = 'Arquivos vazios ou ilegíveis. Usando dados de demonstração.'
      }
    } catch {
      warning = 'Erro ao ler arquivos. Verifique o formato. Usando dados de demonstração.'
    }

    setSourceSysRecords(sysRecords)
    setSourceCardRecords(cardRecords)
    setSysTotal(sysRecords.length)
    setCardTotal(cardRecords.length)
    setSysDetected(sysDetectedCount || sysRecords.length)
    setCardDetected(cardDetectedCount || cardRecords.length)
    setImportError(importErrorMsg)
    setParseWarning(warning)
    setStep('stats')

    if (warning) {
      toast({ title: 'Aviso', description: warning })
    }
    if (importErrorMsg) {
      toast({ title: 'Erro de Importação', description: importErrorMsg, variant: 'destructive' })
    }
  }

  const handleReconcile = () => {
    setStep('processing')
    setTimeout(() => {
      const res = reconcileData(sourceSysRecords, sourceCardRecords)
      setResults(res)
      setStep('results')
      toast({ title: 'Sucesso', description: 'Conciliação finalizada com sucesso.' })
    }, 2500)
  }

  const handleReset = () => {
    setStep('upload')
    setSysFile(null)
    setCardFile(null)
    setResults([])
    setSourceSysRecords([])
    setSourceCardRecords([])
    setParseWarning(null)
    setSysDetected(0)
    setCardDetected(0)
    setImportError(null)
  }

  if (step === 'upload') {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-12">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Área de Conciliação
          </h1>
          <p className="text-slate-500 text-lg">
            Faça o upload do extrato do sistema e da fatura do cartão corporativo para cruzar os
            dados automaticamente.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UploadZone
            title="Registros do Sistema"
            id="sys-file"
            file={sysFile}
            onChange={setSysFile}
            onDownloadSample={() => downloadCSV(generateSystemCSV(), 'modelo_sistema.csv')}
          />
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            onDownloadSample={() => downloadCSV(generateCardCSV(), 'modelo_fatura.csv')}
          />
        </div>
        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={handleParse}
            disabled={!sysFile || !cardFile}
            className="w-full sm:w-auto h-12 px-8 text-base shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            Iniciar Importação <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'stats') {
    return (
      <ImportStats
        sysTotal={sysTotal}
        cardTotal={cardTotal}
        sysDetected={sysDetected}
        cardDetected={cardDetected}
        sysFileName={sysFile?.name || ''}
        cardFileName={cardFile?.name || ''}
        warning={parseWarning}
        importError={importError}
        onConfirm={handleReconcile}
        onBack={handleReset}
      />
    )
  }

  if (step === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] animate-fade-in">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-blue-100 dark:bg-blue-900/30 rounded-full blur-xl animate-pulse"></div>
          <Loader2 className="w-20 h-20 text-blue-600 animate-spin relative z-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">
          Analisando Valores...
        </h2>
        <p className="text-slate-500 max-w-sm text-center">
          Cruzando dados por Data, Parceiro/Estabelecimento e Crédito/Valor, identificando
          divergências e separando os registros perfeitamente casados.
        </p>
      </div>
    )
  }

  return (
    <div className="animate-fade-in-up pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            Resultado da Conciliação
          </h2>
          <p className="text-slate-500 mt-1">
            Análise concluída. {sysTotal} registros do sistema e {cardTotal} da fatura processados.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset} className="bg-white dark:bg-slate-950">
          Nova Conciliação
        </Button>
      </div>
      <div className="sticky top-0 z-30 py-4 -mx-4 lg:-mx-8 px-4 lg:px-8 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm border-b border-slate-200 dark:border-slate-800">
        <SummaryCards results={results} />
      </div>
      <div className="mt-6">
        <ResultsTable
          data={results}
          systemRecords={sourceSysRecords}
          cardRecords={sourceCardRecords}
        />
      </div>
    </div>
  )
}
