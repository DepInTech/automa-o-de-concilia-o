import { useState } from 'react' // Separado corretamente
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Download, Search, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { validateExport, generateExportCSV } from '@/lib/validation'
import { downloadCSV } from '@/lib/sample-csv'
import { ResultRowMobile } from '@/components/result-row-mobile'
import type { ReconciliationResult, SystemRecord, CardRecord } from '@/lib/types'

interface ResultsTableProps {
  data: ReconciliationResult[]
  systemRecords: SystemRecord[]
  cardRecords: CardRecord[]
}

export function ResultsTable({ data, systemRecords, cardRecords }: ResultsTableProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null)

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    // Adicionado fallback para string vazia "" prevenindo quebras por valores nulos
    const matchSearch =
      (r.parceiro ?? '').toLowerCase().includes(q) ||
      (r.estabelecimento ?? '').toLowerCase().includes(q) ||
      (r.lancamentoDiario ?? '').toLowerCase().includes(q)

    return matchSearch && (filter === 'ALL' || r.status === filter)
  })

  const getRowClass = (status: string) => {
    switch (status) {
      case 'GREEN':
        return 'bg-[#dcfce7] hover:bg-[#bbf7d0] text-[#166534] border-b-[#bbf7d0] dark:bg-emerald-950/30 dark:hover:bg-emerald-900/40 dark:text-emerald-400 dark:border-b-emerald-900/50'
      case 'YELLOW':
        return 'bg-[#fef9c3] hover:bg-[#fef08a] text-[#854d0e] border-b-[#fef08a] dark:bg-amber-950/30 dark:hover:bg-amber-900/40 dark:text-amber-400 dark:border-b-amber-900/50'
      case 'RED':
        return 'bg-[#fee2e2] hover:bg-[#fecaca] text-[#991b1b] border-b-[#fecaca] dark:bg-rose-950/30 dark:hover:bg-rose-900/40 dark:text-rose-400 dark:border-b-rose-900/50'
      default:
        return ''
    }
  }

  const statusLabel = (s: string) =>
    s === 'GREEN' ? 'Conciliado' : s === 'YELLOW' ? 'Divergente' : 'Não Encontrado'

  const handleDownload = () => {
    const validation = validateExport(data, systemRecords, cardRecords)
    if (!validation.isValid) {
      setValidationErrors(validation.errors)
      return
    }
    const csv = generateExportCSV(data)
    downloadCSV(csv, 'relatorio_conciliacao.csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex gap-4 items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Buscar parceiro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px] bg-white dark:bg-slate-950">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os Status</SelectItem>
              <SelectItem value="GREEN">Conciliados (Verde)</SelectItem>
              <SelectItem value="YELLOW">Divergentes (Amarelo)</SelectItem>
              <SelectItem value="RED">Ausentes (Vermelho)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleDownload}
          className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
        >
          <Download className="w-4 h-4 mr-2" /> Baixar .CSV
        </Button>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Lancamento Diario</TableHead>
                <TableHead className="whitespace-nowrap">Parceiro</TableHead>
                <TableHead className="whitespace-nowrap">Estabelecimento</TableHead>
                <TableHead className="whitespace-nowrap">Categoria</TableHead>
                <TableHead className="text-right whitespace-nowrap">Debito</TableHead>
                <TableHead className="text-right whitespace-nowrap">Credito</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor Fatura</TableHead>
                <TableHead className="text-right whitespace-nowrap">Diferenca</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className={`${getRowClass(r.status)} transition-colors`}>
                  <TableCell className="whitespace-nowrap font-medium">{r.data}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.lancamentoDiario}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.parceiro}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.estabelecimento}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.categoria}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatCurrency(r.debito)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {formatCurrency(r.credito)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-medium">
                    {formatCurrency(r.valorFatura)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-bold opacity-80">
                    {formatCurrency(r.diferenca)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="bg-white/50 dark:bg-black/20 font-semibold border-current/20 shadow-none"
                    >
                      {statusLabel(r.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center h-32 text-slate-500">
                    Nenhum registro encontrado para os filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {filtered.map((r) => (
          <ResultRowMobile key={r.id} r={r} getRowClass={getRowClass} statusLabel={statusLabel} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center p-8 bg-white dark:bg-slate-950 rounded-xl border text-slate-500">
            Nenhum registro encontrado para os filtros aplicados.
          </div>
        )}
      </div>

      {/* Validation Errors Modal */}
      <Dialog
        open={validationErrors !== null}
        onOpenChange={(open) => !open && setValidationErrors(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erro de Validacao</DialogTitle>
            <DialogDescription>
              A exportacao foi interrompida. Foram encontradas as seguintes inconsistencias:
            </DialogDescription>
          </DialogHeader>
          {/* Removido o <ul /> de dentro do <DialogDescription /> para respeitar o DOM do HTML */}
          <ul className="space-y-2 text-sm text-rose-600 max-h-60 overflow-y-auto mt-2">
            {validationErrors?.map((err, i) => (
              <li key={i} className="flex items-start gap-2">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {err}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
