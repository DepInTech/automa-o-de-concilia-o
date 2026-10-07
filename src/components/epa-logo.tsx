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
 * 100% SVG vetorial inline transparente (sem fundo branco em caixa), reproduzindo fielmente:
 * 1. Círculo à esquerda com gradiente radial azul-claro oficial
 *    (centro luminoso quase branco #EBF8FD desbotando suavemente para azul-celeste nas bordas #7DC3E6).
 * 2. Silhueta precisa e detalhada da ÁRVORE frondosa em verde-petróleo (#0D726D / #137771),
 *    com copa densa multilobada e tronco que se divide em raízes abertas na base do círculo.
 * 3. À direita do círculo (na variante 'full'):
 *    - "GRUPO": maiúsculas, letter-spacing amplo, elegante e proporcional.
 *    - "EPA": maiúsculas dominantes com serifas e proporções fiéis ao logotipo oficial.
 * 4. Adaptabilidade a fundos escuros (ex: sidebar) e claros com contraste e legibilidade ideais.
 */
export function EpaLogo({
  className = '',
  variant = 'full',
  size = 'md',
  textColorMode = 'auto',
}: EpaLogoProps) {
  const isFull = variant === 'full'

  const sizeStyles = {
    sm: isFull ? 'h-8' : 'h-8 w-8',
    md: isFull ? 'h-10' : 'h-10 w-10',
    lg: isFull ? 'h-12' : 'h-12 w-12',
    xl: isFull ? 'h-16' : 'h-16 w-16',
  }[size]

  // Cores do texto
  // - auto: usa classe CSS para tema claro (#0D726D) e tema escuro (#20C9A6)
  // - brand: sempre tom verde petróleo oficial (#0D726D)
  // - light: tom turquesa brilhante de alta visibilidade em superfícies escuras (#20C9A6)
  const textClass =
    textColorMode === 'brand'
      ? 'fill-[#0D726D]'
      : textColorMode === 'light'
        ? 'fill-[#20C9A6]'
        : 'fill-[#0D726D] dark:fill-[#20C9A6]'

  // IDs para gradientes e clipPath locais
  const radialGradId = 'epa-brand-radial-bg'
  const circleClipId = 'epa-brand-circle-clip'

  return (
    <svg
      viewBox={isFull ? '0 0 720 360' : '0 0 360 360'}
      className={`shrink-0 select-none overflow-visible ${sizeStyles} ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Grupo EPA"
    >
      <defs>
        {/* Gradiente radial azul do círculo: iluminação suave no centro superior desbotando para as bordas */}
        <radialGradient
          id={radialGradId}
          cx="42%"
          cy="38%"
          r="58%"
          fx="38%"
          fy="32%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#EBF8FD" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#A8DCF2" stopOpacity="0.88" />
          <stop offset="88%" stopColor="#78C0E6" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#64B6E1" stopOpacity="1" />
        </radialGradient>

        {/* Clip-path perfeitamente circular para cortar o tronco e galhos nos limites do círculo */}
        <clipPath id={circleClipId}>
          <circle cx="170" cy="180" r="162" />
        </clipPath>
      </defs>

      {/* SÍMBOLO: CÍRCULO COM ÁRVORE */}
      <g>
        {/* Círculo com gradiente radial azul oficial */}
        <circle cx="170" cy="180" r="162" fill={`url(#${radialGradId})`} />

        {/* Contorno sutil para definição em qualquer fundo */}
        <circle
          cx="170"
          cy="180"
          r="162"
          stroke="#68B9E3"
          strokeWidth="1.2"
          strokeOpacity="0.8"
        />

        {/* Árvore vetorial oficial em verde-petróleo (#0D726D) */}
        <g clipPath={`url(#${circleClipId})`}>
          {/* Tronco principal, raízes na base e ramificações que sustentam a copa */}
          <path
            fill="#0D726D"
            fillRule="evenodd"
            d={`
              M 112 342
              C 126 312 142 278 152 248
              C 142 240 126 226 112 214
              C 118 208 128 214 138 222
              C 148 230 156 236 160 226
              C 162 208 162 186 164 165
              C 168 165 174 165 178 165
              C 180 186 180 208 182 226
              C 186 236 194 230 204 222
              C 214 214 224 208 230 214
              C 216 226 200 240 190 248
              C 200 278 216 312 230 342
              C 210 342 195 330 171 306
              C 147 330 132 342 112 342 Z

              M 171 270
              C 166 250 162 232 171 216
              C 180 232 176 250 171 270 Z
            `}
          />

          {/* Copa frondosa multilobada da árvore */}
          <path
            fill="#0D726D"
            d={`
              M 166 60
              C 182 58 198 62 208 72
              C 220 66 235 68 245 78
              C 256 74 270 80 276 92
              C 286 94 294 104 292 116
              C 300 122 306 134 300 146
              C 308 154 308 168 300 176
              C 306 184 304 196 295 204
              C 298 212 294 222 284 228
              C 278 234 268 234 260 228
              C 255 236 244 240 234 236
              C 225 240 212 238 206 230
              C 198 236 186 234 180 226
              C 174 232 162 232 156 226
              C 150 234 138 236 130 230
              C 124 238 111 240 102 236
              C 92 240 81 236 76 228
              C 68 234 58 234 52 228
              C 42 222 38 212 41 204
              C 32 196 30 184 36 176
              C 28 168 28 154 36 146
              C 30 134 36 122 44 116
              C 42 104 50 94 60 92
              C 66 80 80 74 91 78
              C 101 68 116 66 128 72
              C 138 62 154 58 166 60 Z
            `}
          />

          {/* Recortes internos e detalhes que dão o aspecto natural e orgânico da folhagem */}
          <path
            fill={`url(#${radialGradId})`}
            d={`
              M 88 150
              C 84 140 92 134 98 138
              C 104 142 98 154 88 150 Z

              M 248 150
              C 258 154 252 142 244 138
              C 238 134 242 140 248 150 Z

              M 112 184
              C 106 178 114 170 120 174
              C 124 178 120 186 112 184 Z

              M 224 184
              C 232 186 228 178 222 174
              C 216 170 220 178 224 184 Z
            `}
          />
        </g>
      </g>

      {/* TIPOGRAFIA OFICIAL: GRUPO EPA (exibida na variante 'full') */}
      {isFull && (
        <g className={textClass} style={{ transition: 'fill 0.2s ease' }}>
          {/* GRUPO (linha de cima: maiúsculas, letter-spacing amplo, proporção elegante) */}
          <text
            x="385"
            y="114"
            fontFamily="'Cinzel', 'Trajan Pro', 'Didot', 'Georgia', 'Times New Roman', serif"
            fontSize="54"
            fontWeight="600"
            letterSpacing="0.28em"
          >
            GRUPO
          </text>

          {/* EPA (linha de baixo: maiúsculas dominantes com serifas e porte imponente) */}
          <g
            fontFamily="'Cinzel', 'Trajan Pro', 'Didot', 'Georgia', 'Times New Roman', serif"
            fontWeight="700"
            fontSize="188"
            letterSpacing="0.02em"
          >
            <text x="375" y="292">
              EPA
            </text>
          </g>
        </g>
      )}
    </svg>
  )
}

export default EpaLogo
