/**
 * Motor autônomo de extração de texto de PDFs (PDF Text Extractor).
 * Funciona offline no navegador com suporte a descompressão FlateDecode via DecompressionStream,
 * e possui fallback para CDN pdfjs-dist quando disponível.
 * Detecta se o PDF tem texto pesquisável ou se é imagem/escaneado.
 */

interface PdfTextItem {
  str: string
  pageNumber: number
}

export interface ExtractedPdfPage {
  pageNumber: number
  text: string
  lines: string[]
}

export interface PdfExtractionResult {
  numPages: number
  pages: ExtractedPdfPage[]
  fullText: string
  isScannedOrEmpty: boolean
}

async function readStreamAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.length
    }
  }
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

async function decompressFlate(data: Uint8Array): Promise<Uint8Array | null> {
  if (data.length === 0) return null

  // Clona subarray para ArrayBuffer limpo caso o slice tenha byteOffset
  const safeBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const uint8Copy = new Uint8Array(safeBuffer)

  // 1. Tenta formato padrão zlib RFC 1950 via format 'deflate'
  try {
    const ds = new DecompressionStream('deflate')
    const blob = new Blob([uint8Copy as unknown as BlobPart])
    return await readStreamAll(blob.stream().pipeThrough(ds))
  } catch {
    // Segue para tentativas alternativas
  }

  // 2. Tenta formato raw deflate RFC 1951 via 'deflate-raw'
  try {
    const ds = new DecompressionStream('deflate-raw')
    const blob = new Blob([uint8Copy as unknown as BlobPart])
    return await readStreamAll(blob.stream().pipeThrough(ds))
  } catch {
    // Segue para tentativa com pulo manual de cabeçalho
  }

  // 3. Tenta pular cabeçalho zlib (2 bytes) e rodar deflate-raw
  if (data.length > 2) {
    try {
      const sliced = uint8Copy.subarray(2)
      const ds = new DecompressionStream('deflate-raw')
      const blob = new Blob([sliced as unknown as BlobPart])
      return await readStreamAll(blob.stream().pipeThrough(ds))
    } catch {
      // Falha
    }
  }

  return null
}

function decodeOctalString(str: string): string {
  return str.replace(/\\([0-7]{1,3})/g, (_, oct) => {
    const code = parseInt(oct, 8)
    return String.fromCharCode(code)
  })
}

function cleanPdfLiteralString(str: string): string {
  // Tratamento de escapes clássicos do PDF: \(, \), \\, \n, \r, \t, etc.
  let res = ''
  let escaped = false
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (escaped) {
      if (ch === 'n') res += '\n'
      else if (ch === 'r') res += '\r'
      else if (ch === 't') res += '\t'
      else if (ch === '(') res += '('
      else if (ch === ')') res += ')'
      else if (ch === '\\') res += '\\'
      else res += ch
      escaped = false
    } else if (ch === '\\') {
      escaped = true
    } else {
      res += ch
    }
  }
  return decodeOctalString(res)
}

function decodeHexString(hex: string): string {
  const cleanHex = hex.replace(/\s+/g, '')
  let res = ''
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substring(i, i + 2), 16)
    if (!isNaN(byte)) {
      res += String.fromCharCode(byte)
    }
  }
  return res
}

