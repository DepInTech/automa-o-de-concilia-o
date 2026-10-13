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
  /^(pagseguro\s*\*+|pagseguro\s+|pag\s*seguro\s*\*+|pag\s*seguro\s+)/i,
  /^(getnet\s*\*+|getnet\s+)/i,
  /^(cielo\s*\*+|cielo\s+)/i,
  /^(stone\s*\*+|stone\s+)/i,
  /^(rede\s*\*+|rede\s+)/i,
  /^(pagar\.?me\s*\*+|pagarme\s*\*+|pagarme\s+)/i,
  /^(pp\s*\*+|pp\s+)/i,
  /^(mercado\s*pago\s*\*+|mercadopago\s*\*+|mercadopago\s+|mercado\s*pago\s+)/i,
  /^(mercado\s*\*+|mercadolivre\s*\*+|mercado\s+livre\s*[-*:]*|mercado\s+livre\s*-?\s*|meli\s*\*+)/i,
  /^(pag\s*\*+|pag\s+)/i,
  /^(iugu\s*\*+|iugu\s+)/i,
  /^(asaas\s*\*+|asaas\s+)/i,
  /^(stripe\s*\*+|stripe\s+)/i,
  /^(paypal\s*\*+|paypal\s+)/i,
  /^(sumup\s*\*+|sumup\s+)/i,
]

// Sufixos empresariais, termos societários e palavras genéricas de razão social a remover na comparação
const CORPORATE_SUFFIXES = [
  /\b(ltda|eireli|s\.?a\.?|s\/?a|me|epp|mei|sociedade\s+anonima|sociedade\s+limitada|comercio|comercial|distribuidora|servicos|serv\b|solucoes|artigos|utilidades|brasil|brazil|loja|lojas)\b/gi,
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
  'no',
  'na',
  'nos',
  'nas',
])

/**
 * Remove ruídos como emojis (ex.: "⚠️"), pontuação, acentos e prefixos/sufixos
 * mantendo apenas o cerne do nome da empresa/estabelecimento.
 */
