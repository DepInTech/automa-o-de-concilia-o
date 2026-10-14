import { useState, useEffect } from 'react'
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
  BarChart3,
  CheckCircle2,
} from 'lucide-react'
import { bankLabels } from '@/lib/bank-config'
import {
  convertInvoicePdfToExcel,
  type InvoiceConversionResult,
} from '@/lib/pdf-to-excel-converter'
import { importOdooFile, type OdooImportResult } from '@/lib/odoo-importer'
import { reconcileData } from '@/lib/reconciliation'
import { cloneAndFreezeArray } from '@/lib/immutability'
import { downloadXlsxFile } from '@/lib/xlsx-generator'
import { generateSystemCSV, downloadCSV } from '@/lib/sample-csv'
import { createMockInvoicePdfFile } from '@/lib/sample-pdf'
import { MOCK_SYSTEM_RECORDS, MOCK_CARD_RECORDS } from '@/lib/mock-data'
import { useReconciliationSession } from '@/contexts/reconciliation-context'
import type { BankType, SystemRecord, CardRecord, ReconciliationResult } from '@/lib/types'

type Step = 'upload' | 'validation' | 'results'

export default function Index() {
  const { lastSession, saveSession, clearSession } = useReconciliationSession()

  const [bank, setBank] = useState<BankType>(lastSession?.bank ?? 'itau')
  const [step, setStep] = useState<Step>('upload')
  const [systemFile, setSystemFile] = useState<File | null>(null)
  const [cardFile, setCardFile] = useState<File | null>(null)

  // Resultados dos módulos estruturados
  const [invoiceConversion, setInvoiceConversion] = useState<InvoiceConversionResult | null>(
    lastSession?.invoiceConversion ?? null,
  )
  const [odooImport, setOdooImport] = useState<OdooImportResult | null>(
    lastSession?.odooImport ?? null,
  )

  // Registros mapeados para o motor de conciliação
  const [systemRecords, setSystemRecords] = useState<SystemRecord[]>(
    lastSession?.systemRecords ?? [],
  )
  const [cardRecords, setCardRecords] = useState<CardRecord[]>(lastSession?.cardRecords ?? [])
  const [results, setResults] = useState<ReconciliationResult[]>(lastSession?.results ?? [])

  const [isProcessing, setIsProcessing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('ALL')
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // Se o contexto possuir uma sessão anterior e o estado local estiver zerado, sincroniza
  useEffect(() => {
    if (lastSession && results.length === 0 && lastSession.results.length > 0) {
      setBank(lastSession.bank)
      setResults(lastSession.results)
      setSystemRecords(lastSession.systemRecords)
      setCardRecords(lastSession.cardRecords)
      setInvoiceConversion(lastSession.invoiceConversion)
      setOdooImport(lastSession.odooImport)
    }
  }, [lastSession])

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
    clearSession()
  }

  /**
   * Reseta atomicamente todos os estados de dados de conciliação
   * para assegurar que nenhum resíduo de importações anteriores permaneça.
   */
  const resetReconciliationState = () => {
    setInvoiceConversion(null)
    setOdooImport(null)
    setSystemRecords([])
    setCardRecords([])
    setResults([])
    setParseError(null)
  }

  /**
   * ETAPAS 1 e 2: Upload e Conversão da Fatura PDF para Excel + Importação do Odoo
   */
  const handleProcessFiles = async () => {
    // Reset atômico do estado anterior ao iniciar cada nova importação
    resetReconciliationState()
    setIsProcessing(true)

    try {
      // 1. Processamento e conversão da Fatura (PDF ou Planilha .xlsx/.csv) para Excel Estruturado
      let convResult: InvoiceConversionResult
      if (cardFile) {
        convResult = await convertInvoicePdfToExcel(cardFile, cardFile.name)
        if (!convResult.sucesso || convResult.registros.length === 0) {
          const detail = convResult.erroCritico || convResult.resumo?.avisos?.join(' ')
          throw new Error(
            detail ||
              'Aviso: nenhuma transação foi identificada na fatura enviada. O arquivo pode ser escaneado (precisa de OCR), estar corrompido ou ter layout não reconhecido. A conciliação não pode ser iniciada com a fatura zerada.',
          )
        }
      } else {
        // Fallback de demonstração caso nenhum arquivo tenha sido selecionado
        const demoCardPdf = createMockInvoicePdfFile(bank)
        convResult = await convertInvoicePdfToExcel(demoCardPdf, `fatura_${bank}_exemplo.pdf`)
      }

      // Verificação de segurança: impede conciliação com fatura zerada/sem lançamentos
      if (!convResult.registros || convResult.registros.length === 0) {
        throw new Error(
          'Nenhuma transação foi detectada na fatura. Verifique se o arquivo enviado está legível e possui texto pesquisável (não imagem escaneada).',
        )
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
          nomeArquivo: 'odoo_relatorio_sistema.xlsx',
          abaUtilizada: 'Planilha Principal',
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
          valoresInvalidos: 0,
          totalMonetario: MOCK_SYSTEM_RECORDS.reduce((acc, s) => acc + (s.total ?? s.credito), 0),
          colunaTotalDetectada: 'Total',
          colunaParceiroDetectada: 'Parceiro',
          colunaDataDetectada: 'Data',
          colunaDebitoDetectada: 'Débito',
          colunaCreditoDetectada: 'Crédito',
          colunasEncontradas: ['Data', 'Número', 'Referência', 'Parceiro', 'Total'],
          avisos: [],
        }
      }

      // Camadas 1 e 2: Preparação dos registros originais independentes com congelamento profundo
      const mappedCards: CardRecord[] = cloneAndFreezeArray(
        convResult.registros.map((r) => ({
          id: r.id,
          data: r.data,
          estabelecimento: r.descricaoOriginal,
          valor: r.valorReais,
          categoria: r.tipo,
          isInternacional: r.tipo === 'Internacional',
          moedaGlobal: r.moedaOriginal,
          parcela: r.parcela,
          cartaoTitular: r.portador,
          observacaoManual: r.observacaoManual,
          paginaOrigem: r.paginaOrigem,
          confianca: r.confianca,
        })),
      ) as CardRecord[]

      const mappedSystem: SystemRecord[] = cloneAndFreezeArray(
        odooRes.registros.map((r) => ({
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
          observacaoManual: r.observacaoManual,
        })),
      ) as SystemRecord[]

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
    // Camada 3: Processamento da conciliação a partir de clones profundos e congelados das fontes
    const reconciled = reconcileData(systemRecords, cardRecords, bank)
    setResults(reconciled)
    setLastUpdated(new Date().toLocaleString('pt-BR'))
    // Persiste no store de sessão para que o dashboard da home e qualquer navegação reflitam o resultado
    saveSession({
      bank,
      results: reconciled,
      systemRecords,
      cardRecords,
      invoiceConversion,
      odooImport,
    })
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
    clearSession()
  }

  const handleDemoData = async () => {
    // Reset atômico do estado anterior ao carregar demonstração
    resetReconciliationState()
    setIsProcessing(true)
    try {
      const demoCardPdf = createMockInvoicePdfFile(bank)
      const convResult = await convertInvoicePdfToExcel(
        demoCardPdf,
        `fatura_${bank}_demonstracao.pdf`,
      )

      const odooRes: OdooImportResult = {
        sucesso: true,
        nomeArquivo: 'odoo_relatorio_demonstracao.xlsx',
        abaUtilizada: 'Planilha Principal',
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
        valoresInvalidos: 0,
        totalMonetario: MOCK_SYSTEM_RECORDS.reduce((acc, s) => acc + (s.total ?? s.credito), 0),
        colunaTotalDetectada: 'Total',
        colunaParceiroDetectada: 'Parceiro',
        colunaDataDetectada: 'Data',
        colunaDebitoDetectada: 'Débito',
        colunaCreditoDetectada: 'Crédito',
        colunasEncontradas: ['Data', 'Número', 'Referência', 'Parceiro', 'Total'],
        avisos: [],
      }

      const mappedCards: CardRecord[] = cloneAndFreezeArray(
        convResult.registros.map((r) => ({
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
        })),
      ) as CardRecord[]

      const mappedSystem: SystemRecord[] = cloneAndFreezeArray(
        odooRes.registros.map((r) => ({
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
        })),
      ) as SystemRecord[]

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
        {/* Cabeçalho Corporativo e Limpo */}
        <div className="rounded-2xl border border-[#00796F]/20 bg-gradient-to-r from-[#004A46] via-[#00796F] to-[#042B28] p-6 sm:p-7 text-white shadow-md">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-xs font-semibold text-white/90 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#20BFA9] animate-pulse" />
                Conciliação Bancária • {bankLabels[bank]}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Conciliação Bancária
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/80 mt-1.5 font-medium">
                <span>
                  <strong>Período:</strong> Ciclo Atual (
                  {results[0]?.dataFatura || results[0]?.dataOdoo || 'Junho/2026'})
                </span>
                <span>•</span>
                <span>
                  <strong>Fatura:</strong> {cardFile?.name || 'Fatura Itaú Empresas (PDF)'}
                </span>
                <span>•</span>
                <span>
                  <strong>Odoo:</strong> {systemFile?.name || 'Lançamento de Diário (Excel)'}
                </span>
                {lastUpdated && (
                  <>
                    <span>•</span>
                    <span className="text-[#20BFA9]">
                      <strong>Atualizado em:</strong> {lastUpdated}
                    </span>
                  </>
                )}
              </div>
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

        {/* Indicadores Principais e Resumo Financeiro Separado */}
        <SummaryCards
          results={results}
          systemRecords={systemRecords}
          cardRecords={cardRecords}
          systemRecordsCount={systemRecords.length}
          cardRecordsCount={cardRecords.length}
          bank={bank}
          activeFilter={activeFilter}
          onSelectFilter={(newFilter) => setActiveFilter(newFilter)}
        />

        {/* Tabela de Resultados com Filtros Dinâmicos */}
        <div id="reconciliation-table-section">
          <ResultsTable
            data={results}
            systemRecords={systemRecords}
            cardRecords={cardRecords}
            bank={bank}
            onDownloadConvertedInvoice={handleDownloadConvertedInvoice}
            hasConvertedInvoice={!!invoiceConversion?.excelBlob}
            initialFilter={activeFilter}
            onFilterChange={(newFilter) => setActiveFilter(newFilter)}
          />
        </div>
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
          Conciliação Financeira & Conversor de Fatura
        </h1>
        <p className="text-[#647875] dark:text-[#A7C4C0] text-base sm:text-lg max-w-2xl mx-auto">
          Envie o PDF da fatura do cartão corporativo (Santander / Itaú) para conversão direta em
          Excel (.xlsx) e conciliação com o Lançamento de Diário do Odoo.
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
        {/* Campo 1: Fatura do Cartão - PDF com Conversor */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm text-rose-700 dark:text-rose-400 flex items-center gap-2">
              <FileText className="w-4 h-4 text-rose-600" />
              Fatura em PDF (Santander / Itaú)
            </h2>
            <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200/50">
              Conversor Integrado • Excel (.xlsx)
            </span>
          </div>
          <UploadZone
            title="Fatura do Cartão em PDF"
            id="card-file"
            file={cardFile}
            onChange={setCardFile}
            acceptType="card"
            description="Selecione ou arraste o PDF da fatura. Detecta automaticamente Santander Empresas ou Itaú Empresas."
            subDescription="Extrai data, estabelecimento original, portador, parcela, valor BRL/USD, cotação e gera planilha com abas 'Transações' e 'Resumo'."
            badgeText="Fatura em PDF"
          />
        </div>

        {/* Campo 2: Sistema (Odoo) - Planilha */}
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
            description="Envie a planilha original de Lançamento de Diário do Odoo para conciliar com os dados da fatura."
            subDescription="Mapeia automaticamente Data, Número, Parceiro, Referência, Diário e Total sem posições fixas."
            badgeText="Planilha do Sistema"
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

      {/* SEÇÃO DO DASHBOARD NA HOME:
          - Se há conciliação executada na sessão, exibe os SummaryCards completos com os contadores reais por status.
          - Se nenhuma conciliação foi executada ainda, exibe o painel explicativo vazio com os 4 status.
      */}
      {results.length > 0 ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-2 px-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9] flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#00796F] dark:text-[#20BFA9]" />
                Dashboard da Sessão • Última Conciliação Executada
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {bankLabels[bank]} • Concluída
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('results')}
                className="text-xs font-bold rounded-xl border-[#00796F]/30 hover:border-[#00796F] text-[#004A46] dark:text-[#20BFA9] bg-white dark:bg-[#0D3834]"
              >
                Ver Tela de Resultados <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </div>
          </div>

          {/* SummaryCards no dashboard da home com os 4 cartões de indicadores e o resumo financeiro desativados */}
          <SummaryCards
            results={results}
            systemRecords={systemRecords}
            cardRecords={cardRecords}
            systemRecordsCount={systemRecords.length}
            cardRecordsCount={cardRecords.length}
            bank={bank}
            activeFilter={activeFilter}
            showIndicatorCards={false}
            showFinancialSummarySection={false}
            onSelectFilter={(newFilter) => {
              setActiveFilter(newFilter)
              setStep('results')
            }}
            onNavigateToResults={() => setStep('results')}
          />
        </div>
      ) : (
        /* Painel Informativo / Estado Vazio do Dashboard */
        <div className="rounded-2xl border border-[#00796F]/20 bg-gradient-to-br from-white to-[#F4F8F7] dark:from-[#0D3834] dark:to-[#071F1D] p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4 border-b border-[#00796F]/10 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00796F] dark:bg-[#20BFA9]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                Visão Geral do Painel • Como os Lançamentos São Classificados
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#00796F]/10 text-[#00796F] dark:text-[#20BFA9]">
              Aguardando Execução da Conciliação
            </span>
          </div>

          <p className="text-xs sm:text-sm text-[#647875] dark:text-[#A7C4C0] mb-5">
            Assim que a fatura e o relatório do Odoo forem enviados (ou ao clicar em{' '}
            <strong className="text-[#004A46] dark:text-[#20BFA9]">
              Usar Dados de Demonstração
            </strong>
            ), os indicadores em tempo real serão calculados com a contagem exata e a soma em R$ dos
            lançamentos por status:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Guia Verde: Conciliados */}
            <div className="rounded-xl border border-emerald-300/60 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> 🟢 Conciliados
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                  VERDE
                </span>
              </div>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] leading-relaxed">
                Lançamentos encontrados em ambas as fontes com valor idêntico e
                estabelecimento/parceiro correspondente.
              </p>
            </div>

            {/* Guia Amarelo: Divergentes */}
            <div className="rounded-xl border border-amber-300/60 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> 🟡 Divergentes
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  AMARELO
                </span>
              </div>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] leading-relaxed">
                Lançamentos pareados com mesmo estabelecimento/parceiro, mas com diferença entre o
                valor da fatura e o Odoo.
              </p>
            </div>

            {/* Guia Vermelho: Não Conciliados */}
            <div className="rounded-xl border border-rose-300/60 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20 p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> 🔴 Não Conciliados
                </span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300">
                  VERMELHO
                </span>
              </div>
              <p className="text-xs text-[#647875] dark:text-[#A7C4C0] leading-relaxed">
                Contagem desdobrada em <strong>Somente Sistema</strong> (existe no Odoo) e{' '}
                <strong>Somente Fatura</strong> (existe no cartão).
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
