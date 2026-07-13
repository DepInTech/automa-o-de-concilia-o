import type { SystemRecord, CardRecord } from './types'

const partners = [
  'AMAZON WEB SERVICES',
  'MICROSOFT BRASIL LTDA',
  'GOOGLE CLOUD BRASIL',
  'NESTLE BRASIL LTDA',
  'AMBEV COMERCIAL LTDA',
  'VALE DO RIO DOCE SA',
  'PETROBRAS DISTRIBUIDORA',
  'BR DISTRIBUIDORA SA',
  'CLARO TELECOM',
  'VIVO TELECOMUNICACOES',
  'TIM CELULAR SA',
  'MAGAZINE LUIZA SA',
  'MERCADO LIVRE BRASIL',
  'B2W DIGITAL LTDA',
  'CARREFOUR COMERCIO',
  'PAO DE ACUCAR SA',
  'ASSAI ATACADISTA',
  'COCA COLA FEMSA',
  'JBS FRIBOI SA',
  'MARFRIG ALIMENTOS',
  'RADIX ENGENHARIA',
  'TOTVS S.A.',
  'SAP BRASIL',
  'ORACLE BRASIL',
  'DELL COMPUTADORES',
  'HP BRASIL LTDA',
  'IBM BRASIL',
  'CISCO SYSTEMS',
  'FORTINET BRASIL',
  'KASPERSKY LAB',
]

function formatDate(day: number, month: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2024`
}

function generateMockData(): { system: SystemRecord[]; card: CardRecord[] } {
  const system: SystemRecord[] = []
  const card: CardRecord[] = []

  for (let i = 0; i < 42; i++) {
    const day = (i % 28) + 1
    const month = Math.floor(i / 28) + 1
    const partner = partners[i % partners.length]
    const value = 150 + i * 37 + (i % 7) * 13

    system.push({
      id: `sys-${i}`,
      data: formatDate(day, month),
      lancamentoDiario: `LD-${String(i + 1).padStart(5, '0')}`,
      parceiro: partner,
      debito: i % 6 === 0 ? Math.round(value * 0.05 * 100) / 100 : null,
      credito: value,
      categoria: i % 3 === 0 ? 'Servicos' : i % 3 === 1 ? 'Suprimentos' : 'Operacional',
    })
  }

  for (let i = 0; i < 35; i++) {
    const s = system[i]
    card.push({
      id: `card-${i}`,
      data: s.data,
      estabelecimento: s.parceiro,
      categoria: s.categoria,
      valor: s.credito,
    })
  }

  for (let i = 35; i < 38; i++) {
    const s = system[i]
    card.push({
      id: `card-${i}`,
      data: s.data,
      estabelecimento: s.parceiro,
      categoria: s.categoria,
      valor: Math.round((s.credito + 25.5) * 100) / 100,
    })
  }

  for (let i = 38; i < 40; i++) {
    const s = system[i]
    card.push({
      id: `card-${i}`,
      data: s.data,
      estabelecimento: 'FORNECEDOR DIVERGENTE',
      categoria: s.categoria,
      valor: s.credito,
    })
  }

  card.push({
    id: 'card-40',
    data: '20/02/2024',
    estabelecimento: 'DESPESA NAO CATALOGADA',
    categoria: 'Outros',
    valor: 350.75,
  })
  card.push({
    id: 'card-41',
    data: '21/02/2024',
    estabelecimento: 'COMPRAS UTEIS',
    categoria: 'Outros',
    valor: 89.9,
  })

  system.push({
    id: 'sys-42',
    data: '22/02/2024',
    lancamentoDiario: 'LD-00043',
    parceiro: 'LANCAMENTO SEM FATURA',
    debito: null,
    credito: 450,
    categoria: 'Operacional',
  })
  system.push({
    id: 'sys-43',
    data: '23/02/2024',
    lancamentoDiario: 'LD-00044',
    parceiro: 'REGISTRO ORFAO',
    debito: null,
    credito: 220,
    categoria: 'Suprimentos',
  })

  return { system, card }
}

const mockData = generateMockData()
export const MOCK_SYSTEM_RECORDS: SystemRecord[] = mockData.system
export const MOCK_CARD_RECORDS: CardRecord[] = mockData.card
