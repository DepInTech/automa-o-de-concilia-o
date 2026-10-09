import type { ParsedCSV } from './csv-parser'
import { extractZip } from './zip-reader'

function colToIndex(col: string): number {
  let r = 0
  for (let i = 0; i < col.length; i++) r = r * 26 + (col.charCodeAt(i) - 64)
  return r - 1
}

function serialToDate(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const date = new Date(epoch + serial * 86400000)
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getUTCFullYear()}`
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
])

function isDate1904(files: Map<string, Uint8Array>): boolean {
  const wbFile = files.get('xl/workbook.xml')
  if (!wbFile) return false
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(wbFile), 'text/xml')
  const wbPr = doc.getElementsByTagName('workbookPr')[0]
  const val = wbPr?.getAttribute('date1904')
  return val === '1' || val === 'true'
}

function findFirstSheetPath(files: Map<string, Uint8Array>): string | null {
  const wbFile = files.get('xl/workbook.xml')
  const relsFile = files.get('xl/_rels/workbook.xml.rels')
  if (!wbFile || !relsFile) return null
  const wbDoc = new DOMParser().parseFromString(new TextDecoder().decode(wbFile), 'text/xml')
  const firstSheet = wbDoc.getElementsByTagName('sheet')[0]
  const rid = firstSheet?.getAttribute('r:id')
  if (!rid) return null
  const relsDoc = new DOMParser().parseFromString(new TextDecoder().decode(relsFile), 'text/xml')
  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    if (rel.getAttribute('Id') === rid) {
      const target = rel.getAttribute('Target') || ''
      if (target.startsWith('/')) return target.slice(1).toLowerCase()
      return 'xl/' + target.toLowerCase()
    }
  }
  return null
}

export async function parseExcel(data: ArrayBuffer): Promise<ParsedCSV> {
  const files = await extractZip(data)
  const date1904 = isDate1904(files)

  let sharedStrings: string[] = []
  const ssFile = files.get('xl/sharedstrings.xml')
  if (ssFile) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(ssFile), 'text/xml')
    sharedStrings = Array.from(doc.getElementsByTagName('si')).map((si) =>
      Array.from(si.getElementsByTagName('t'))
        .map((t) => t.textContent || '')
        .join(''),
    )
  }

  const numFmtMap = new Map<number, string>()
  const cellXfNumFmts: number[] = []
  const stylesFile = files.get('xl/styles.xml')
  if (stylesFile) {
    const sDoc = new DOMParser().parseFromString(new TextDecoder().decode(stylesFile), 'text/xml')
    BUILTIN_DATE_FORMATS.forEach((id) => numFmtMap.set(id, 'date'))
    Array.from(sDoc.getElementsByTagName('numFmt')).forEach((nf) => {
      numFmtMap.set(
        parseInt(nf.getAttribute('numFmtId') || '0'),
        nf.getAttribute('formatCode') || '',
      )
    })
    const cellXfs = sDoc.getElementsByTagName('cellXfs')[0]
    if (cellXfs) {
      Array.from(cellXfs.getElementsByTagName('xf')).forEach((xf) => {
        cellXfNumFmts.push(parseInt(xf.getAttribute('numFmtId') || '0'))
      })
    }
  }

  let sheetXml = ''
  // Para arquivos com múltiplas abas, se existir uma aba "Transacoes", prioriza-a
  const wbFile = files.get('xl/workbook.xml')
  const relsFile = files.get('xl/_rels/workbook.xml.rels')
  let preferredSheetPath: string | null = null

  if (wbFile && relsFile) {
    const wbDoc = new DOMParser().parseFromString(new TextDecoder().decode(wbFile), 'text/xml')
    const relsDoc = new DOMParser().parseFromString(new TextDecoder().decode(relsFile), 'text/xml')
    const sheets = Array.from(wbDoc.getElementsByTagName('sheet'))

    // Procura aba "transacoes" ou similar
    let targetSheet = sheets.find((s) => {
      const name = (s.getAttribute('name') || '').toLowerCase().trim()
      return name === 'transacoes' || name === 'transações' || name.includes('transac')
    })
    // Se não encontrou "transacoes", pega a primeira aba que não seja "resumo"
    if (!targetSheet) {
      targetSheet = sheets.find((s) => {
        const name = (s.getAttribute('name') || '').toLowerCase().trim()
        return !name.includes('resumo')
      })
    }
    // Fallback: primeira aba qualquer
    if (!targetSheet) {
      targetSheet = sheets[0]
    }

    if (targetSheet) {
      const rid = targetSheet.getAttribute('r:id')
      if (rid) {
        for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
          if (rel.getAttribute('Id') === rid) {
            const target = rel.getAttribute('Target') || ''
            preferredSheetPath = target.startsWith('/')
              ? target.slice(1).toLowerCase()
              : 'xl/' + target.toLowerCase()
            break
          }
        }
      }
    }
  }

  if (preferredSheetPath) {
    const sheetFile = files.get(preferredSheetPath)
    if (sheetFile) sheetXml = new TextDecoder().decode(sheetFile)
  }

  if (!sheetXml) {
    const firstSheetPath = findFirstSheetPath(files)
    if (firstSheetPath) {
      const sheetFile = files.get(firstSheetPath)
      if (sheetFile) sheetXml = new TextDecoder().decode(sheetFile)
    }
  }

  if (!sheetXml) {
    for (const [name, fd] of files) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
        sheetXml = new TextDecoder().decode(fd)
        break
      }
    }
  }
  if (!sheetXml) return { headers: [], rows: [], detectedRows: 0 }

  const doc = new DOMParser().parseFromString(sheetXml, 'text/xml')
  const grid = new Map<string, string>()
  let maxRow = 0
  let maxCol = 0

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const ref = cell.getAttribute('r') || ''
      const match = ref.match(/^([A-Z]+)(\d+)$/)
      if (!match) continue
      const col = colToIndex(match[1])
      const rowNum = parseInt(match[2]) - 1
      maxRow = Math.max(maxRow, rowNum)
      maxCol = Math.max(maxCol, col)

      const type = cell.getAttribute('t')
      const vEl = cell.getElementsByTagName('v')[0]
      const value = vEl?.textContent || ''
      const tEl = cell.getElementsByTagName('t')[0]

      let display = ''
      if (type === 's') {
        display = sharedStrings[parseInt(value)] || ''
      } else if (type === 'inlineStr' && tEl) {
        display = tEl.textContent || ''
      } else if (type === 'str') {
        display = value
      } else if (value) {
        const styleId = parseInt(cell.getAttribute('s') || '0')
        const fmtId = cellXfNumFmts[styleId] || 0
        const fmt = numFmtMap.get(fmtId)
        if (fmt && (fmt === 'date' || /[dDmMyY]/.test(fmt.replace(/\\./g, '')))) {
          display = serialToDate(parseFloat(value), date1904)
        } else {
          display = value
        }
      }
      grid.set(`${rowNum},${col}`, display)
    }
  }

  if (grid.size === 0) return { headers: [], rows: [], detectedRows: 0 }

  const headers: string[] = []
  // Localiza a linha do cabeçalho caso existam linhas em branco ou títulos antes
  let headerRowIndex = 0
  for (let r = 0; r <= Math.min(10, maxRow); r++) {
    const rowValues: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const val = grid.get(`${r},${c}`)?.trim() || ''
      if (val) rowValues.push(val)
    }
    if (rowValues.length >= 2) {
      headerRowIndex = r
      break
    }
  }

  for (let c = 0; c <= maxCol; c++) {
    const h = grid.get(`${headerRowIndex},${c}`)?.trim() || `Col${c}`
    headers.push(h)
  }

  const rows: Record<string, string>[] = []
  for (let r = headerRowIndex + 1; r <= maxRow; r++) {
    const row: Record<string, string> = {}
    let hasData = false
    let nonEmptyCount = 0
    let rowTextCombined = ''
    for (let c = 0; c <= maxCol; c++) {
      const val = grid.get(`${r},${c}`) || ''
      const header = headers[c] || `Col${c}`
      row[header] = val
      if (val.trim()) {
        hasData = true
        nonEmptyCount++
        rowTextCombined += ' ' + val.trim().toLowerCase()
      }
    }
    if (hasData) {
      // Ignora apenas se for explicitamente uma linha de total ou rodapé da planilha (ex: "Total", "Total Geral", "Soma")
      // Cuida para não descartar linhas reais caso o nome do parceiro seja curto
      const trimmedCombined = rowTextCombined.trim()
      const isPureTotalRow =
        (trimmedCombined.startsWith('total geral') ||
          trimmedCombined.startsWith('totais') ||
          trimmedCombined === 'total' ||
          trimmedCombined.startsWith('resumo')) &&
        nonEmptyCount <= 3
      if (!isPureTotalRow) {
        rows.push(row)
      }
    }
  }

  return { headers, rows, detectedRows: rows.length }
}
