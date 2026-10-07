import { useState } from 'react'
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
import type { ReconciliationResult, SystemRecord, CardRecord, BankType } from '@/lib/types'

interface ResultsTableProps {
  data: ReconciliationResult[]
  systemRecords: SystemRecord[]
  cardRecords: CardRecord[]
  bank: BankType
}

export function ResultsTable({ data, systemRecords, cardRecords, bank }: ResultsTableProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null)

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      (r.parceiro ?? '').toLowerCase().includes(q) ||
      (r.estabelecimento ?? '').toLowerCase().includes(q) ||
      (r.lancamentoDiario ?? '').toLowerCase().includes(q) ||
      (r.numero ?? '').toLowerCase().includes(q)
    return matchSearch && (filter === 'ALL' || r.status === filter)
  })

  const getRowClass = (status: string) => {
    switch (status) {
      case 'GREEN':
        return 'bg-emerald-50/70 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200 dark:bg-emerald-950/20 dark:hover:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-900/40'
      case 'YELLOW':
        return 'bg-amber-50/70 hover:bg-amber-100/70 text-amber-950 border-amber-200 dark:bg-amber-950/20 dark:hover:bg-amber-900/30 dark:text-amber-200 dark:border-amber-900/40'
      case 'RED':
        return 'bg-rose-50/70 hover:bg-rose-100/70 text-rose-950 border-rose-200 dark:bg-rose-950/20 dark:hover:bg-rose-900/30 dark:text-rose-200 dark:border-rose-900/40'
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
      {/* Barra de Filtros e Busca Corporativa */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 p-3 sm:p-4 rounded-2xl border border-[#008F83]/15 bg-white dark:bg-[#0D3834] shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#64748B] dark:text-[#A7C4C0]" />
            <Input
              placeholder="Buscar parceiro, número, estabelecimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-[#008F83]/20 bg-[#F5F8F8] dark:bg-[#071F1D] text-sm text-[#12343B] dark:text-[#F1F5F4] focus-visible:ring-[#008F83]"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-10 rounded-xl border-[#008F83]/20 bg-[#F5F8F8] dark:bg-[#071F1D] text-sm font-medium text-[#12343B] dark:text-[#F1F5F4] focus:ring-[#008F83]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#0D3834] border-[#008F83]/20 text-[#12343B] dark:text-[#F1F5F4] rounded-xl">
              <SelectItem value="ALL">Todos os Status ({data.length})</SelectItem>
              <SelectItem value="GREEN">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Conciliados (Verde)
                </span>
              </SelectItem>
              <SelectItem value="YELLOW">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Divergentes (Amarelo)
                </span>
              </SelectItem>
              <SelectItem value="RED">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Ausentes (Vermelho)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleDownload}
          className="h-10 px-5 rounded-xl bg-[#008F83] hover:bg-[#006B67] text-white font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" /> Baixar .CSV
        </Button>
      </div>

      {/* Tabela com scroll horizontal suave e bordas elegantes */}
      <div className="hidden md:block rounded-2xl border border-[#008F83]/15 bg-white dark:bg-[#0D3834] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#DDF5F0]/40 dark:bg-[#008F83]/10 border-b border-[#008F83]/15">
              <TableRow className="hover:bg-transparent border-[#008F83]/15">
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Data
                </TableHead>
                {bank === 'itau' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                    Número
                  </TableHead>
                )}
                {bank === 'itau' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                    Referência
                  </TableHead>
                )}
                {bank === 'santander' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                    Lançamento Diário
                  </TableHead>
                )}
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Parceiro
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Estabelecimento
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Categoria
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Crédito
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Valor Fatura
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Diferença
                </TableHead>
                <TableHead className="text-center font-bold text-xs uppercase tracking-wider text-[#006B67] dark:text-[#20C9A6]">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className={`${getRowClass(r.status)} transition-colors`}>
                  <TableCell className="whitespace-nowrap font-semibold text-xs sm:text-sm">
                    {r.data}
                  </TableCell>
                  {bank === 'itau' && (
                    <TableCell className="whitespace-nowrap text-xs font-mono">
                      {r.numero ?? '-'}
                    </TableCell>
                  )}
                  {bank === 'itau' && (
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.referencia ?? '-'}
                    </TableCell>
                  )}
                  {bank === 'santander' && (
                    <TableCell className="whitespace-nowrap text-xs font-mono">
                      {r.lancamentoDiario ?? '-'}
                    </TableCell>
                  )}
                  <TableCell className="whitespace-nowrap font-medium text-xs sm:text-sm">
                    {r.parceiro}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium text-xs sm:text-sm">
                    {r.estabelecimento}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{r.categoria}</TableCell>
                  <TableCell className="text-right whitespace-nowrap font-semibold text-xs sm:text-sm">
                    {formatCurrency(r.credito)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-semibold text-xs sm:text-sm">
                    {formatCurrency(r.valorFatura)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap font-bold text-xs sm:text-sm">
                    {formatCurrency(r.diferenca)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none ${
                        r.status === 'GREEN'
                          ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : r.status === 'YELLOW'
                            ? 'bg-amber-100/80 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-rose-100/80 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      }`}
                    >
                      {statusLabel(r.status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={bank === 'itau' ? 11 : 10}
                    className="text-center h-32 text-[#64748B] dark:text-[#A7C4C0]"
                  >
                    Nenhum registro encontrado para os filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="md:hidden space-y-4">
        {filtered.map((r) => (
          <ResultRowMobile
            key={r.id}
            r={r}
            bank={bank}
            getRowClass={getRowClass}
            statusLabel={statusLabel}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center p-8 bg-white dark:bg-slate-950 rounded-xl border text-slate-500">
            Nenhum registro encontrado para os filtros aplicados.
          </div>
        )}
      </div>

      <Dialog
        open={validationErrors !== null}
        onOpenChange={(open) => !open && setValidationErrors(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Erro de Validação</DialogTitle>
            <DialogDescription>
              A exportação foi interrompida. Foram encontradas as seguintes inconsistências:
            </DialogDescription>
          </DialogHeader>
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