function extractTextFromContentStream(streamText: string): string {
  const textTokens: string[] = []

  // Encontrar blocos de texto BT ... ET
  const btRegex = /BT([\s\S]*?)ET/g
  let btMatch: RegExpExecArray | null
  while ((btMatch = btRegex.exec(streamText)) !== null) {
    const block = btMatch[1]

    // Padrão 1: array de strings TJ -> [ (Texto) -123 ( outro) ] TJ
    const tjArrayRegex = /\[((?:[^[\]]|\([^)]*\)|<[^>]*>)*)\]\s*TJ/g
    let tjMatch: RegExpExecArray | null
    let blockTokens: string[] = []
    while ((tjMatch = tjArrayRegex.exec(block)) !== null) {
      const inside = tjMatch[1]
      const strRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g
      let m: RegExpExecArray | null
      let linePart = ''
      while ((m = strRegex.exec(inside)) !== null) {
        if (m[1] !== undefined) {
          linePart += cleanPdfLiteralString(m[1])
        } else if (m[2] !== undefined) {
          linePart += decodeHexString(m[2])
        }
      }
      if (linePart) {
        blockTokens.push(linePart)
      }
    }

    // Padrão 2: string única Tj ou ' ou " -> (Texto) Tj
    const tjSingleRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g
    let singleMatch: RegExpExecArray | null
    while ((singleMatch = tjSingleRegex.exec(block)) !== null) {
      blockTokens.push(cleanPdfLiteralString(singleMatch[1]))
    }

    // Padrão 3: hex Tj -> <48656c6c6f> Tj
    const hexTjRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g
    let hexMatch: RegExpExecArray | null
    while ((hexMatch = hexTjRegex.exec(block)) !== null) {
      blockTokens.push(decodeHexString(hexMatch[1]))
    }

    if (blockTokens.length > 0) {
      // Une os tokens do bloco em uma linha e adiciona quebra
      textTokens.push(blockTokens.join(' '))
    }
  }

  // Se não encontrou BT/ET, busca literais soltos
  if (textTokens.length === 0) {
    const simpleRegex = /\(([^()]{3,})\)/g
    let m: RegExpExecArray | null
    while ((m = simpleRegex.exec(streamText)) !== null) {
      const clean = cleanPdfLiteralString(m[1])
      if (clean && /[a-zA-Z0-9]/.test(clean)) {
        textTokens.push(clean)
      }
    }
    return textTokens.join(' ')
  }

  return textTokens.join('\n')
}

/**
 * Tenta usar a biblioteca PDF.js via CDN caso disponível na window ou carregável dinamicamente.
 */
declare global {
  interface Window {
    pdfjsLib?: any
    'pdfjs-dist/build/pdf'?: any
  }
}

function getGlobalPdfJs(): any {
  if (typeof window === 'undefined') return null
  return window.pdfjsLib || window['pdfjs-dist/build/pdf'] || null
}

async function tryLoadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null
  const current = getGlobalPdfJs()
  if (current) return current

  try {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-pdfjs="true"]')
      if (existing) {
        if (getGlobalPdfJs()) return resolve()
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', (e) => reject(e))
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.dataset.pdfjs = 'true'
      script.onload = () => {
        const lib = getGlobalPdfJs()
        if (lib) {
          lib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          resolve()
        } else {
          resolve()
        }
      }
      script.onerror = () => resolve()
      document.head.appendChild(script)
    })
    return getGlobalPdfJs()
  } catch {
    return null
  }
}

/**
 * Extração de texto usando PDF.js quando o script do navegador responder
 */
async function extractWithPdfJs(
  pdfjs: any,
  data: ArrayBuffer,
): Promise<PdfExtractionResult | null> {
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(data.slice(0)),
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const pdf = await loadingTask.promise
    const numPages: number = pdf.numPages
    const pages: ExtractedPdfPage[] = []

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const items: string[] = []
      let lastY: number | null = null
      let currentLine = ''

      for (const item of textContent.items) {
        const text = item.str || ''
        const y = item.transform ? Math.round(item.transform[5]) : null

        if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) items.push(currentLine.trim())
          currentLine = text
        } else {
          currentLine += (currentLine ? ' ' : '') + text
        }
        lastY = y
      }
      if (currentLine.trim()) items.push(currentLine.trim())

      const pageText = items.join('\n')
      pages.push({
        pageNumber: i,
        text: pageText,
        lines: items,
      })
    }

    const fullText = pages.map((p) => p.text).join('\n\n')
    const hasMeaningfulText = fullText.replace(/[\s\r\n]+/g, '').length > 20

    return {
      numPages,
      pages,
      fullText,
      isScannedOrEmpty: !hasMeaningfulText,
    }
  } catch {
    return null
  }
}

/**
 * Motor autônomo offline embutido para decodificar streams do PDF diretamente
 * Não requer nenhuma rede externa e é 100% determinístico.
 */
