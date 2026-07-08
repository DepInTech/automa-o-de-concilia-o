import { useState } from 'react'
import { UploadCloud, FileSpreadsheet, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { reconcileData } from '@/lib/reconciliation'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import { SummaryCards } from '@/components/summary-cards'
import { ResultsTable } from '@/components/results-table'
import type { ReconciliationResult } from '@/lib/types'

export default function Index() {
  const [step, setStep] = useState<'upload' | 'processing' | 'results'>('upload')
  const [sysFile, setSysFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [results, setResults] = useState<ReconciliationResult[]>([])
  const { toast } = useToast()

  const handleProcess = () => {
    if (!sysFile || !cardFile) {
      toast({
        title: 'Atenção',
        description: 'Faça o upload dos dois arquivos para iniciar a conciliação.',
        variant: 'destructive',
      })
      return
    }
    setStep('processing')

    // Simulate processing time
    setTimeout(() => {
      const res = reconcileData(MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS)
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
          />
          <UploadZone
            title="Fatura do Cartão"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button
            size="lg"
            onClick={handleProcess}
            disabled={!sysFile || !cardFile}
            className="w-full sm:w-auto h-12 px-8 text-base shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
          >
            Iniciar Cruzamento <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
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
          Cruzando dados por valor, identificando divergências e separando os registros
          perfeitamente casados.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in-up pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
            Resultado da Conciliação
          </h2>
          <p className="text-slate-500 mt-1">
            Análise concluída. Verifique as divergências abaixo.
          </p>
        </div>
        <Button variant="outline" onClick={handleReset} className="bg-white dark:bg-slate-950">
          Nova Conciliação
        </Button>
      </div>

      <SummaryCards results={results} />
      <ResultsTable data={results} />
    </div>
  )
}

function UploadZone({
  title,
  id,
  file,
  onChange,
}: {
  title: string
  id: string
  file: File | null
  onChange: (f: File) => void
}) {
  return (
    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:bg-slate-50 dark:hover:bg-slate-900/50 hover:border-blue-400 transition-all relative group h-72 shadow-sm">
      <input
        type="file"
        id={id}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
        onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])}
      />
      {file ? (
        <div className="animate-fade-in flex flex-col items-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 text-blue-600">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-1">Arquivo Pronto</h3>
          <p className="text-sm text-slate-500 font-medium">{file.name}</p>
          <p className="text-xs text-blue-500 font-semibold mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
            Clique para trocar
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center opacity-80 group-hover:opacity-100 transition-opacity">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-colors">
            <UploadCloud className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-2">{title}</h3>
          <p className="text-sm text-slate-500 max-w-[200px]">
            Arraste seu arquivo CSV ou Excel aqui ou clique para buscar
          </p>
        </div>
      )}
    </div>
  )
}
