/**
 * Módulo de Classificação e Parsing de Faturas Bancárias (EPA Engenharia de Proteção Ambiental)
 * Referência direta de regras: "Importador Fatura EPA-4b49b.html"
 *
 * Módulo isolado da lógica de conciliação para permitir evolução e ajustes de layout bancário
 * sem tocar no motor de conciliação (Regra permanente do projeto).
 */

export interface ParsedInvoiceTransaction {
  data: string
  descricao: string
  parcela?: string
  valorBRL: number
  valorUSD?: number | null
  cotacao?: number | null
  categoria: string
  portador?: string
  observacao?: string
  rawLine?: string
  paginaOrigem?: number
}

export interface BankParsedInvoice {
  banco: 'Santander Empresas' | 'Itaú Empresas' | 'Genérico'
  cartao: string
  vencimento: string
  totalFaturaDeclarado: string
  totalFaturaValor?: number
  transactions: ParsedInvoiceTransaction[]
  avisos: string[]
}

/**
 * Classificação semântica de despesas baseada nas regras corporativas da EPA
 * Referência: classify() no Importador Fatura EPA-4b49b.html
 */
export function classifyExpense(desc: string): string {
  const u = (desc || '').toUpperCase()

  if (
    /MERCADO|MERCADOLIVRE|BAZARSHO|MERCADOL|MELV|MOBILY|LIMEDMOG|GATHOPRE|PLANETAM|ATACADODA|TESTE|ENVIABOX|EMOVE|NAPOLIDE|ACEPILCO|PABRUNEL|RUBENSTA|FONTESMIL|1CALLWAY|TITAN/.test(
      u,
    )
  ) {
    return 'Marketplace (ML)'
  }

  if (
    /LEROY|CENTERLAR|SJX|BRASLIMPO|HIDRAUCONEX|ONELETRICA|BIOCENTRIX|VALVOLANDIA|LOJANETLAB|LOJAPROLAB|NETLAB|GRUPO HM|EICOS|POLAR|EDONA|7LAB|LJ DO MEC|JABARROSBATER|VINDI|TECHFILTER|TELHANORTE|MINASGRANCOMER|DONA COMERCI|MERITO|ELASTOBOR|39PRODUTOS|APRSOLUCOE|EXTINTORES/.test(
      u,
    )
  ) {
    return 'Fornecedores'
  }

  if (/LOCALIZA|SEUPOSTO|RENDER|UBER|AZUL LINHAS|POSTOSETE/.test(u)) {
    return 'Transporte / Viagens'
  }

  if (
    /GOOGLE|OPENAI|CHATGPT|STARLINK|CANVA|INDEED|AMAZON AWS|ARQUIVEI|AUTENTIQUE|GITHUB|MICROSOFT/.test(
      u,
    )
  ) {
    return 'Tecnologia / SaaS'
  }

  if (/VERISURE/.test(u)) {
    return 'Segurança'
  }

  if (/IOF/.test(u)) {
    return 'IOF / Taxas'
  }

  if (/PAGAMENTO|ANUIDADE|ESTORNO|REEMBOLSO/.test(u)) {
    return 'Pagamento / Anuidade'
  }

  if (/SWIFT|ASSAI|MINI MERCAD|HAGAPES|ULTRAFARMA|SONHO CERTO|MAGALU|KABUM|MELIMAIS|MLP/.test(u)) {
    return 'Compras / Alimentação'
  }

  return 'Outros'
}

/**
 * Detecta o banco emissor da fatura a partir do conteúdo textual
 * Santander Empresas | Itaú Empresas | Genérico
 */
export function detectBankFromText(text: string): 'santander' | 'itau' | 'generico' {
  const u = (text || '').toUpperCase()

  if (
    u.includes('SANTANDER') &&
    (u.includes('EMPRESAS PLATINUM') ||
      u.includes('SANTANDER EMPRESAS') ||
      u.includes('BANCO SANTANDER'))
  ) {
    return 'santander'
  }

  if (
    u.includes('ITAU EMPRESAS') ||
    u.includes('ITAÚ EMPRESAS') ||
    u.includes('ITAUEMPRESAS') ||
    u.includes('BANCO ITAU') ||
    u.includes('BANCO ITAÚ')
  ) {
    return 'itau'
  }

  // Fallback por formato de linha
  // Itaú: DD/MM descrição -?R$X
  if (/^\d{2}\/\d{2}\s+\S.*?-?R\$/m.test(text)) {
    return 'itau'
  }

  // Santander: DD/MM/AAAA histórico valorBRL valorUSD cotação
  if (/^\d{2}\/\d{2}\/\d{4}\s+\S+/m.test(text)) {
    return 'santander'
  }

  return 'generico'
}

