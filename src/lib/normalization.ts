/**
 * Módulo de Normalização para Conciliação Financeira
 * Normaliza nomes de estabelecimentos e parceiros sem alterar a string original exibida ao usuário.
 * Normaliza valores e datas brasileiras de forma tolerante.
 */

// Prefixos conhecidos de gateway de pagamento, adquirentes ou intermediários
const GATEWAY_PREFIXES = [
  /^(dl\s*\*+|dl\s+)/i,
  /^(ig\s*\*+|ig\s+)/i,
  /^(pg\s*\*+|pg\s+)/i,
  /^(mp\s*\*+|mp\s+)/i,
  /^(vindi\s*\*+|vindi\s+)/i,
  /^(pp\s*\*+|pp\s+)/i,
  /^(mercado\s*\*+|mercadolivre\s*\*+|mercado\s+livre\s*[-*:]*)/i,
  /^(pag\s*\*+|pag\s+)/i,
  /^(iugu\s*\*+|iugu\s+)/i,
  /^(cielo\s*\*+|cielo\s+)/i,
  /^(stone\s*\*+|stone\s+)/i,
  /^(asaas\s*\*+|asaas\s+)/i,
]

// Sufixos empresariais comuns a remover na comparação
const CORPORATE_SUFFIXES = [
  /\b(ltda|eireli|s\.?a\.?|s\/?a|me|epp|mei|sociedade\s+anonima|comercio|comercial|distribuidora|servicos|serv\b|solucoes|artigos|utilidades)\b/gi,
]

// Palavras genéricas ou conectivos a ignorar na pontuação
const STOP_WORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'em',
  'para',
  'com',
  'por',
  'la',
  'el',
  'the',
  'a',
  'o',
  'as',
  'os',
])

/**
 * Remove ruídos como emojis (ex.: "⚠️"), pontuação, acentos e prefixos/sufixos
 * mantendo apenas o cerne do nome da empresa/estabelecimento.
 */
export function normalizeEntityName(raw: string): string {
  if (!raw) return ''

  // 1. Remove emojis (ex.: ⚠️, 🚨) e símbolos gráficos
  let cleaned = raw
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, ' ')
    .trim()

  // 2. Transforma em minúsculas e remove acentos
  cleaned = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // 3. Remove prefixos comuns de gateways sucessivamente
  let changed = true
  while (changed) {
    const before = cleaned
    for (const prefix of GATEWAY_PREFIXES) {
      cleaned = cleaned.replace(prefix, '')
    }
    cleaned = cleaned.trim()
    changed = cleaned !== before
  }

  // 4. Se tiver parcelas anexadas como " 04/06", " 03/10", " 11/12", "09/12", "12/12"
  cleaned = cleaned.replace(/\s*\b\d{2}\/\d{2}\b\s*/g, ' ')

  // 5. Remove sufixos empresariais
  for (const suf of CORPORATE_SUFFIXES) {
    cleaned = cleaned.replace(suf, ' ')
  }

  // 5b. Remove prefixos de aviso/alerta comuns do Odoo (ex: ⚠️)
  cleaned = cleaned.replace(/[⚠️\u26A0\uFE0F]/g, ' ')

  // 6. Substitui pontuação, asteriscos, hífens e traços por espaço
  cleaned = cleaned.replace(/[^a-z0-9]/g, ' ')

  // 7. Remove múltiplos espaços
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

/**
 * Extrai tokens significativos de uma entidade (palavras com 2 ou mais caracteres, ignorando stop words)
 */
export function extractSignificantTokens(name: string): string[] {
  const norm = normalizeEntityName(name)
  if (!norm) return []

  return norm
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w))
}

/**
 * Calcula índice de similaridade de Jaccard e sobreposição de tokens entre dois nomes.
 * Retorna de 0 (nada em comum) a 1 (idênticos ou quase idênticos).
 * Considera substrings para lidar com abreviações como "SJX - COMERCIAL ATACAD" vs "SJX COMERCIAL ATACADISTA"
 */
