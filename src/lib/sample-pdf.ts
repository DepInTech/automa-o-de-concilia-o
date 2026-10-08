import type { BankType, CardRecord } from './types'
import { MOCK_CARD_RECORDS } from './mock-data'
import { bankLabels } from './bank-config'

/**
 * Cria um buffer de PDF válido em memória (PDF 1.4 simples com texto pesquisável)
 * contendo os registros simulados da fatura para demonstração e download.
 */
export function generateSampleInvoicePdf(
  bank: BankType = 'itau',
  records: CardRecord[] = MOCK_CARD_RECORDS,
): Uint8Array {
  const bankName = bankLabels[bank] || 'Itaú'
  const lines: string[] = [
    `%PDF-1.4`,
    `1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj`,
    `2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj`,
    `3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R>> endobj`,
    `4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj`,
  ]

  // Monta conteúdo do stream com os dados da fatura em PDF
  const streamLines: string[] = [
    'BT',
    '/F1 14 Tf',
    '50 740 Td',
    `(FATURA CARTAO DE CREDITO - ${bankName.toUpperCase()}) Tj`,
    '/F1 10 Tf',
    '0 -24 Td',
    `(GRUPO EPA - DEMONSTRATIVO DE LANCAMENTOS) Tj`,
    '0 -20 Td',
    `(DATA        ESTABELECIMENTO                            CATEGORIA       VALOR (R$)) Tj`,
    '0 -10 Td',
    `(--------------------------------------------------------------------------------) Tj`,
  ]

  // Limita até 40 lançamentos por página de demonstração para manter sintaxe clara e leve
  const sliceRecs = records.slice(0, 35)
  for (const r of sliceRecs) {
    const valFormatted = r.valor.toFixed(2).replace('.', ',')
    // Sanitiza texto para PDF básico
    const cleanEstab = r.estabelecimento.replace(/[()]/g, '').slice(0, 30).padEnd(30, ' ')
    const cleanCat = (r.categoria || 'Geral').replace(/[()]/g, '').slice(0, 12).padEnd(12, ' ')
    const rowStr = `${r.data}  ${cleanEstab}  ${cleanCat}  ${valFormatted}`
    streamLines.push('0 -14 Td')
    streamLines.push(`(${rowStr}) Tj`)
  }

  streamLines.push('0 -20 Td')
  streamLines.push(
    `(TOTAL DESTE DOCUMENTO: R$ ${records
      .reduce((acc, c) => acc + c.valor, 0)
      .toFixed(2)
      .replace('.', ',')}) Tj`,
  )
  streamLines.push('ET')

  const streamContent = streamLines.join('\n')
  const streamLength = streamContent.length

  lines.push(`5 0 obj <</Length ${streamLength}>> stream`)
  lines.push(streamContent)
  lines.push(`endstream endobj`)

  // Tabela xref
  lines.push('xref')
  lines.push('0 6')
  lines.push('0000000000 65535 f ')
  lines.push('0000000009 00000 n ')
  lines.push('0000000056 00000 n ')
  lines.push('0000000111 00000 n ')
  lines.push('0000000212 00000 n ')
  lines.push('0000000279 00000 n ')
  lines.push('trailer <</Size 6 /Root 1 0 R>>')
  lines.push('startxref')
  lines.push('400')
  lines.push('%%EOF')

  const text = lines.join('\n')
  return new TextEncoder().encode(text)
}

/**
 * Cria um objeto File para simular o upload de fatura em PDF
 */
export function createMockInvoicePdfFile(bank: BankType = 'itau'): File {
  const bytes = generateSampleInvoicePdf(bank)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  return new File([blob], `fatura_cartao_${bank}.pdf`, { type: 'application/pdf' })
}
