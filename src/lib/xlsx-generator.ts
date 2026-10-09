/**
 * Gerador de arquivo Excel (.xlsx) nativo e autônomo (compatível com navegador e Node.js).
 * Não depende de bibliotecas externas pesadas e gera arquivos .xlsx válidos (OpenXML em zip)
 * com suporte a múltiplas abas, valores numéricos reais, formatação de células e download.
 */

// Tabela CRC32 padrão para integridade ZIP
const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[i] = c
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function escapeXml(unsafe: string | number | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function indexToCol(index: number): string {
  let col = ''
  let temp = index
  while (temp >= 0) {
    col = String.fromCharCode((temp % 26) + 65) + col
    temp = Math.floor(temp / 26) - 1
  }
  return col
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * Cria um arquivo ZIP (STORE / method 0) 100% válido para containers OpenXML (.xlsx)
 */
function createZipStore(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const localHeaders: Uint8Array[] = []
  const centralDirs: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const dataBytes = entry.data
    const dataCrc = crc32(dataBytes)
    const size = dataBytes.length

    // Local file header (30 bytes + nameLen + dataLen)
    const lh = new Uint8Array(30 + nameBytes.length + size)
    const lhView = new DataView(lh.buffer)

    lhView.setUint32(0, 0x04034b50, true) // Signature
    lhView.setUint16(4, 20, true) // Version needed (2.0)
    lhView.setUint16(6, 0, true) // General purpose flags
    lhView.setUint16(8, 0, true) // Compression: 0 (Store)
    lhView.setUint16(10, 0, true) // Mod time
    lhView.setUint16(12, 0, true) // Mod date
    lhView.setUint32(14, dataCrc, true) // CRC32
    lhView.setUint32(18, size, true) // Compressed size
    lhView.setUint32(22, size, true) // Uncompressed size
    lhView.setUint16(26, nameBytes.length, true) // Filename length
    lhView.setUint16(28, 0, true) // Extra field length

    lh.set(nameBytes, 30)
    lh.set(dataBytes, 30 + nameBytes.length)
    localHeaders.push(lh)

    // Central directory header (46 bytes + nameLen)
    const cd = new Uint8Array(46 + nameBytes.length)
    const cdView = new DataView(cd.buffer)

    cdView.setUint32(0, 0x02014b50, true) // Signature
    cdView.setUint16(4, 20, true) // Version made by
    cdView.setUint16(6, 20, true) // Version needed
    cdView.setUint16(8, 0, true) // Flags
    cdView.setUint16(10, 0, true) // Compression
    cdView.setUint16(12, 0, true) // Mod time
    cdView.setUint16(14, 0, true) // Mod date
    cdView.setUint32(16, dataCrc, true) // CRC32
    cdView.setUint32(20, size, true) // Compressed size
    cdView.setUint32(24, size, true) // Uncompressed size
    cdView.setUint16(28, nameBytes.length, true) // Filename length
    cdView.setUint16(30, 0, true) // Extra length
    cdView.setUint16(32, 0, true) // Comment length
    cdView.setUint16(34, 0, true) // Disk start
    cdView.setUint16(36, 0, true) // Internal attrs
    cdView.setUint32(38, 0, true) // External attrs
    cdView.setUint32(42, offset, true) // Offset of local header

    cd.set(nameBytes, 46)
    centralDirs.push(cd)

    offset += lh.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralDirs.reduce((sum, cd) => sum + cd.length, 0)

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)

  eocdView.setUint32(0, 0x06054b50, true) // Signature
  eocdView.setUint16(4, 0, true) // Disk number
  eocdView.setUint16(6, 0, true) // Start disk
  eocdView.setUint16(8, entries.length, true) // Entries on this disk
  eocdView.setUint16(10, entries.length, true) // Total entries
  eocdView.setUint32(12, centralDirSize, true) // Size of central directory
  eocdView.setUint32(16, centralDirOffset, true) // Offset of central directory
  eocdView.setUint16(20, 0, true) // Comment length

  const totalLength = offset + centralDirSize + 22
  const out = new Uint8Array(totalLength)
  let pos = 0

  for (const lh of localHeaders) {
    out.set(lh, pos)
    pos += lh.length
  }
  for (const cd of centralDirs) {
    out.set(cd, pos)
    pos += cd.length
  }
  out.set(eocd, pos)

  return out
}

export type CellValue = string | number | boolean | null | undefined

export interface ExcelSheet {
  name: string
  headers: string[]
  rows: CellValue[][]
}

/**
 * Constrói a estrutura XML de uma planilha individual
 */
function buildWorksheetXml(headers: string[], rows: CellValue[][]): string {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>`

  // Linha 1: Cabeçalhos
  if (headers.length > 0) {
    xml += `<row r="1">`
    headers.forEach((h, colIdx) => {
      const cellRef = `${indexToCol(colIdx)}1`
      const escaped = escapeXml(h)
      xml += `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`
    })
    xml += `</row>`
  }

  // Linhas de dados (a partir da linha 2)
  rows.forEach((row, rowIdx) => {
    const rowNum = rowIdx + 2
    xml += `<row r="${rowNum}">`
    row.forEach((cell, colIdx) => {
      const cellRef = `${indexToCol(colIdx)}${rowNum}`
      if (cell === null || cell === undefined || cell === '') {
        // Célula vazia
        return
      }
      if (typeof cell === 'number') {
        // CÉLULA NUMÉRICA REAL (não texto): Excel calcula somas e médias nativamente
        xml += `<c r="${cellRef}"><v>${cell}</v></c>`
      } else if (typeof cell === 'boolean') {
        xml += `<c r="${cellRef}" t="b"><v>${cell ? 1 : 0}</v></c>`
      } else {
        const escaped = escapeXml(String(cell))
        xml += `<c r="${cellRef}" t="inlineStr"><is><t>${escaped}</t></is></c>`
      }
    })
    xml += `</row>`
  })

  xml += `</sheetData>
</worksheet>`
  return xml
}

/**
 * Gera um arquivo XLSX real contendo múltiplas abas estruturadas
 */
export function generateXlsxBlob(sheets: ExcelSheet[]): Blob {
  const encoder = new TextEncoder()
  const entries: ZipEntry[] = []

  // 1. [Content_Types].xml
  let contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`

  sheets.forEach((_, idx) => {
    contentTypesXml += `\n<Override PartName="/xl/worksheets/sheet${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  })
  contentTypesXml += `\n</Types>`
  entries.push({ name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) })

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  entries.push({ name: '_rels/.rels', data: encoder.encode(rootRelsXml) })

  // 3. xl/_rels/workbook.xml.rels
  let wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`

  sheets.forEach((_, idx) => {
    wbRelsXml += `\n<Relationship Id="rId${idx + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx + 1}.xml"/>`
  })
  wbRelsXml += `\n</Relationships>`
  entries.push({ name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(wbRelsXml) })

  // 4. xl/workbook.xml
  let wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>`
  sheets.forEach((sheet, idx) => {
    const escapedName = escapeXml(sheet.name || `Sheet${idx + 1}`)
    wbXml += `\n<sheet name="${escapedName}" sheetId="${idx + 1}" r:id="rId${idx + 1}"/>`
  })
  wbXml += `\n</sheets>
</workbook>`
  entries.push({ name: 'xl/workbook.xml', data: encoder.encode(wbXml) })

  // 5. xl/styles.xml (estilos básicos)
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellXfs>
</styleSheet>`
  entries.push({ name: 'xl/styles.xml', data: encoder.encode(stylesXml) })

  // 6. xl/worksheets/sheetN.xml
  sheets.forEach((sheet, idx) => {
    const sheetXml = buildWorksheetXml(sheet.headers, sheet.rows)
    entries.push({
      name: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(sheetXml),
    })
  })

  const zipBytes = createZipStore(entries)
  return new Blob([zipBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * Função utilitária para disparar o download no navegador
 */
export function downloadXlsxFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
