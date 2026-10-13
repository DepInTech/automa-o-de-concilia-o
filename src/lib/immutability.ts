/**
 * Utilitários de Imutabilidade Financeira e Integridade de Dados
 * Grupo EPA - Proteção absoluta contra mutação de dados contábeis e bancários
 */

/**
 * Congela profundamente um objeto ou array recursivamente,
 * tornando todas as suas propriedades estritamente somente-leitura em runtime.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // Já congelado ou primitivo
  if (Object.isFrozen(obj)) {
    return obj as Readonly<T>
  }

  // Congela primeiro as propriedades internas
  const propNames = Object.getOwnPropertyNames(obj) as (keyof T)[]
  for (const name of propNames) {
    const value = obj[name]
    if (value !== null && typeof value === 'object') {
      deepFreeze(value)
    }
  }

  return Object.freeze(obj)
}

/**
 * Cria uma cópia defensiva profunda antes de congelar,
 * garantindo que referências compartilhadas externas não possam alterar o estado interno.
 */
export function cloneAndFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  const cloned = structuredClone(obj)
  return deepFreeze(cloned)
}

/**
 * Cria uma cópia defensiva profunda de um array e congela cada item e o array em si.
 */
export function cloneAndFreezeArray<T>(arr: readonly T[]): readonly Readonly<T>[] {
  const cloned = arr.map((item) =>
    typeof item === 'object' && item !== null ? structuredClone(item) : item,
  )
  return deepFreeze(cloned) as readonly Readonly<T>[]
}

/**
 * Realiza cálculos em centavos inteiros para evitar qualquer imprecisão
 * de ponto flutuante do padrão IEEE 754.
 */
export function roundToCents(val: number): number {
  if (isNaN(val)) return 0
  return Math.round(val * 100) / 100
}

/**
 * Converte valor em reais para centavos inteiros (ex: R$ 12,34 -> 1234)
 */
export function toIntegerCents(val: number): number {
  if (isNaN(val)) return 0
  return Math.round(val * 100)
}

/**
 * Converte centavos inteiros de volta para reais com precisão de 2 casas
 */
export function fromIntegerCents(cents: number): number {
  return Math.round(cents) / 100
}

/**
 * Calcula a diferença estrita: Fatura − Odoo em centavos inteiros
 */
export function computeStrictDifference(cardVal: number, sysVal: number): number {
  const cardCents = toIntegerCents(cardVal)
  const sysCents = toIntegerCents(sysVal)
  return fromIntegerCents(cardCents - sysCents)
}