/**
 * Parser Santander Empresas
 * Formato padrão Santander:
 * ROW: DD/MM/AAAA histórico valorBRL valorUSD cotação
 * Exemplo: 05/06/2026 POSTO SETE R$ 150,00 0,00 0,00
 */
export function parseSantanderInvoiceText(text: string): BankParsedInvoice {
  // Regex do formato Santander com suporte a separadores de milhar e decimais
  const ROW =
    /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})\s+([\d,]+)$/
  const ROW_SIMPLE = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})$/
  const PARC = /\bPARC\s+(\d{2}\/\d{2})\b/i

  let cartao = ''
  let vencimento = ''
  let totalFaturaDeclarado = ''
  const txs: ParsedInvoiceTransaction[] = []

  const lines = text.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (!cartao) {
      const m =
        line.match(/(?:XXXX\.XXXX\.XXXX\.|\d{4}\.XXXX\.XXXX\.)(\d{4})/i) ||
        line.match(/cart[aã]o[:\s]+([\dX.*-]+)/i)
      if (m) cartao = m[1].length === 4 ? `XXXX.XXXX.XXXX.${m[1]}` : m[1]
    }
    if (!vencimento && /vencimento/i.test(line)) {
      const m = line.match(/(\d{2}\/\d{2}\/\d{4})/)
      if (m) vencimento = m[1]
    }
    if (!totalFaturaDeclarado && /total\s+(?:desta|da)\s+fatura/i.test(line)) {
      const m = line.match(/R\$\s*([\d.]+,\d{2})/i)
      if (m) totalFaturaDeclarado = `R$ ${m[1]}`
    }

    // Linha com 5 colunas Santander
    const m = line.match(ROW)
    if (m) {
      const [, data, hist, vbS, vuS, cotS] = m
      const pm = hist.match(PARC)
      const parcela = pm ? pm[1] : undefined
      const descricao = hist.replace(PARC, '').trim()
      const valorBRL = parseFloat(vbS.replace(/\./g, '').replace(',', '.'))
      const valorUSD = parseFloat(vuS.replace(/\./g, '').replace(',', '.'))
      const cotacao = parseFloat(cotS.replace(',', '.'))

      if (!isNaN(valorBRL) && valorBRL !== 0) {
        txs.push({
          data,
          descricao,
          parcela,
          valorBRL,
          valorUSD: valorUSD !== 0 ? valorUSD : null,
          cotacao: cotacao !== 0 ? cotacao : null,
          categoria: classifyExpense(hist),
          portador: '',
          observacao: valorUSD !== 0 ? 'Internacional' : '',
          rawLine: line,
        })
      }
      continue
    }

    // Linha simples Santander (Data, Histórico, Valor)
    const ms = line.match(ROW_SIMPLE)
    if (ms) {
      const [, data, hist, vbS] = ms
      if (!/total|saldo|resumo|fatura/i.test(hist)) {
        const pm = hist.match(PARC)
        const parcela = pm ? pm[1] : undefined
        const descricao = hist.replace(PARC, '').trim()
        const valorBRL = parseFloat(vbS.replace(/\./g, '').replace(',', '.'))
        if (!isNaN(valorBRL) && valorBRL !== 0) {
          txs.push({
            data,
            descricao,
            parcela,
            valorBRL,
            valorUSD: null,
            cotacao: null,
            categoria: classifyExpense(hist),
            portador: '',
            observacao: '',
            rawLine: line,
          })
        }
      }
    }
  }

  let totalFaturaValor: number | undefined
  if (totalFaturaDeclarado) {
    const rawNum = totalFaturaDeclarado.replace(/[^\d,.-]/g, '').replace(',', '.')
    const parsed = parseFloat(rawNum)
    if (!isNaN(parsed)) totalFaturaValor = parsed
  }

  return {
    banco: 'Santander Empresas',
    cartao: cartao || 'XXXX.XXXX.XXXX.****',
    vencimento: vencimento || '',
    totalFaturaDeclarado,
    totalFaturaValor,
    transactions: txs,
    avisos: [],
  }
}

