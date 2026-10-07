import React from 'react'

interface EpaLogoProps {
  className?: string
  variant?: 'full' | 'symbol'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Componente oficial e vetorizado da marca GRUPO EPA:
 * Desenho vetorial em SVG da árvore estilizada em tons verde petróleo/turquesa
 * dentro de um anel/círculo com fundo transparente (sem fundo branco),
 * garantindo nitidez e proporcionalidade perfeitas em temas claros e escuros.
 */
export function EpaLogo({ className = '', variant = 'full', size = 'md' }: EpaLogoProps) {
  const sizeMap = {
    sm: { box: 'h-8', icon: 32 },
    md: { box: 'h-10', icon: 40 },
    lg: { box: 'h-14', icon: 56 },
  }[size]

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Símbolo Vetorial (Árvore Estilizada dentro do Círculo) */}
      <svg
        viewBox="0 0 100 100"
        className={`${sizeMap.box} w-auto aspect-square shrink-0`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Gradiente sutil para o anel externo */}
          <linearGradient id="epaRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#20C9A6" />
            <stop offset="100%" stopColor="#008F83" />
          </linearGradient>

          {/* Gradiente da copa da árvore estilizada */}
          <linearGradient id="epaTreeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#20C9A6" />
            <stop offset="50%" stopColor="#00A896" />
            <stop offset="100%" stopColor="#006B67" />
          </linearGradient>

          {/* Gradiente para o tronco */}
          <linearGradient id="epaTrunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#008F83" />
            <stop offset="100%" stopColor="#004D4A" />
          </linearGradient>
        </defs>

        {/* Anel Externo Vetorial (fundo transparente, sem fundo branco) */}
        <circle
          cx="50"
          cy="50"
          r="46"
          stroke="url(#epaRingGrad)"
          strokeWidth="3.5"
          className="opacity-90"
        />

        {/* Círculo de fundo translúcido suave (mantém transparência e harmonia com qualquer fundo) */}
        <circle
          cx="50"
          cy="50"
          r="43"
          fill="#008F83"
          className="fill-[#008F83]/10 dark:fill-[#20C9A6]/15"
        />

        {/* Copa da árvore estilizada (nuvem de folhas / sustentabilidade ambiental) */}
        <g fill="url(#epaTreeGrad)">
          {/* Camada base da copa */}
          <path
            d="M 50 18
               C 56 18, 62 21, 65 26
               C 72 26, 78 31, 79 38
               C 84 41, 87 47, 86 53
               C 85 59, 81 64, 76 66
               C 72 71, 66 73, 60 72
               C 57 74, 53 75, 50 75
               C 47 75, 43 74, 40 72
               C 34 73, 28 71, 24 66
               C 19 64, 15 59, 14 53
               C 13 47, 16 41, 21 38
               C 22 31, 28 26, 35 26
               C 38 21, 44 18, 50 18 Z"
          />

          {/* Detalhe interno iluminado / folhas centrais */}
          <path
            d="M 50 25
               C 58 25, 64 30, 65 37
               C 70 40, 73 46, 70 52
               C 67 58, 61 60, 56 59
               C 53 62, 47 62, 44 59
               C 39 60, 33 58, 30 52
               C 27 46, 30 40, 35 37
               C 36 30, 42 25, 50 25 Z"
            fill="#20C9A6"
            className="opacity-40 dark:opacity-60"
          />
        </g>

        {/* Tronco e raízes estilizados */}
        <g fill="url(#epaTrunkGrad)">
          {/* Tronco principal se abrindo para os galhos */}
          <path
            d="M 47 84
               C 47 78, 48 72, 48 64
               C 46 62, 43 59, 39 57
               C 41 55, 45 56, 48 59
               C 48.5 53, 49 48, 50 45
               C 51 48, 51.5 53, 52 59
               C 55 56, 59 55, 61 57
               C 57 59, 54 62, 52 64
               C 52 72, 53 78, 53 84
               C 56 85, 60 86, 63 87
               L 62 89
               C 57 88, 53 87, 50 87
               C 47 87, 43 88, 38 89
               L 37 87
               C 40 86, 44 85, 47 84 Z"
          />
        </g>
      </svg>

      {/* Tipografia da Marca GRUPO EPA */}
      {variant !== 'symbol' && (
        <div className="flex flex-col leading-none">
          <span className="text-[10px] tracking-[0.24em] font-semibold text-[#20C9A6] uppercase">
            GRUPO
          </span>
          <span className="text-xl font-black tracking-tight text-white drop-shadow-sm -mt-0.5">
            EPA
          </span>
        </div>
      )}
    </div>
  )
}
