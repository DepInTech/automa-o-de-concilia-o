import type { ParsedCSV } from './csv-parser'

async function decompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([data]).stream().pipeThrough(ds)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value!)
    total += value!.length
  }
  const result = new Uint8Array(total)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

async function extractZip(data: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const view = new DataView(data)
  let offset = 0
  while (offset < data.byteLength - 4) {
    if (view.getUint32(offset, true) !== 0x04034b50) break
    const method = view.getUint16(offset + 6, true)
    const compSize = view.getUint32(offset + 18, true)
    const uncompSize = view.getUint32(offset + 22, true)
    const nameLen = view.getUint16(offset + 26, true)
    const extraLen = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(data, offset + 30, nameLen))
    const dataStart = offset + 30 + nameLen + extraLen
    let fileData: Uint8Array
    if (method === 0) {
      fileData = new Uint8Array(data, dataStart, uncompSize)
    } else if (method === 8) {
      fileData = await decompress(new Uint8Array(data, dataStart, compSize))
    } else {
      offset = dataStart + compSize
      continue
    }
    files.set(name, fileData)
    offset = dataStart + compSize
  }
  return files
}

function colToIndex(col: string): number {
  let r = 0
  for (let i = 0; i < col.length; i++) r = r * 26 + (col.charCodeAt(i) - 64)
  return r - 1
}

function serialToDate(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
  const d = String(date.getUTCDate()).padStart(2, '0')
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getUTCFullYear()}`
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
])

export async function parseExcel(data: ArrayBuffer): Promise<ParsedCSV> {
  const files = await extractZip(data)

  let sharedStrings: string[] = []
  const ssFile = files.get('xl/sharedStrings.xml')
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
  for (const [name, fd] of files) {
    if (/^xl\/worksheets\/sheet1\.xml$/.test(name)) {
      sheetXml = new TextDecoder().decode(fd)
      break
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
  if (!sheetXml) return { headers: [], rows: [] }

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
          display = serialToDate(parseFloat(value))
        } else {
          display = value
        }
      }
      grid.set(`${rowNum},${col}`, display)
    }
  }

  if (maxRow < 0) return { headers: [], rows: [] }

  const headers: string[] = []
  for (let c = 0; c <= maxCol; c++) headers.push(grid.get(`0,${c}`) || '')

  const rows: Record<string, string>[] = []
  for (let r = 1; r <= maxRow; r++) {
    const row: Record<string, string> = {}
    let hasData = false
    for (let c = 0; c <= maxCol; c++) {
      const val = grid.get(`${r},${c}`) || ''
      const header = headers[c] || `Col${c}`
      row[header] = val
      if (val) hasData = true
    }
    if (hasData) rows.push(row)
  }

  return { headers, rows }
}
