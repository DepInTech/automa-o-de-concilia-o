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

async function decompressFlate(data: Uint8Array): Promise<Uint8Array | null> {
  // Tenta descompressão via DecompressionStream ('deflate-raw' ou 'deflate')
  try {
    const ds = new DecompressionStream('deflate-raw')
    const blob = new Blob([data as unknown as BlobPart])
    const stream = blob.stream().pipeThrough(ds)
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.length
    }
    const out = new Uint8Array(total)
    let pos = 0
    for (const c of chunks) {
      out.set(c, pos)
      pos += c.length
    }
    return out
  } catch {
    // Tenta formato zlib com cabeçalho de 2 bytes pulado
    try {
      if (data.length > 2) {
        const sliced = data.subarray(2)
        const ds = new DecompressionStream('deflate-raw')
        const blob = new Blob([sliced as unknown as BlobPart])
        const stream = blob.stream().pipeThrough(ds)
        const reader = stream.getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          total += value.length
        }
        const out = new Uint8Array(total)
        let pos = 0
        for (const c of chunks) {
          out.set(c, pos)
          pos += c.length
        }
        return out
      }
    } catch {
      // Falha na descompressão
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
        textTokens.push(linePart)
      }
    }

    // Padrão 2: string única Tj ou ' ou " -> (Texto) Tj
    const tjSingleRegex = /\(([^)]*)\)\s*(?:Tj|'|")/g
    let singleMatch: RegExpExecArray | null
    while ((singleMatch = tjSingleRegex.exec(block)) !== null) {
      textTokens.push(cleanPdfLiteralString(singleMatch[1]))
    }

    // Padrão 3: hex Tj -> <48656c6c6f> Tj
    const hexTjRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g
    let hexMatch: RegExpExecArray | null
    while ((hexMatch = hexTjRegex.exec(block)) !== null) {
      textTokens.push(decodeHexString(hexMatch[1]))
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
  }

  return textTokens.join(' ')
}

/**
 * Tenta usar a biblioteca PDF.js via CDN caso disponível na window ou carregável dinamicamente.
 */
declare global {
  interface Window {
    pdfjsLib?: any
  }
}

async function tryLoadPdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null
  if (window.pdfjsLib) return window.pdfjsLib

  try {
    // Carrega dinamicamente a versão 3.11.174 do cdnjs de forma resiliente
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-pdfjs="true"]')
      if (existing) {
        if (window.pdfjsLib) return resolve()
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', (e) => reject(e))
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
      script.dataset.pdfjs = 'true'
      script.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          resolve()
        } else {
          reject(new Error('pdfjsLib não disponível'))
        }
      }
      script.onerror = (e) => reject(e)
      document.head.appendChild(script)
    })
    return window.pdfjsLib
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
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
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

  // Extrai objetos stream ... endstream
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g
  let match: RegExpExecArray | null
  const extractedPieces: string[] = []

  // Localiza todos os streams com seus metadados precedentes
  let searchIdx = 0
  while ((match = streamRegex.exec(pdfString)) !== null) {
    const streamStartInMatch = match.index + match[0].indexOf('stream')
    const headerSlice = pdfString.substring(
      Math.max(0, streamStartInMatch - 400),
      streamStartInMatch,
    )
    const isFlate = /Filter\s*(\/FlateDecode|\[\s*\/FlateDecode\s*\])/i.test(headerSlice)

    const rawStreamContent = match[1]
    const streamByteOffset = match.index + (match[0].indexOf('\n') + 1)
    const streamByteLen = rawStreamContent.length

    if (isFlate) {
      // Pega os bytes reais do Uint8Array
      const slice = bytes.subarray(streamByteOffset, streamByteOffset + streamByteLen)
      const decompressed = await decompressFlate(slice)
      if (decompressed) {
        const streamText = new TextDecoder('latin1').decode(decompressed)
        const text = extractTextFromContentStream(streamText)
        if (text.trim()) extractedPieces.push(text)
      }
    } else {
      const text = extractTextFromContentStream(rawStreamContent)
      if (text.trim()) extractedPieces.push(text)
    }

    searchIdx++
  }

  // Se não extraiu streams, tenta encontrar texto em formato puro no arquivo
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

  // Timeout para tentar PDF.js (máx 1.5s para não travar a experiência)
  const pdfJsPromise = tryLoadPdfJs().then((pdfjs) => {
    if (pdfjs) {
      return extractWithPdfJs(pdfjs, buffer)
    }
    return null
  })

  const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))

  const pdfJsResult = await Promise.race([pdfJsPromise, timeoutPromise]).catch(() => null)
  if (pdfJsResult && !pdfJsResult.isScannedOrEmpty) {
    return pdfJsResult
  }

  // Usa motor nativo robusto
  const nativeResult = await extractNative(buffer)

  // Se o nativo conseguiu texto, retorna ele
  if (!nativeResult.isScannedOrEmpty) {
    return nativeResult
  }

  // Se o PDF.js vier com resultado mesmo vazio, retorna ele
  if (pdfJsResult) {
    return pdfJsResult
  }

  return nativeResult
}
