import React from 'react'
import epaLogoUrl from '@/assets/logo-epa-c53f6.png'

interface EpaLogoProps {
  className?: string
  variant?: 'full' | 'symbol' | 'dark' | 'light'
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Componente oficial da Logo Grupo EPA:
 * Utiliza o arquivo oficial anexado com fallback de SVG vetorial estilizado
 * (árvore estilizada em verde petróleo dentro de um círculo azul-claro, com os textos "GRUPO" e "EPA").
 */
export function EpaLogo({ className = '', variant = 'full', size = 'md' }: EpaLogoProps) {
  const [imgError, setImgError] = React.useState(false)

  const sizeClasses = {
    sm: 'h-8',
    md: 'h-10',
    lg: 'h-14',
  }[size]

  if (!imgError && epaLogoUrl) {
    return (
      <div className={`flex items-center gap-2 select-none ${className}`}>
        <img
          src={epaLogoUrl}
          alt="Grupo EPA - Soluções em Engenharia e Meio Ambiente"
          className={`${sizeClasses} w-auto object-contain transition-transform`}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  // Fallback SVG fiel à especificação
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <svg
        viewBox="0 0 100 100"
        className={`${sizeClasses} w-auto aspect-square`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="epaCircleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#CBEBF6" />
            <stop offset="100%" stopColor="#87CEEB" />
          </linearGradient>
        </defs>
        {/* Círculo azul-claro */}
        <circle cx="50" cy="50" r="48" fill="url(#epaCircleGrad)" />
        {/* Árvore estilizada verde petróleo (#006B67) */}
        <g fill="#006B67">
          {/* Tronco */}
          <path d="M47 90 H53 V66 C53 66 58 60 62 55 L58 53 C55 58 52 61 50 63 C48 61 45 58 42 53 L38 55 C42 60 47 66 47 66 Z" />
          {/* Copa da árvore estilizada */}
          <path d="M22 60 C18 58 14 53 16 48 C18 43 23 44 26 46 C24 39 28 32 35 33 C37 27 43 23 50 23 C57 23 63 27 65 33 C72 32 76 39 74 46 C77 44 82 43 84 48 C86 53 82 58 78 60 C81 64 78 70 72 71 C67 72 63 69 61 67 C58 71 52 72 50 72 C48 72 42 71 39 67 C37 69 33 72 28 71 C22 70 19 64 22 60 Z" />
        </g>
      </svg>
      {variant !== 'symbol' && (
        <div className="flex flex-col leading-none">
          <span className="text-[11px] tracking-[0.22em] font-semibold text-[#006B67] dark:text-[#20C9A6] uppercase">
            GRUPO
          </span>
          <span className="text-xl font-black tracking-tight text-[#006B67] dark:text-[#F1F5F4] -mt-0.5">
            EPA
          </span>
        </div>
      )}
    </div>
  )
}
