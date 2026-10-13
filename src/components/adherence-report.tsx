import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle2, AlertTriangle, HelpCircle, Search, ShieldCheck } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { AdherenceReport, AdherenceItem } from '@/lib/types'

interface AdherenceReportViewProps {
  report: AdherenceReport
}

export function AdherenceReportView({ report }: AdherenceReportViewProps) {
  const [filter, setFilter] = useState<'ALL' | 'CONCORDA' | 'DISCORDA' | 'REVISAO_SUGERIDA'>('ALL')
  const [search, setSearch] = useState('')

  if (!report.hasAnnotations) {
    return (
      <Card className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D3834] p-6 text-center shadow-sm">
        <div className="flex flex-col items-center justify-center space-y-3 py-6">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
            <HelpCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#163A38] dark:text-[#F1F5F4]">
            Conferência Manual Não Detectada
          </h3>
          <p className="text-xs text-[#647875] dark:text-[#A7C4C0] max-w-md">
            Os arquivos importados não continham anotações manuais na coluna de observação (como
            "Apenas Fatura", "Apenas odoo" ou "divergente"). A conciliação foi realizada
            estritamente pelas regras do motor automatizado.
          </p>
        </div>
      </Card>
    )
  }

  const filteredItems = report.itens.filter((item) => {
    const matchFilter = filter === 'ALL' || item.tipoAderencia === filter
    const q = search.toLowerCase()
    const matchSearch =
      (item.estabelecimento || '').toLowerCase().includes(q) ||
      (item.parceiro || '').toLowerCase().includes(q) ||
      (item.anotacaoFatura || '').toLowerCase().includes(q) ||
      (item.anotacaoOdoo || '').toLowerCase().includes(q) ||
      item.detalhe.toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  return (
    <div className="space-y-6">
      {/* Banner de Visão Geral da Aderência */}
      <div className="rounded-2xl border border-[#00796F]/20 bg-gradient-to-r from-emerald-50 via-teal-50 to-white dark:from-[#042B28] dark:via-[#004A46] dark:to-[#0D3834] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border border-emerald-600/20 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              Auditoria de Aderência à Conferência Manual
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#163A38] dark:text-[#F1F5F4] tracking-tight">
              Relatório de Conformidade com a Conferência da Usuária
            </h2>
            <p className="text-xs sm:text-sm text-[#647875] dark:text-[#A7C4C0] max-w-2xl">
              Comparação em tempo real entre a classificação do motor e as anotações explícitas
              presentes nas planilhas de trabalho.
            </p>
          </div>

          <div className="text-right bg-white dark:bg-[#071F1D] px-5 py-3 rounded-2xl border border-[#00796F]/20 shadow-sm shrink-0">
            <span className="text-[11px] font-bold text-[#647875] dark:text-[#A7C4C0] uppercase tracking-wider block">
              Índice de Aderência
            </span>
            <span className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
              {report.taxaAderenciaPercentual}%
            </span>
            <span className="text-[10px] text-[#647875] dark:text-[#A7C4C0] block mt-0.5">
              {report.totalConcordantes} de {report.itens.length} lançamentos
            </span>
          </div>
        </div>
      </div>

      {/* 4 Cards de Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-[#0D3834]">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Concordantes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
              {report.totalConcordantes}
            </div>
            <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Motor e conferência em total harmonia
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-[#0D3834]">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold text-rose-800 dark:text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Discordâncias
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-black text-rose-700 dark:text-rose-300">
              {report.totalDiscordantes}
            </div>
            <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Casos divergentes da anotação
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-[#0D3834]">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> Revisão Sugerida
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-black text-amber-700 dark:text-amber-300">
              {report.totalRevisaoSugerida}
            </div>
            <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Sem anotação na conferência
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D3834]">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-bold text-slate-800 dark:text-slate-300">
              Itens com Anotação
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-2xl font-black text-slate-800 dark:text-slate-200">
              {report.totalItensComAnotacao}
            </div>
            <p className="text-[10px] text-[#647875] dark:text-[#A7C4C0]">
              Total de observações extraídas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 p-3 bg-white dark:bg-[#0D3834] rounded-2xl border border-[#00796F]/15">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            variant={filter === 'ALL' ? 'default' : 'outline'}
            onClick={() => setFilter('ALL')}
            className={
              filter === 'ALL' ? 'bg-[#00796F] text-white rounded-xl text-xs' : 'rounded-xl text-xs'
            }
          >
            Todos ({report.itens.length})
          </Button>
          <Button
            size="sm"
            variant={filter === 'CONCORDA' ? 'default' : 'outline'}
            onClick={() => setFilter('CONCORDA')}
            className={
              filter === 'CONCORDA'
                ? 'bg-emerald-600 text-white rounded-xl text-xs'
                : 'rounded-xl text-xs border-emerald-300 text-emerald-800 dark:text-emerald-300'
            }
          >
            Concordantes ({report.totalConcordantes})
          </Button>
          <Button
            size="sm"
            variant={filter === 'DISCORDA' ? 'default' : 'outline'}
            onClick={() => setFilter('DISCORDA')}
            className={
              filter === 'DISCORDA'
                ? 'bg-rose-600 text-white rounded-xl text-xs'
                : 'rounded-xl text-xs border-rose-300 text-rose-800 dark:text-rose-300'
            }
          >
            Discordâncias ({report.totalDiscordantes})
          </Button>
          <Button
            size="sm"
            variant={filter === 'REVISAO_SUGERIDA' ? 'default' : 'outline'}
            onClick={() => setFilter('REVISAO_SUGERIDA')}
            className={
              filter === 'REVISAO_SUGERIDA'
                ? 'bg-amber-600 text-white rounded-xl text-xs'
                : 'rounded-xl text-xs border-amber-300 text-amber-800 dark:text-amber-300'
            }
          >
            Revisão Sugerida ({report.totalRevisaoSugerida})
          </Button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#647875]" />
          <Input
            placeholder="Buscar no relatório..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs rounded-xl border-[#00796F]/20"
          />
        </div>
      </div>

      {/* Tabela de Aderência */}
      <div className="rounded-2xl border border-[#00796F]/15 bg-white dark:bg-[#0D3834] overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[500px]">
          <Table>
            <TableHeader className="bg-[#F4F8F7] dark:bg-[#071F1D] sticky top-0 border-b border-[#00796F]/15">
              <TableRow>
                <TableHead className="text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Estabelecimento / Parceiro
                </TableHead>
                <TableHead className="text-right text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Valor Fatura
                </TableHead>
                <TableHead className="text-right text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Valor Odoo
                </TableHead>
                <TableHead className="text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Anotação Manual
                </TableHead>
                <TableHead className="text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Classificação Motor
                </TableHead>
                <TableHead className="text-center text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Aderência
                </TableHead>
                <TableHead className="text-xs font-bold text-[#004A46] dark:text-[#20BFA9]">
                  Diagnóstico / Auditoria
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs">
              {filteredItems.map((item) => (
                <TableRow
                  key={item.id}
                  className={
                    item.tipoAderencia === 'CONCORDA'
                      ? 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                      : item.tipoAderencia === 'DISCORDA'
                        ? 'bg-rose-50/50 hover:bg-rose-100/50 dark:bg-rose-950/20'
                        : 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20'
                  }
                >
                  <TableCell className="font-medium max-w-[240px]">
                    <div className="truncate font-semibold">{item.estabelecimento || '-'}</div>
                    <div className="truncate text-[11px] text-[#647875] dark:text-[#A7C4C0]">
                      {item.parceiro || '-'}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.valorFatura !== null ? formatCurrency(item.valorFatura) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.valorOdoo !== null ? formatCurrency(item.valorOdoo) : '-'}
                  </TableCell>
                  <TableCell>
                    {item.anotacaoFatura || item.anotacaoOdoo ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-purple-50 text-purple-800 border-purple-200"
                      >
                        {item.anotacaoFatura || item.anotacaoOdoo}
                      </Badge>
                    ) : (
                      <span className="text-[#647875] italic">Sem anotação</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.statusAlgoritmo === 'GREEN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.statusAlgoritmo === 'YELLOW'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {item.statusAlgoritmo} • {item.classificacaoAlgoritmo}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {item.tipoAderencia === 'CONCORDA' ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-300"
                      >
                        ✓ Concorda
                      </Badge>
                    ) : item.tipoAderencia === 'DISCORDA' ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-rose-100 text-rose-800 border-rose-300"
                      >
                        ✕ Discorda
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-300"
                      >
                        ⚠ Revisão
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-[#647875] dark:text-[#A7C4C0] max-w-[280px]">
                    {item.detalhe}
                  </TableCell>
                </TableRow>
              ))}

              {filteredItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-[#647875]">
                    Nenhum registro encontrado para o filtro selecionado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
