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
  const [sortOrder, setSortOrder] = useState<
    'VALOR_ASC' | 'VALOR_DESC' | 'VALOR_ODOO' | 'VALOR_FATURA' | 'DATA'
  >('VALOR_ASC')
  const [validationErrors, setValidationErrors] = useState<string[] | null>(null)

  const filtered = data
    .filter((r) => {
      const q = search.toLowerCase()
      const matchSearch =
        (r.parceiro ?? '').toLowerCase().includes(q) ||
        (r.estabelecimento ?? '').toLowerCase().includes(q) ||
        (r.lancamentoDiario ?? '').toLowerCase().includes(q) ||
        (r.numero ?? '').toLowerCase().includes(q) ||
        (r.referencia ?? '').toLowerCase().includes(q) ||
        (r.motivo ?? '').toLowerCase().includes(q)
      return matchSearch && (filter === 'ALL' || r.status === filter)
    })
    .sort((a, b) => {
      const valA = a.credito !== null && a.credito !== undefined ? a.credito : a.valorFatura || 0
      const valB = b.credito !== null && b.credito !== undefined ? b.credito : b.valorFatura || 0
      if (sortOrder === 'VALOR_ASC') return valA - valB
      if (sortOrder === 'VALOR_DESC') return valB - valA
      if (sortOrder === 'VALOR_ODOO') return (a.credito || 0) - (b.credito || 0)
      if (sortOrder === 'VALOR_FATURA') return (a.valorFatura || 0) - (b.valorFatura || 0)
      return a.data.localeCompare(b.data)
    })

  const getRowClass = (r: ReconciliationResult) => {
    if (r.classificacao === 'POSSIVEL_CORRESPONDENCIA') {
      return 'bg-blue-50/70 hover:bg-blue-100/70 text-blue-950 border-blue-200 dark:bg-blue-950/20 dark:hover:bg-blue-900/30 dark:text-blue-200 dark:border-blue-900/40'
    }
    switch (r.status) {
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

  const getRowClassStatus = (status: string) => {
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

  const renderBadge = (r: ReconciliationResult) => {
    if (r.classificacao === 'POSSIVEL_CORRESPONDENCIA') {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none bg-blue-100/80 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800"
        >
          ? Possível Correspondência
        </Badge>
      )
    }

    if (r.status === 'GREEN') {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none bg-emerald-100/80 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
        >
          ✓ Conciliado
        </Badge>
      )
    }

    if (r.status === 'YELLOW') {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none bg-amber-100/80 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
        >
          ⚠ Divergente
        </Badge>
      )
    }

    // Status RED
    if (r.origem === 'SISTEMA') {
      return (
        <Badge
          variant="outline"
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none bg-rose-100/80 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
        >
          ! Somente Sistema
        </Badge>
      )
    }

    return (
      <Badge
        variant="outline"
        className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border shadow-none bg-rose-100/80 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
      >
        ! Somente Fatura
      </Badge>
    )
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
      <div className="flex flex-col sm:flex-row justify-between gap-3 p-3 sm:p-4 rounded-2xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#647875] dark:text-[#A7C4C0]" />
            <Input
              placeholder="Buscar parceiro, número, estabelecimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-[#00796F]/20 bg-[#F4F8F7] dark:bg-[#071F1D] text-sm text-[#163A38] dark:text-[#F1F5F4] focus-visible:ring-[#00796F]"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-[200px] h-10 rounded-xl border-[#00796F]/20 bg-[#F4F8F7] dark:bg-[#071F1D] text-sm font-medium text-[#163A38] dark:text-[#F1F5F4] focus:ring-[#00796F]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#0D3834] border-[#00796F]/20 text-[#163A38] dark:text-[#F1F5F4] rounded-xl">
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
                  Exclusivos (Vermelho)
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
            <SelectTrigger className="w-full sm:w-[210px] h-10 rounded-xl border-[#00796F]/20 bg-[#F4F8F7] dark:bg-[#071F1D] text-sm font-medium text-[#163A38] dark:text-[#F1F5F4] focus:ring-[#00796F]">
              <SelectValue placeholder="Ordenação" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-[#0D3834] border-[#00796F]/20 text-[#163A38] dark:text-[#F1F5F4] rounded-xl">
              <SelectItem value="VALOR_ASC">Valor Crescente (Padrão)</SelectItem>
              <SelectItem value="VALOR_DESC">Valor Decrescente</SelectItem>
              <SelectItem value="VALOR_ODOO">Ordenar pelo Valor Odoo</SelectItem>
              <SelectItem value="VALOR_FATURA">Ordenar pelo Valor Fatura</SelectItem>
              <SelectItem value="DATA">Ordenar por Data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleDownload}
          className="h-10 px-5 rounded-xl bg-[#00796F] hover:bg-[#004A46] text-white font-semibold shadow-sm transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" /> Baixar .CSV
        </Button>
      </div>

      {/* Tabela com scroll horizontal suave e bordas elegantes */}
      <div className="hidden md:block rounded-2xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F4F8F7] dark:bg-[#00796F]/10 border-b border-[#00796F]/15">
              <TableRow className="hover:bg-transparent border-[#00796F]/15">
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Data Fatura
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Data Odoo
                </TableHead>
                {bank === 'itau' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                    Número
                  </TableHead>
                )}
                {bank === 'itau' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                    Referência
                  </TableHead>
                )}
                {bank === 'santander' && (
                  <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                    Lançamento Diário
                  </TableHead>
                )}
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Estabelecimento (Fatura)
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Parceiro (Odoo)
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Categoria
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Valor Fatura
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Valor Odoo
                </TableHead>
                <TableHead className="text-right whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Diferença
                </TableHead>
                <TableHead className="whitespace-nowrap font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Motivo da Classificação
                </TableHead>
                <TableHead className="text-center font-bold text-xs uppercase tracking-wider text-[#004A46] dark:text-[#20BFA9]">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const dataFatura = r.origem === 'FATURA' || r.origem === 'AMBOS' ? r.data : '-'
                const dataOdoo = r.origem === 'SISTEMA' || r.origem === 'AMBOS' ? r.data : '-'
                const estab =
                  r.estabelecimento && r.estabelecimento !== '-' ? r.estabelecimento : '-'
                const parc = r.parceiro && r.parceiro !== '-' ? r.parceiro : '-'

                return (
                  <TableRow key={r.id} className={`${getRowClass(r)} transition-colors`}>
                    <TableCell className="whitespace-nowrap font-mono text-xs sm:text-sm">
                      {dataFatura}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs sm:text-sm">
                      {dataOdoo}
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
                      {estab}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-xs sm:text-sm">
                      {parc}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.categoria || '-'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-semibold text-xs sm:text-sm">
                      {r.valorFatura !== null && r.valorFatura !== undefined
                        ? formatCurrency(r.valorFatura)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-semibold text-xs sm:text-sm">
                      {r.credito !== null && r.credito !== undefined
                        ? formatCurrency(r.credito)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-bold text-xs sm:text-sm">
                      {r.diferenca !== null && r.diferenca !== undefined
                        ? formatCurrency(r.diferenca)
                        : '-'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-[#647875] dark:text-[#A7C4C0]">
                      {r.motivo || '-'}
                    </TableCell>
                    <TableCell className="text-center">{renderBadge(r)}</TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={bank === 'itau' ? 11 : 10}
                    className="text-center h-32 text-[#647875] dark:text-[#A7C4C0]"
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
            r={{
              ...r,
              categoria: r.motivo
                ? `${r.categoria ? `${r.categoria} • ` : ''}${r.motivo}`
                : r.categoria,
            }}
            bank={bank}
            getRowClass={getRowClassStatus}
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
