import React from 'react'

export interface EpaLogoProps {
  className?: string
  /**
   * 'full': Círculo com árvore + texto "GRUPO EPA" à direita (fiel ao anexo oficial)
   * 'symbol': Apenas o círculo azul com a árvore dentro
   */
  variant?: 'full' | 'symbol'
  /** Tamanho predefinido ou ajuste livre via className */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Forçar texto claro (para contextos com fundo escuro) ou escuro/teal (fundo claro) */
  textColorMode?: 'auto' | 'light' | 'brand'
}

/**
 * Componente oficial vetorizado da marca GRUPO EPA.
 *
 * Reproduz fielmente a logo oficial:
 * 1. Círculo com gradiente radial azul-claro (centro suave #EAF7FC / #CFEBF7 desbotando para #7EC4E7 / #6CBEE4 nas bordas).
 * 2. Silhueta precisa e recortada da árvore frondosa em verde-petróleo (#1D7A74 / #176B66),
 *    com copa densa multilobada e tronco que se abre na base.
 * 3. À direita do círculo (na variante 'full'):
 *    - Linha superior: "GRUPO" com tracking amplo e serifa sutil clássica da identidade.
 *    - Linha inferior: "EPA" em proporção dominante, com serifas suaves e elegantes.
 *
 * 100% SVG vetorial inline transparente (sem caixa branca externa), adaptável a temas claros e escuros.
 */
export function EpaLogo({
  className = '',
  variant = 'full',
  size = 'md',
  textColorMode = 'auto',
}: EpaLogoProps) {
  // Proporções:
  // - Símbolo (círculo): 200 x 200 (1:1)
  // - Full (círculo + texto): 520 x 200 (~2.6:1)
  const isFull = variant === 'full'

  const sizeStyles = {
    sm: isFull ? 'h-8' : 'h-8 w-8',
    md: isFull ? 'h-10' : 'h-10 w-10',
    lg: isFull ? 'h-12' : 'h-12 w-12',
    xl: isFull ? 'h-16' : 'h-16 w-16',
  }[size]

  // IDs únicos para gradientes locais (evita colisão de IDs se renderizado múltiplas vezes)
  const idPrefix = 'epa-brand'
  const radialGradId = `${idPrefix}-bg-radial`

  // Cores do texto
  // - auto: usa classe CSS para tema claro (#1D7A74) e tema escuro (#31C2A5 / #55D4BB para máxima legibilidade na sidebar verde-escura)
  // - brand: sempre #1D7A74 (verde-petróleo oficial)
  // - light: sempre tom claro (#3CD1B5)
  const textClass =
    textColorMode === 'brand'
      ? 'fill-[#1D7A74]'
      : textColorMode === 'light'
        ? 'fill-[#3CD1B5]'
        : 'fill-[#1D7A74] dark:fill-[#2FD6B4]'

  return (
    <svg
      viewBox={isFull ? '0 0 520 200' : '0 0 200 200'}
      className={`shrink-0 select-none overflow-visible ${sizeStyles} ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Grupo EPA"
    >
      <defs>
        {/* Gradiente radial azul do círculo: centro luminoso suave desbotando para as bordas */}
        <radialGradient id={radialGradId} cx="46%" cy="42%" r="54%" fx="42%" fy="38%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="28%" stopColor="#EAF7FC" stopOpacity="0.9" />
          <stop offset="68%" stopColor="#AEE0F5" stopOpacity="0.85" />
          <stop offset="92%" stopColor="#80C8EC" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#67BEE7" stopOpacity="0.98" />
        </radialGradient>

        {/* Clip path para manter o corte perfeito da base do tronco e galhos no círculo */}
        <clipPath id={`${idPrefix}-circle-clip`}>
          <circle cx="100" cy="100" r="92" />
        </clipPath>
      </defs>

      {/* SÍMBOLO: CÍRCULO COM ÁRVORE */}
      <g>
        {/* Círculo com gradiente radial azul-claro oficial */}
        <circle cx="100" cy="100" r="92" fill={`url(#${radialGradId})`} />

        {/* Borda ultrafina sutil no contorno para reforçar definição */}
        <circle cx="100" cy="100" r="92" stroke="#7BBEE0" strokeWidth="0.8" strokeOpacity="0.7" />

        {/* Silhueta da Árvore Oficial em verde-petróleo */}
        <g clipPath={`url(#${idPrefix}-circle-clip)`}>
          <path
            fill="#1D7A74"
            fillRule="evenodd"
            d={`
              M 95 192
              C 84 191 74 186 64 179
              C 71 169 77 156 80 142
              C 76 138 72 131 66 123
              C 62 128 58 132 54 135
              C 48 139 42 139 37 135
              C 33 131 32 125 35 120
              C 30 120 25 117 23 113
              C 21 108 22 102 26 98
              C 23 96 21 92 22 88
              C 23 83 27 79 32 77
              C 30 73 30 68 33 64
              C 36 60 41 58 46 58
              C 46 53 49 48 54 45
              C 60 42 67 43 72 47
              C 75 43 80 40 85 39
              C 92 37 99 39 104 43
              C 108 40 114 38 120 38
              C 127 38 133 42 137 47
              C 142 45 148 45 153 48
              C 159 52 162 58 161 65
              C 167 67 172 72 173 78
              C 174 84 171 90 166 94
              C 170 98 171 104 169 110
              C 166 116 160 120 154 121
              C 155 126 153 132 148 136
              C 143 140 136 140 130 137
              C 126 135 123 131 121 127
              C 116 133 112 139 108 143
              C 111 156 117 169 125 179
              C 115 186 105 191 95 192 Z

              M 90 148
              C 87 141 84 133 82 124
              C 89 122 95 122 102 122
              C 105 131 103 141 99 148
              C 96 148 93 148 90 148 Z
            `}
          />
        </g>
      </g>

      {/* TIPOGRAFIA OFICIAL: GRUPO EPA (exibida na variante 'full') */}
      {isFull && (
        <g className={textClass} style={{ transition: 'fill 0.2s ease' }}>
          {/* GRUPO (linha de cima, tracking amplo, elegante e proporcional) */}
          <text
            x="222"
            y="64"
            fontFamily="'Cinzel', 'Trajan Pro', 'Baskerville', 'Times New Roman', serif"
            fontSize="34"
            fontWeight="500"
            letterSpacing="0.32em"
          >
            GRUPO
          </text>

          {/* EPA (linha de baixo, letras maiúsculas grandes, dominantes) */}
          <g
            fontFamily="'Cinzel', 'Trajan Pro', 'Baskerville', 'Times New Roman', serif"
            fontWeight="600"
            fontSize="122"
            letterSpacing="0.04em"
          >
            <text x="216" y="172">
              EPA
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}

export default EpaLogo