export function normalizeEntityName(raw: string): string {
  if (!raw) return ''

  // 0. Remove sufixos como "-0106", "LJ45", "- Sacolão São Jorge" etc
  let cleaned = raw
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, ' ')
    .trim()

  // Se o nome contiver " - " separando a plataforma do vendedor real
  // Ex: "MERCADO LIVRE - Z4 COMERCIO...", "MERCADO LIVRE - DON COMERCIO..."
  // Remove o prefixo de plataforma para expor o nome do vendedor real
  cleaned = cleaned.replace(/^mercado\s*livre\s*-\s*/i, '')
  cleaned = cleaned.replace(/^mercado\s*livre\s+/i, '')

  // Se tiver portador entre parênteses ex: "NOME (xxxx)", remove
  cleaned = cleaned.replace(/\s*\([^)]*\d+[^)]*\)/g, ' ')

  // 2. Transforma em minúsculas e remove acentos
  cleaned = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  // Tratamentos específicos de marcas comuns do Itaú / Odoo
  if (/assai/i.test(cleaned) || /sendas/i.test(cleaned)) {
    return 'sendas assai'
  }
  if (/pao\s+de\s+acucar/i.test(cleaned)) {
    return 'pao de acucar'
  }
  if (/uber/i.test(cleaned)) {
    return 'uber'
  }
  if (/autentique/i.test(cleaned)) {
    return 'autentique'
  }

  // 3. Normaliza referências a Mercado Livre / Mercado Pago antes da remoção
  // Se for apenas Mercado Livre ou variação, preserva um token identificador
  const isPureMercadoLivre =
    /^(mercado\s*livre|mercadolivre|mercado\*mercadolivre|mercadolivre\*mercadol)(\s|$)/i.test(
      cleaned,
    ) ||
    /^(mercado\s*livre|mercadolivre)$/i.test(
      raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim(),
    )

  // Remove prefixos comuns de gateways sucessivamente
  let changed = true
  while (changed) {
    const before = cleaned
    for (const prefix of GATEWAY_PREFIXES) {
      cleaned = cleaned.replace(prefix, '')
    }
    cleaned = cleaned.trim()
    changed = cleaned !== before
  }

  // Se restou vazio após remover "mercadolivre*", "mercado*" ou similar, define como genérico de marketplace
  if (!cleaned && isPureMercadoLivre) {
    cleaned = 'mercadolivre'
  } else if (/^(mercadol|mercadoli|mercadoliv|mercadolivre|mercado|meli)$/i.test(cleaned)) {
    // Truncamentos de "MERCADOLIVRE*MERCADOL" ou "MERCADO*MERCADOLIVRE"
    cleaned = 'mercadolivre'
  }

  // 4. Se tiver parcelas anexadas como " 04/06", " 03/10", " 11/12", "09/12", "12/12"
  cleaned = cleaned.replace(/\s*\b\d{2}\/\d{2}\b\s*/g, ' ')

  // 5. Remove prefixos de aviso/alerta comuns do Odoo (ex: ⚠️)
  cleaned = cleaned.replace(/[⚠️\u26A0\uFE0F]/g, ' ')

  // 5b. Separa asterisco ou outros delimitadores
  cleaned = cleaned.replace(/[*_#+]/g, ' ')

  // 6. Substitui pontuação, asteriscos, hífens e traços por espaço
  cleaned = cleaned.replace(/[^a-z0-9]/g, ' ')

  // 7. Remove sufixos empresariais e termos societários (três passagens para capturar sequências como "servicos de internet ltda")
  for (let pass = 0; pass < 3; pass++) {
    for (const suf of CORPORATE_SUFFIXES) {
      cleaned = cleaned.replace(suf, ' ')
    }
    cleaned = cleaned.trim()
  }

  // 8. Remove múltiplos espaços
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Se a limpeza de sufixos/stop words resultou em vazio ou termo truncado de marketplace
  if (!cleaned && isPureMercadoLivre) {
    cleaned = 'mercadolivre'
  } else if (/^(mercadol|mercadoli|mercadoliv|mercadolivre|mercado|meli)$/i.test(cleaned)) {
    cleaned = 'mercadolivre'
  }

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
  // Se ambos normalizaram para "mercadolivre" (ou seja, eram nomes puramente genéricos de marketplace),
  // a similaridade NÃO é 1.0! O nome de plataforma isolado vale ZERO como evidência de parceiro.
  if (normA === normB && normA.length > 0) {
    if (normA === 'mercadolivre') {
      return 0.0
    }
    return 1.0
  }

  // Se um está inteiramente contido no outro (ex: "SWIFT PIRACUAMA" no meio de "SWIFT PIRACUAMA ALIMENTOS")
  // Não aplicar se um deles for apenas "mercadolivre"
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA !== 'mercadolivre' && normB !== 'mercadolivre') {
      if (normA.includes(normB) || normB.includes(normA)) {
        const minLen = Math.min(normA.length, normB.length)
        const maxLen = Math.max(normA.length, normB.length)
        return Math.max(0.85, minLen / maxLen)
      }
    }
  }

  const tokensA = extractSignificantTokens(rawA)
  const tokensB = extractSignificantTokens(rawB)

  if (tokensA.length === 0 || tokensB.length === 0) {
    // Se a normalização limpou quase tudo, tenta comparar os primeiros caracteres brutos limpos
    const cleanRawA = rawA.toLowerCase().replace(/[^a-z0-9]/g, '')
    const cleanRawB = rawB.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (
      cleanRawA &&
      cleanRawB &&
      (cleanRawA.includes(cleanRawB) || cleanRawB.includes(cleanRawA))
    ) {
      return 0.7
    }
    return 0
  }

  // Contagem de tokens coincidentes ou com match de prefixo (ex: "atacad" e "atacadista", "mercadorias")
  let matchesA = 0
  for (const tA of tokensA) {
    const found = tokensB.some((tB) => {
      if (tA === tB) return true
      // Prefix match para tokens com pelo menos 3 caracteres (ex: "sjx" === "sjx", "atacad" vs "atacadista")
      if (tA.length >= 3 && tB.length >= 3) {
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
      if (tA.length >= 3 && tB.length >= 3) {
        if (tA.startsWith(tB) || tB.startsWith(tA)) return true
      }
      return false
    })
    if (found) matchesB++
  }

  // Importante: NÃO atribuir pontuação alta arbitrária (0.8) apenas por pertencerem à família do Mercado Livre!
  // A semelhança deve ser calculada pelos tokens do vendedor real ou pelo overlap dos termos substantivos.
  const isMlA = /mercado\s*livre|mercadolivre|mercado\*|mp\s*\*/i.test(rawA)
  const isMlB = /mercado\s*livre|mercadolivre|mercado\*|mp\s*\*/i.test(rawB)
  const bothMarketplaceFamily = isMlA && isMlB

  // Caso Uber: "DL*UberRides" vs "Uber"
  const isUberA = /uber/i.test(rawA)
  const isUberB = /uber/i.test(rawB)
  if (isUberA && isUberB) {
    return 0.85
  }

  // Se ambos são do mesmo marketplace (ex: Mercado Livre) e um dos lados é genérico sem vendedor
  // (ex.: "Mercado Livre" no Odoo ou "MERCADOLIVRE*MERCADOL" na fatura):
  // Regra inviolável: a palavra da plataforma / intermediador vale ZERO como evidência!
  const isGenericTokenCheck = (w: string) =>
    /^(mercadolivre|mercado|meli|mercadol|mercadoli|mercadoliv|livre|brasil|brazil|comercio|comercial|servicos|servico|artigos|distribuidora|loja|lojas|ltda)$/i.test(
      w,
    )

  const distinctiveA = tokensA.filter((t) => !isGenericTokenCheck(t))
  const distinctiveB = tokensB.filter((t) => !isGenericTokenCheck(t))

  const isGenericMlA = distinctiveA.length === 0
  const isGenericMlB = distinctiveB.length === 0

  if (bothMarketplaceFamily && (isGenericMlA || isGenericMlB)) {
    // Regra: nome da plataforma = zero evidência distintiva
    return 0.0
  }

  // Overlap assimétrico: se um nome curto da fatura ("SJX ATACAD") ou token truncado ("DONEMBALAGENS")
  // está quase todo contido na razão social longa do Odoo ("DON COMERCIO E IMPORTACAO DE EMBALAGENS"),
  // o minMatch (proporção do menor conjunto coberto) tem grande relevância.
  // Em famílias de marketplace, medimos sobre os tokens DISTINTIVOS para não inflar pontuação com termos comuns!
  const targetTokensA = bothMarketplaceFamily ? distinctiveA : tokensA
  const targetTokensB = bothMarketplaceFamily ? distinctiveB : tokensB

  let matchesDistinctiveA = 0
  for (const tA of targetTokensA) {
    if (
      targetTokensB.some((tB) => {
        if (tA === tB) return true
        if (tA.length >= 3 && tB.length >= 3) {
          if (tA.startsWith(tB) || tB.startsWith(tA)) return true
        }
        if (tA.length >= 4 && tB.length >= 4) {
          if (tA.includes(tB) || tB.includes(tA)) return true
        }
        return false
      })
    ) {
      matchesDistinctiveA++
    }
  }

  let matchesDistinctiveB = 0
  for (const tB of targetTokensB) {
    if (
      targetTokensA.some((tA) => {
        if (tA === tB) return true
        if (tA.length >= 3 && tB.length >= 3) {
          if (tA.startsWith(tB) || tB.startsWith(tA)) return true
        }
        if (tA.length >= 4 && tB.length >= 4) {
          if (tA.includes(tB) || tB.includes(tA)) return true
        }
        return false
      })
    ) {
      matchesDistinctiveB++
    }
  }

  const effectiveMatchesA = bothMarketplaceFamily ? matchesDistinctiveA : matchesA
  const effectiveMatchesB = bothMarketplaceFamily ? matchesDistinctiveB : matchesB
  const effLenA = targetTokensA.length
  const effLenB = targetTokensB.length

  const coveredOfMin =
    effLenA <= effLenB
      ? effLenA > 0
        ? effectiveMatchesA / effLenA
        : 0
      : effLenB > 0
        ? effectiveMatchesB / effLenB
        : 0
  const coveredOfMax =
    effLenA > effLenB
      ? effLenA > 0
        ? effectiveMatchesA / effLenA
        : 0
      : effLenB > 0
        ? effectiveMatchesB / effLenB
        : 0

  let overlapScore = coveredOfMin * 0.65 + coveredOfMax * 0.35

  // Verificação de token distintivo composto ou truncado (ex: "DONEMBALAGENS" no meio de "DON COMERCIO... EMBALAGENS")
  // ou "MERCADOLIVRE*AXPNEUMA" vs "LEONARDO DA SILVA FERREIRA" (não bate) vs "AX PNEUMATICA" (bate)
  // ou "MERCADO*FANTASIACAROL" vs "Iria Carolina... / CAROL FANTASIAS"
  const isGenericToken = (w: string) =>
    /^(mercadolivre|mercado|livre|brasil|brazil|comercio|comercial|servicos|servico|artigos|distribuidora|loja|lojas)$/i.test(
      w,
    )

  let subTokenMatch = false
  for (const tA of tokensA) {
    if (tA.length >= 4 && !isGenericToken(tA)) {
      if (
        tokensB.some((tB) => {
          if (isGenericToken(tB)) return false
          if (tA === tB) return true
          // Apenas se o prefixo for relevante e não coincidente com radicais genéricos
          if (tA.length >= 4 && tB.length >= 4) {
            if (tA.startsWith(tB) || tB.startsWith(tA)) return true
          }
          // Substring match: tA dentro de tB ou tB dentro de tA (ex: "carol" em "fantasiacarol", "embalagens" em "donembalagens")
          if (tA.length >= 4 && tB.length >= 4) {
            if (tA.includes(tB) || tB.includes(tA)) return true
          }
          return false
        })
      ) {
        subTokenMatch = true
        break
      }
    }
  }
  for (const tB of tokensB) {
    if (tB.length >= 4 && !isGenericToken(tB)) {
      if (
        tokensA.some((tA) => {
          if (isGenericToken(tA)) return false
          if (tA === tB) return true
          if (tA.length >= 4 && tB.length >= 4) {
            if (tA.startsWith(tB) || tB.startsWith(tA)) return true
          }
          if (tA.length >= 4 && tB.length >= 4) {
            if (tA.includes(tB) || tB.includes(tA)) return true
          }
          return false
        })
      ) {
        subTokenMatch = true
        break
      }
    }
  }
  if (subTokenMatch && overlapScore < 0.6) {
    overlapScore = Math.max(overlapScore, 0.65)
  }

  // Bônus proporcional se a primeira palavra (marca central) coincidir, ponderada pelo tamanho do nome
  // NUNCA pontuar se a primeira palavra for termo genérico ou de intermediador/marketplace
  const firstA = tokensA[0]
  const firstB = tokensB[0]
  let brandBonus = 0
  const isGenericBrand = (w?: string) =>
    !w ||
    /^(mercadolivre|mercado|livre|brasil|brazil|comercio|comercial|servicos|servico|loja|lojas|artigos|distribuidora)$/i.test(
      w,
    )

  if (firstA && firstB && !isGenericBrand(firstA) && !isGenericBrand(firstB)) {
    if (firstA === firstB && firstA.length >= 3) {
      const brevityFactor = Math.min(1.0, 2 / Math.min(tokensA.length, tokensB.length))
      brandBonus = 0.25 * brevityFactor
    } else if (
      (firstA.startsWith(firstB) || firstB.startsWith(firstA)) &&
      Math.min(firstA.length, firstB.length) >= 4
    ) {
      const brevityFactor = Math.min(1.0, 2 / Math.min(tokensA.length, tokensB.length))
      brandBonus = 0.18 * brevityFactor
    }
  }

  // Bônus se qualquer token distintivo com 5+ caracteres for idêntico (ex: "biocentrix", "starlink", "autentique"),
  // apenas se houver alguma sobreposição mínima global e o token não for genérico
  const anyDistinctiveTokenMatch = tokensA.some((tA) =>
    tokensB.some((tB) => tA === tB && tA.length >= 5 && !isGenericToken(tA) && !isGenericToken(tB)),
  )
  if (anyDistinctiveTokenMatch && brandBonus === 0 && (coveredOfMin >= 0.2 || subTokenMatch)) {
    brandBonus = 0.2
  }

  // Se ambos pertencem à família do marketplace e há pelo menos um token coincidente do vendedor
  const marketplaceFamilyBonus =
    bothMarketplaceFamily && (coveredOfMin > 0 || subTokenMatch) ? 0.05 : 0

  // Se ambos são do marketplace mas NENHUM token distintivo do vendedor coincidiu,
  // o overlap deve ser zerado (a família da plataforma não pode casar nomes diferentes)
  if (bothMarketplaceFamily && coveredOfMin === 0 && !subTokenMatch && brandBonus === 0) {
    return 0.0
  }

  return Math.min(1.0, overlapScore * 0.8 + brandBonus + marketplaceFamilyBonus)
}

