import { describe, it, expect } from 'vitest'
import { parseCSV, mapSystemRecords } from './csv-parser'
import { normalizeEntityName, calculateNameSimilarity } from './normalization'
import { reconcileData } from './reconciliation'

describe('Validação do fluxo Odoo e Fatura Itaú', () => {
  it('deve mapear corretamente linhas exportadas do Odoo (account.move) com data ISO e cabeçalhos brasileiros', () => {
    const csvContent = `Número;Data;Parceiro;Referência;Diário;Total
MISC/2024/06/0012;2024-06-15;SWIFT PIRACUAMA;COMPRA CARNE;Cartão Corporativo Itaú;18,75
MISC/2024/06/0013;2024-06-18;⚠️ MERCADO LIVRE;EQUIPAMENTOS;Cartão Corporativo Itaú;1.114,06
MISC/2024/06/0014;2024-06-20;POSTO IPIRANGA;ABASTECIMENTO;Cartão Corporativo Itaú;250,00`

    const parsed = parseCSV(csvContent)
    const records = mapSystemRecords(parsed)

    expect(records).toHaveLength(3)
    expect(records[0].data).toBe('15/06/2024')
    expect(records[0].total).toBe(18.75)
    expect(records[0].parceiro).toBe('SWIFT PIRACUAMA')

    expect(records[1].data).toBe('18/06/2024')
    expect(records[1].total).toBe(1114.06)
    // O emoji ⚠️ deve ser devidamente tratado na normalização
    const normalizedPartner = normalizeEntityName(records[1].parceiro)
    expect(normalizedPartner).not.toContain('⚠️')
    expect(normalizedPartner).toBe('mercado livre')
  })

  it('deve conciliar registros entre o Odoo e o Cartão Itaú com alta precisão', () => {
    const systemRecords = [
      {
        id: 'sys-1',
        numero: 'MISC/2024/06/0012',
        data: '15/06/2024',
        parceiro: 'SWIFT COMERCIO DE ALIMENTOS',
        referencia: 'ALMOCO DIRETORIA',
        diario: 'Cartão Corporativo Itaú',
        debito: 0,
        credito: 18.75,
        total: 18.75,
      },
      {
        id: 'sys-2',
        numero: 'MISC/2024/06/0013',
        data: '18/06/2024',
        parceiro: '⚠️ MERCADO LIVRE TITAN',
        referencia: 'COMPRA PARC 11/12',
        diario: 'Cartão Corporativo Itaú',
        debito: 0,
        credito: 1114.06,
        total: 1114.06,
      },
    ]

    const cardRecords = [
      {
        id: 'card-1',
        data: '15/06/2024',
        estabelecimento: 'SWIFT PIRACUAMA',
        valor: 18.75,
      },
      {
        id: 'card-2',
        data: '18/06/2024',
        estabelecimento: 'MERCADOLIVRE*TITAN11/12',
        valor: 1114.06,
      },
    ]

    const results = reconcileData(systemRecords, cardRecords, 'itau')

    expect(results).toHaveLength(2)
    // Ambos devem ser conciliados com status GREEN
    const conc = results.filter((r) => r.classificacao === 'CONCILIADO')
    expect(conc.length).toBe(2)
    expect(results[0].status).toBe('GREEN')
    expect(results[1].status).toBe('GREEN')
  })

  it('deve calcular similaridade alta mesmo com prefixos de alerta do Odoo e caracteres especiais de fatura', () => {
    const nameA = '⚠️ MERCADO LIVRE'
    const nameB = 'MERCADOLIVRE*TITAN'
    const sim = calculateNameSimilarity(nameA, nameB)
    expect(sim).toBeGreaterThanOrEqual(0.6)
  })
})