async function extractNative(data: ArrayBuffer): Promise<PdfExtractionResult> {
  const bytes = new Uint8Array(data)
  const decoder = new TextDecoder('latin1')
  const pdfString = decoder.decode(bytes)

  // Identifica páginas
  const pageMatches = pdfString.match(/\/Type\s*\/Page\b/g)
  const numPages = Math.max(1, pageMatches ? pageMatches.length : 1)

  // Extrai objetos stream com posicionamento preciso em bytes
  const streamKeyword = 'stream'
  const endStreamKeyword = 'endstream'
  const extractedPieces: string[] = []

  let searchPos = 0
  while (true) {
    const streamIdx = pdfString.indexOf(streamKeyword, searchPos)
    if (streamIdx === -1) break

    // Garante que é palavra-chave de stream (precedida por quebra de linha ou espaço)
    const prevChar = streamIdx > 0 ? pdfString[streamIdx - 1] : '\n'
    if (!/[\r\n\s]/.test(prevChar)) {
      searchPos = streamIdx + 6
      continue
    }

    // A linha de metadados anterior (até 400 bytes antes)
    const headerSlice = pdfString.substring(Math.max(0, streamIdx - 400), streamIdx)
    const isFlate = /Filter\s*(\/FlateDecode|\[\s*\/FlateDecode\s*\])/i.test(headerSlice)

    // O conteúdo binário do stream começa após o 'stream\r\n' ou 'stream\n'
    let contentStart = streamIdx + 6
    if (bytes[contentStart] === 0x0d && bytes[contentStart + 1] === 0x0a) {
      contentStart += 2
    } else if (bytes[contentStart] === 0x0a) {
      contentStart += 1
    }

    const endIdx = pdfString.indexOf(endStreamKeyword, contentStart)
    if (endIdx === -1) break

    let contentEnd = endIdx
    // Remove quebra de linha final antes de endstream
    if (contentEnd > contentStart && bytes[contentEnd - 1] === 0x0a) {
      contentEnd--
      if (contentEnd > contentStart && bytes[contentEnd - 1] === 0x0d) {
        contentEnd--
      }
    }

    const streamSlice = bytes.subarray(contentStart, contentEnd)

    if (isFlate) {
      const decompressed = await decompressFlate(streamSlice)
      if (decompressed) {
        const streamText = new TextDecoder('latin1').decode(decompressed)
        const text = extractTextFromContentStream(streamText)
        if (text.trim()) extractedPieces.push(text)
      }
    } else {
      const rawText = new TextDecoder('latin1').decode(streamSlice)
      const text = extractTextFromContentStream(rawText)
      if (text.trim()) extractedPieces.push(text)
    }

    searchPos = endIdx + 9
  }

  // Se não extraiu streams, tenta encontrar texto puro no arquivo
  if (extractedPieces.length === 0) {
    const rawText = extractTextFromContentStream(pdfString)
    if (rawText.trim()) extractedPieces.push(rawText)
  }

  const allLines = extractedPieces
    .join('\n')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const fullText = allLines.join('\n')
  const hasText = fullText.replace(/[\s\r\n]+/g, '').length > 20

  const pages: ExtractedPdfPage[] = [
    {
      pageNumber: 1,
      text: fullText,
      lines: allLines,
    },
  ]

  return {
    numPages,
    pages,
    fullText,
    isScannedOrEmpty: !hasText,
  }
}

/**
 * Função pública para extração de texto de PDF.
 * Tenta PDF.js se carregável rapidamente (com timeout), se falhar usa o extrator nativo resiliente.
 */
export async function extractPdfText(file: File | ArrayBuffer): Promise<PdfExtractionResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file

  // Timeout para tentar PDF.js (máx 2.5s para permitir carregamento do script)
  const pdfJsPromise = tryLoadPdfJs().then((pdfjs) => {
    if (pdfjs) {
      return extractWithPdfJs(pdfjs, buffer)
    }
    return null
  })

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))

  const pdfJsResult = await Promise.race([pdfJsPromise, timeoutPromise]).catch(() => null)
  if (pdfJsResult && !pdfJsResult.isScannedOrEmpty && pdfJsResult.fullText.length > 50) {
    return pdfJsResult
  }

  // Usa motor nativo robusto offline
  const nativeResult = await extractNative(buffer)

  // Se o nativo conseguiu texto, retorna ele
  if (!nativeResult.isScannedOrEmpty && nativeResult.fullText.length > 50) {
    return nativeResult
  }

  // Se o PDF.js trouxe algum resultado (mesmo parcial), prefere-o
  if (pdfJsResult && !pdfJsResult.isScannedOrEmpty) {
    return pdfJsResult
  }

  return nativeResult
}