/**
 * Normaliza valores monetários com precisão de 2 casas decimais.
 * "R$ 1.954,12", "1954.12", "1.954,12", "1954,12" -> 1954.12
 */
/**
 * Detecta se uma string contém máscara ou fragmento de identificador fiscal (CNPJ/CPF),
 * como "48.045.090/0001-63", "48.045.090/", "123.456.789-00", etc.
 * Impede que números fiscais ou seus fragmentos sejam acidentalmente interpretados como moeda.
 */
export function isFiscalIdentifierSequence(str: string): boolean {
  if (!str) return false
  const s = String(str).trim()

  // CNPJ completo: 00.000.000/0000-00 ou 00000000/0000-00
  if (/\b\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}\b/.test(s)) return true

  // Fragmento de CNPJ com barra: ex "48.045.090/" ou "48.045.090/0001"
  if (/\b\d{2}\.\d{3}\.\d{3}\//.test(s) || /\b\d{2}\.\d{3}\.\d{3}\/\d{1,4}/.test(s)) return true

  // Sufixo ou prefixo adjacente à barra de CNPJ: ex "48.045.090/"
  if (/\/\d{4}-?\d{2}\b/.test(s)) return true

  // CPF completo: 000.000.000-00
  if (/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/.test(s)) return true

  // Inscrição Estadual com rótulo ou máscara de ponto/hífen comum
  if (/\b(?:IE|I\.E\.|INSCRI[CÇ][AÃ]O\s+ESTADUAL)[\s:]*[\d.-]+/i.test(s)) return true

  return false
}

