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
  let sysId = 0
  let cardId = 0

  for (let i = 0; i < 70; i++) {
    const day = (i % 28) + 1
    const month = Math.floor(i / 28) + 1
    const partner = partners[i % partners.length]
    const value = 150 + i * 37 + (i % 7) * 13
    const cat = ['Servicos', 'Suprimentos', 'Operacional'][i % 3]

    system.push({
      id: `sys-${sysId}`,
      data: formatDate(day, month),
      lancamentoDiario: `LD-${String(sysId + 1).padStart(5, '0')}`,
      parceiro: partner,
      debito: i % 6 === 0 ? Math.round(value * 0.05 * 100) / 100 : null,
      credito: value,
      categoria: cat,
    })
    card.push({
      id: `card-${cardId}`,
      data: formatDate(day, month),
      estabelecimento: partner,
      categoria: cat,
      valor: value,
    })
    sysId++
    cardId++
  }

  for (let i = 0; i < 10; i++) {
    const day = (i % 28) + 1
    const partner = partners[(70 + i) % partners.length]
    const sysValue = 500 + i * 45
    const cardValue = Math.round((sysValue + 25.5) * 100) / 100

    system.push({
      id: `sys-${sysId}`,
      data: formatDate(day, 4),
      lancamentoDiario: `LD-${String(sysId + 1).padStart(5, '0')}`,
      parceiro: partner,
      debito: null,
      credito: sysValue,
      categoria: 'Divergente',
    })
    card.push({
      id: `card-${cardId}`,
      data: formatDate(day, 4),
      estabelecimento: partner,
      categoria: 'Divergente',
      valor: cardValue,
    })
    sysId++
    cardId++
  }

  for (let i = 0; i < 8; i++) {
    system.push({
      id: `sys-${sysId}`,
      data: formatDate((i % 28) + 1, 5),
      lancamentoDiario: `LD-${String(sysId + 1).padStart(5, '0')}`,
      parceiro: `FORNECEDOR EXCLUSIVO SISTEMA ${i + 1}`,
      debito: null,
      credito: 300 + i * 20,
      categoria: 'Operacional',
    })
    sysId++
  }

  for (let i = 0; i < 5; i++) {
    card.push({
      id: `card-${cardId}`,
      data: formatDate((i % 28) + 1, 5),
      estabelecimento: `FORNECEDOR EXCLUSIVO FATURA ${i + 1}`,
      categoria: 'Outros',
      valor: 250 + i * 15,
    })
    cardId++
  }

  return { system, card }
}

const mockData = generateMockData()
export const MOCK_SYSTEM_RECORDS: SystemRecord[] = mockData.system
export const MOCK_CARD_RECORDS: CardRecord[] = mockData.card
