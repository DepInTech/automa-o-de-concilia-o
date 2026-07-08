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
import { Download, Search } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { ReconciliationResult } from '@/lib/types'

export function ResultsTable({ data }: { data: ReconciliationResult[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL')

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      r.parceiro.toLowerCase().includes(q) ||
      r.estabelecimento.toLowerCase().includes(q) ||
      r.lancamentoDiario.toLowerCase().includes(q)
    const matchFilter = filter === 'ALL' || r.status === filter
    return matchSearch && matchFilter
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
    const header = [
      'Data',
      'Lançamento Diário',
      'Parceiro',
      'Estabelecimento',
      'Categoria',
      'Débito',
      'Crédito',
      'Valor da Fatura',
      'Diferença',
      'Status',
    ].join(';')
    const rows = filtered.map((r) =>
      [
        r.data,
        r.lancamentoDiario,
        r.parceiro,
        r.estabelecimento,
        r.categoria,
        r.debito ?? '',
        r.credito ?? '',
        r.valorFatura ?? '',
        r.diferenca ?? '',
        statusLabel(r.status),
      ].join(';'),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'relatorio_conciliacao.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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

      <div className="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
              <TableRow>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Lançamento Diário</TableHead>
                <TableHead className="whitespace-nowrap">Parceiro</TableHead>
                <TableHead className="whitespace-nowrap">Estabelecimento</TableHead>
                <TableHead className="whitespace-nowrap">Categoria</TableHead>
                <TableHead className="text-right whitespace-nowrap">Débito</TableHead>
                <TableHead className="text-right whitespace-nowrap">Crédito</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor Fatura</TableHead>
                <TableHead className="text-right whitespace-nowrap">Diferença</TableHead>
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

      <div className="md:hidden space-y-4">
        {filtered.map((r) => (
          <div key={r.id} className={`p-4 rounded-xl border ${getRowClass(r.status)} shadow-sm`}>
            <div className="flex justify-between items-center mb-3">
              <span className="font-bold">{r.data}</span>
              <Badge
                variant="outline"
                className="bg-white/50 dark:bg-black/20 font-semibold border-current/20 shadow-none"
              >
                {statusLabel(r.status)}
              </Badge>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="opacity-70">Parceiro:</span>{' '}
                <strong className="font-semibold">{r.parceiro}</strong>
              </p>
              <p>
                <span className="opacity-70">Estabelecimento:</span>{' '}
                <strong className="font-semibold">{r.estabelecimento}</strong>
              </p>
              <p>
                <span className="opacity-70">Lançamento:</span>{' '}
                <strong className="font-semibold">{r.lancamentoDiario}</strong>
              </p>
              <p>
                <span className="opacity-70">Categoria:</span>{' '}
                <strong className="font-semibold">{r.categoria}</strong>
              </p>
              <div className="flex justify-between pt-3 border-t border-current/10 mt-3">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold opacity-60">Débito</span>
                  <span className="font-bold">{formatCurrency(r.debito)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase font-bold opacity-60">Crédito</span>
                  <span className="font-bold">{formatCurrency(r.credito)}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[10px] uppercase font-bold opacity-60">Fatura</span>
                  <span className="font-bold">{formatCurrency(r.valorFatura)}</span>
                </div>
              </div>
              {r.diferenca !== null && (
                <div className="flex justify-between pt-2 mt-1">
                  <span className="text-[10px] uppercase font-bold opacity-60">Diferença</span>
                  <span className="font-bold">{formatCurrency(r.diferenca)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center p-8 bg-white dark:bg-slate-950 rounded-xl border text-slate-500">
            Nenhum registro encontrado para os filtros aplicados.
          </div>
        )}
      </div>
    </div>
  )
}
