import type { SystemRecord, CardRecord, ReconciliationResult } from './types'

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function samePartner(parceiro: string, estabelecimento: string): boolean {
  return normalize(parceiro) === normalize(estabelecimento)
}

function sameValue(credito: number, valor: number): boolean {
  return Math.abs(credito - valor) < 0.01
}

function calcDifference(credito: number, valor: number): number {
  return Math.round((valor - credito) * 100) / 100
}

function createGreen(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `GREEN-${sistema.id}-${fatura.id}`,

    data: sistema.data || fatura.data,

    lancamentoDiario: sistema.lancamentoDiario,

    parceiro: sistema.parceiro,

    estabelecimento: fatura.estabelecimento,

    categoria: fatura.categoria || sistema.categoria,

    debito: sistema.debito,

    credito: sistema.credito,

    valorFatura: fatura.valor,

    diferenca: 0,

    status: 'GREEN',

    origem: 'AMBOS',
  }
}

function createYellow(sistema: SystemRecord, fatura: CardRecord): ReconciliationResult {
  return {
    id: `YELLOW-${sistema.id}-${fatura.id}`,

    data: sistema.data || fatura.data,

    lancamentoDiario: sistema.lancamentoDiario,

    parceiro: sistema.parceiro,

    estabelecimento: fatura.estabelecimento,

    categoria: fatura.categoria || sistema.categoria,

    debito: sistema.debito,

    credito: sistema.credito,

    valorFatura: fatura.valor,

    diferenca: calcDifference(sistema.credito, fatura.valor),

    status: 'YELLOW',

    origem: 'AMBOS',
  }
}