/**
 * Normaliza valores monetários com precisão de 2 casas decimais.
 * "R$ 1.954,12", "1954.12", "1.954,12", "1954,12" -> 1954.12
 */
export function normalizeMoneyValue(val: unknown): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.round(val * 100) / 100
  }
  if (!val) return 0

  let str = String(val).trim()

  // Rejeita strings que contenham ou derivem de identificador fiscal (CNPJ / CPF)
  if (isFiscalIdentifierSequence(str)) {
    return 0
  }

  // Se a string contiver barra '/', verifica se é um padrão de valor seguido de cotação/parcela/sufixo
  // ou se é uma fração/parcela pura ou fragmento fiscal
  if (str.includes('/')) {
    // 1. Se for apenas parcela isolada ex "01/02", "01/10" -> não é valor monetário
    if (/^\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/.test(str)) {
      return 0
    }
    // 2. Se a barra estiver colada a um número sem vírgula ou ponto decimal típico de moeda (ex: "48.045.090/")
    if (/\d{2,}\/$/.test(str) || /^\/\d{2,}/.test(str)) {
      return 0
    }
    // 3. Se for string como "108,40 / USD 20,00" ou "50,00 / 01/03", remove a barra e o conteúdo à direita
    // desde que a parte esquerda seja um valor monetário válido
    const parts = str.split('/')
    const firstPart = parts[0].trim()
    if (/(?:-?\s*R\$\s*|-?\s*US\$\s*|-?\s*USD\s*)?-?\s*[\d.,]+\d{2}/.test(firstPart)) {
      str = firstPart
    } else {
      return 0
    }
  }

  // Remove moeda e espaços
  str = str.replace(/R\$/gi, '').replace(/US\$/gi, '').replace(/USD/gi, '').replace(/\s+/g, '')

  // Tratamento de negativo no início, fim ou parênteses
  let isNegative = false
  if (str.startsWith('-') || str.endsWith('-')) {
    isNegative = true
    str = str.replace(/-/g, '')
  } else if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true
    str = str.slice(1, -1)
  }

  // Remove caracteres que não sejam dígitos, ponto ou vírgula
  str = str.replace(/[^\d.,]/g, '')
  if (!str) return 0

  let numeric = 0
  if (str.includes(',') && str.includes('.')) {
    const lastComma = str.lastIndexOf(',')
    const lastDot = str.lastIndexOf('.')
    if (lastComma > lastDot) {
      // Padrão brasileiro 1.954,12 ou 1.114,06 (pontos de milhar, vírgula decimal)
      numeric = parseFloat(str.replace(/\./g, '').replace(',', '.'))
    } else {
      // Padrão internacional 1,954.12 ou 1,114.06 (vírgulas de milhar, ponto decimal)
      numeric = parseFloat(str.replace(/,/g, ''))
    }
  } else if (str.includes(',')) {
    // Apenas vírgula: verificar se é separador de milhar brasileiro/internacional sem decimais (ex: "1,234,567" ou "1,234")
    // Em contexto brasileiro, vírgula quase sempre é decimal, exceto se houver múltiplas vírgulas
    const commaCount = (str.match(/,/g) || []).length
    if (commaCount > 1) {
      // Ex: "1,234,567" -> 1234567
      numeric = parseFloat(str.replace(/,/g, ''))
    } else {
      // Ex: "1234,56" -> 1234.56
      numeric = parseFloat(str.replace(',', '.'))
    }
  } else if (str.includes('.')) {
    const dotCount = (str.match(/\./g) || []).length
    if (dotCount > 1) {
      // Múltiplos pontos no padrão brasileiro de milhar sem decimais: "1.234.567" -> 1234567
      numeric = parseFloat(str.replace(/\./g, ''))
    } else {
      // Apenas um ponto: ex: "1.234" ou "1234.56"
      // Se tiver exatamente 3 dígitos após o ponto (ex: "1.234"), no Brasil isso é separador de milhar (1234.00),
      // a menos que o valor seja zero ou contexto de centavos.
      // Exemplo da usuária: "R$ 1.234,56 deve ser interpretado como 1234,56, NUNCA como 1,23456 ou 123456"
      const afterDot = str.split('.')[1] || ''
      if (afterDot.length === 3 && str.split('.')[0].length >= 1 && str.split('.')[0].length <= 3) {
        // Pode ser milhar brasileiro "1.234" -> 1234
        // Mas se for número americano com 3 decimais "1.234", analisamos:
        // Na conciliação financeira bancária brasileira (Itaú / Odoo), número com 1 ponto e 3 dígitos ex: "1.000" é milhar (1000 reais)
        numeric = parseFloat(str.replace(/\./g, ''))
      } else {
        numeric = parseFloat(str) || 0
      }
    }
  } else {
    // Apenas dígitos inteiros (1954)
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