export function calculateNameSimilarity(rawA: string, rawB: string): number {
  if (!rawA || !rawB) return 0

  const normA = normalizeEntityName(rawA)
  const normB = normalizeEntityName(rawB)

  // Caso idêntico após normalização
  if (normA === normB && normA.length > 0) return 1.0

  // Se um está inteiramente contido no outro (ex: "SWIFT PIRACUAMA" no meio de "SWIFT PIRACUAMA ALIMENTOS")
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) {
      const minLen = Math.min(normA.length, normB.length)
      const maxLen = Math.max(normA.length, normB.length)
      return Math.max(0.85, minLen / maxLen)
    }
  }

  const tokensA = extractSignificantTokens(rawA)
  const tokensB = extractSignificantTokens(rawB)

  if (tokensA.length === 0 || tokensB.length === 0) return 0

  // Contagem de tokens coincidentes ou com match de prefixo (ex: "atacad" e "atacadista")
  let matchesA = 0
  for (const tA of tokensA) {
    const found = tokensB.some((tB) => {
      if (tA === tB) return true
      if (tA.length >= 4 && tB.length >= 4) {
        if (tA.startsWith(tB) || tB.startsWith(tA)) return true
      }
      return false
    })
    if (found) matchesA++
  }

  let matchesB = 0
  for (const tB of tokensB) {
    const found = tokensA.some((tA) => {
      if (tA === tB) return true
      if (tA.length >= 4 && tB.length >= 4) {
        if (tA.startsWith(tB) || tB.startsWith(tA)) return true
      }
      return false
    })
    if (found) matchesB++
  }

  const overlapScore = (matchesA / tokensA.length + matchesB / tokensB.length) / 2

  // Bônus se a primeira palavra principal for idêntica (marca central, ex: "STARLINK", "SWIFT", "SJX", "VERISURE", "AUTENTIQUE")
  const firstA = tokensA[0]
  const firstB = tokensB[0]
  let brandBonus = 0
  if (firstA && firstB) {
    if (firstA === firstB) {
      brandBonus = 0.2
    } else if (
      (firstA.startsWith(firstB) || firstB.startsWith(firstA)) &&
      Math.min(firstA.length, firstB.length) >= 4
    ) {
      brandBonus = 0.15
    }
  }

  return Math.min(1.0, overlapScore * 0.8 + brandBonus)
}

/**
 * Normaliza valores monetários com precisão de 2 casas decimais.
 * "R$ 1.954,12", "1954.12", "1.954,12", "1954,12" -> 1954.12
 */
export function normalizeMoneyValue(val: unknown): number {
  if (typeof val === 'number') {
    return Math.round(val * 100) / 100
  }
  if (!val) return 0

  let str = String(val).trim()

  // Remove moeda e espaços
  str = str.replace(/R\$/gi, '').replace(/US\$/gi, '').replace(/USD/gi, '').trim()

  // Tratamento de negativo no fim ou parênteses
  let isNegative = false
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true
    str = str.replace(/-/g, '').trim()
  } else if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true
    str = str.slice(1, -1).trim()
  }

  // Remove caracteres que não sejam dígitos, ponto ou vírgula
  str = str.replace(/[^\d.,]/g, '')

  let numeric = 0
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',')
    const lastDot = str.lastIndexOf('.')
    if (lastComma > lastDot) {
      // Padrão brasileiro 1.954,12
      numeric = parseFloat(str.replace(/\./g, '').replace(',', '.'))
    } else {
      // Padrão internacional 1,954.12
      numeric = parseFloat(str.replace(/,/g, ''))
    }
  } else if (str.includes(',')) {
    // Padrão brasileiro sem milhares 1954,12
    numeric = parseFloat(str.replace(',', '.'))
  } else {
    numeric = parseFloat(str) || 0
  }

  const result = Math.round(numeric * 100) / 100
  return isNegative ? -result : result
}

export interface NormalizedDateParts {
  day: number
  month: number
  year?: number
}

/**
 * Converte strings de data comuns no Brasil em partes estruturadas { day, month, year }
 * Aceita:
 * - "DD/MM" (fatura)
 * - "DD/MM/AAAA" (odoo texto)
 * - "Wed Jul 01 2026..." (Date toString do Excel)
 * - "2026-06-23" (ISO)
 */
export function parseFlexibleDate(dateStr: string): NormalizedDateParts | null {
  if (!dateStr) return null

  const trimmed = dateStr.trim()

  // Tenta formato ISO "AAAA-MM-DD"
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    }
  }

  // Tenta formato brasileiro "DD/MM/AAAA" ou "DD/MM/AA" ou "DD/MM"
  const brMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/)
  if (brMatch) {
    const day = parseInt(brMatch[1], 10)
    const month = parseInt(brMatch[2], 10)
    let year: number | undefined
    if (brMatch[3]) {
      year = parseInt(brMatch[3], 10)
      if (year < 100) year += 2000
    }
    return { day, month, year }
  }

  // Tenta Date.parse para formatos em inglês (ex: "Wed Jul 01 2026 ...")
  const timestamp = Date.parse(trimmed)
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp)
    return {
      day: d.getUTCDate(),
      month: d.getUTCMonth() + 1,
      year: d.getUTCFullYear(),
    }
  }

  return null
}

/**
 * Calcula a diferença em dias entre duas datas, considerando mês e dia e opcionalmente o ano
 */
export function calculateDateDifferenceInDays(
  dateAStr: string,
  dateBStr: string,
  referenceYear = 2026,
): number | null {
  const a = parseFlexibleDate(dateAStr)
  const b = parseFlexibleDate(dateBStr)

  if (!a || !b) return null

  const yearA = a.year || referenceYear
  const yearB = b.year || referenceYear

  const dateA = new Date(yearA, a.month - 1, a.day)
  const dateB = new Date(yearB, b.month - 1, b.day)

  const diffMs = Math.abs(dateA.getTime() - dateB.getTime())
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}