/**
 * Parser Itaú Empresas
 * Formatos reconhecidos:
 * 1. Nacional: DD/MM estabelecimento -?R$X,XX ou DD/MM estabelecimento -?R$ X,XX
 * 2. Internacional: DD/MM estabelecimento moedaLocal moedaGlobal cotação valorBRL
 *    Ex: 05/06 OPENAI *CHATGPT SUBSCR USD 20,00 US$ 20,00 R$ 5,42 R$ 108,40
 * 3. Portador: "NOME - FINAL 1234"
 * 4. Pula termos cadastrais, totais e rodapés
 */
export function parseItauInvoiceText(text: string): BankParsedInvoice {
  const NAT = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?)\s*R\$\s*([\d.]+,\d{2})\s*$/
  const NAT_NO_RS = /^(\d{2}\/\d{2})\s+(.+?)\s+([-]?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/
  const INTL =
    /^(\d{2}\/\d{2})\s+(.+?)\s+\w+[\d.,]+\s+US\$[\d.,]+\s+R\$([\d.,]+)\s+R\$([\d.,]+)\s*$/
  const PARC = /(\d{2}\/\d{2})\s*$/
  const SKIP =
    /^(Total|Saldo|Pagamento|Repasse|Lançamentos|data|Resumo|Produtos|Encargos|Mora|Taxa|Multa|CET|Juros|Valor|Fique|Rotativo|Compras|Parcelamento|Demais|Retirada|Em caso|SAC\b|Ouvidoria)/i
  const PORT = /^(.+?)\s*-\s*FINAL\s+(\d+)\s*$/i

  let cartao = ''
  let vencimento = ''
  let totalFaturaDeclarado = ''
  let portadorAtual = ''
  const txs: ParsedInvoiceTransaction[] = []

  const lines = text.split(/\r?\n/)

  // 1. Extrai metadados do cabeçalho
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (!cartao) {
      const m = line.match(/(\d{4}\.XXXX\.XXXX\.\d+)/i) || line.match(/cart[aã]o[:\s]+([\dX.*-]+)/i)
      if (m) cartao = m[1]
    }
    if (!vencimento) {
      const m =
        line.match(/vencimento:?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
        line.match(/^Fechada\s+(\d{2}\/\d{2}\/\d{4})/i) ||
        line.match(/vencimento\s+em\s+(\d{2}\/\d{2}\/\d{4})/i)
      if (m) vencimento = m[1]
    }
    if (!totalFaturaDeclarado) {
      const m =
        line.match(/Total\s+da\s+fatura\s+R\$\s*([\d.]+,\d{2})/i) ||
        line.match(/Total\s+desta\s+fatura\s+R\$\s*([\d.]+,\d{2})/i)
      if (m) totalFaturaDeclarado = `R$ ${m[1]}`
    }
  }

  // Fallback para vencimento em bloco separado
  if (!vencimento) {
    const vm =
      text.match(/vencimento:\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
      text.match(/Fechada\s+(\d{2}\/\d{2}\/\d{4})/i)
    if (vm) vencimento = vm[1]
  }

  // 2. Extrai transações linha a linha
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Rastreamento de portador (ex: "ANTONIO SERGIO EGYDIO RAMEH - FINAL 1234")
    const pm = line.match(PORT)
    if (pm) {
      const portadorNome = pm[1].replace(/ANTONIO SERGIO EGYDIO RAME?/i, 'A.S.E. Rameh').trim()
      portadorAtual = `${portadorNome} (${pm[2]})`
      continue
    }

    // Pula linhas informativas e rodapés
    if (SKIP.test(line)) continue
    if (line.length < 8) continue
    if (/^PAGAMENTO EFETUADO/i.test(line)) continue
    if (/^ANTONIO\b|^EPA ENG|^48\.045\./i.test(line)) continue
    if (/^Fechada|^01 junho|^agência|^fatura do/i.test(line)) continue

    // Internacional com cotação e valor
    const mi = line.match(INTL)
    if (mi) {
      const [, dt, desc, cotS, valS] = mi
      const cot = parseFloat(cotS.replace(',', '.'))
      const val = parseFloat(valS.replace(/\./g, '').replace(',', '.'))
      if (!isNaN(val) && val !== 0) {
        txs.push({
          data: dt,
          descricao: desc.trim(),
          parcela: undefined,
          valorBRL: val,
          valorUSD: cot > 0 ? Math.round((val / cot) * 100) / 100 : null,
          cotacao: cot > 0 ? cot : null,
          categoria: classifyExpense(desc),
          portador: portadorAtual || undefined,
          observacao: 'Internacional',
          rawLine: line,
        })
      }
      continue
    }

    // Nacional com R$ explícito
    const mn = line.match(NAT)
    if (mn) {
      const [, dt, rawDesc, neg, valS] = mn
      let desc = rawDesc.trim()
      let parcela: string | undefined
      const pp = desc.match(PARC)
      if (pp) {
        parcela = pp[1]
        desc = desc.substring(0, pp.index).trim()
      }
      const val = parseFloat(valS.replace(/\./g, '').replace(',', '.')) * (neg ? -1 : 1)
      if (!isNaN(val) && val !== 0) {
        txs.push({
          data: dt,
          descricao: desc,
          parcela,
          valorBRL: val,
          valorUSD: null,
          cotacao: null,
          categoria: classifyExpense(rawDesc),
          portador: portadorAtual || undefined,
          observacao: val < 0 ? 'Estorno' : '',
          rawLine: line,
        })
      }
      continue
    }

    // Nacional sem R$ mas com formato DD/MM descrição valor
    const ms = line.match(NAT_NO_RS)
    if (ms) {
      const [, dt, rawDesc, valS] = ms
      if (!SKIP.test(rawDesc)) {
        let desc = rawDesc.trim()
        let parcela: string | undefined
        const pp = desc.match(PARC)
        if (pp) {
          parcela = pp[1]
          desc = desc.substring(0, pp.index).trim()
        }
        const val = parseFloat(valS.replace(/\./g, '').replace(',', '.'))
        if (!isNaN(val) && val !== 0) {
          txs.push({
            data: dt,
            descricao: desc,
            parcela,
            valorBRL: val,
            valorUSD: null,
            cotacao: null,
            categoria: classifyExpense(rawDesc),
            portador: portadorAtual || undefined,
            observacao: val < 0 ? 'Estorno' : '',
            rawLine: line,
          })
        }
      }
    }
  }

  let totalFaturaValor: number | undefined
  if (totalFaturaDeclarado) {
    const rawNum = totalFaturaDeclarado.replace(/[^\d,.-]/g, '').replace(',', '.')
    const parsed = parseFloat(rawNum)
    if (!isNaN(parsed)) totalFaturaValor = parsed
  }

  return {
    banco: 'Itaú Empresas',
    cartao: cartao || 'XXXX.XXXX.XXXX.****',
    vencimento: vencimento || '',
    totalFaturaDeclarado,
    totalFaturaValor,
    transactions: txs,
    avisos: [],
  }
}

/**
 * Parser Genérico / Misto
 */
export function parseGenericInvoiceText(text: string): BankParsedInvoice {
  const santander = parseSantanderInvoiceText(text)
  if (santander.transactions.length >= 3) {
    return santander
  }

  const itau = parseItauInvoiceText(text)
  if (itau.transactions.length >= 3) {
    return itau
  }

  // Se nenhum dos dois específicos teve sucesso suficiente, retorna o que obteve mais
  if (
    santander.transactions.length >= itau.transactions.length &&
    santander.transactions.length > 0
  ) {
    santander.banco = 'Genérico'
    return santander
  }

  itau.banco = 'Genérico'
  return itau
}

/**
 * Função principal isolada para processamento de texto de fatura
 */
export function parseInvoiceByBank(text: string): BankParsedInvoice {
  const bank = detectBankFromText(text)
  if (bank === 'santander') {
    return parseSantanderInvoiceText(text)
  }
  if (bank === 'itau') {
    return parseItauInvoiceText(text)
  }
  return parseGenericInvoiceText(text)
}
