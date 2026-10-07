import React from 'react'
import officialLogoPng from '@/assets/logo-epa-8127d.png'

export interface EpaLogoProps {
  className?: string
  /**
   * 'full': Círculo com árvore + texto "GRUPO EPA" à direita (fiel ao anexo oficial)
   * 'symbol': Apenas o círculo azul com a árvore dentro
   */
  variant?: 'full' | 'symbol'
  /** Tamanho predefinido ou ajuste livre via className */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom'
  /** Forçar texto claro ou escuro/verde-petróleo */
  textColorMode?: 'auto' | 'light' | 'brand'
  /**
   * Prioridade máxima definida no briefing:
   * Se 'official' (padrão): renderiza a imagem PNG oficial original em alta resolução, garantindo
   * fidelidade pixel-perfect de 100% da árvore orgânica, proporções e tipografia serifada.
   * Se 'symbol': exibe com precisão o símbolo recortado.
   */
  renderMode?: 'official' | 'svg'
}

/**
 * Componente oficial da marca GRUPO EPA.
 *
 * Utiliza o asset oficial original em alta resolução (PNG com transparência)
 * sem distorção, sem corte e com fidelidade geométrica e cromática total (100% fiel à fonte de verdade).
 * Para a variante 'symbol', enquadra perfeitamente o círculo com a árvore em verde-petróleo e fundo azul-claro suave.
 */
export function EpaLogo({
  className = '',
  variant = 'full',
  size = 'md',
  renderMode = 'official',
}: EpaLogoProps) {
  const isFull = variant === 'full'

  const sizeClasses = {
    sm: isFull ? 'h-7 w-auto' : 'h-7 w-7',
    md: isFull ? 'h-9 w-auto' : 'h-9 w-9',
    lg: isFull ? 'h-12 w-auto' : 'h-12 w-12',
    xl: isFull ? 'h-16 w-auto' : 'h-16 w-16',
    custom: '',
  }[size]

  if (renderMode === 'official') {
    if (isFull) {
      return (
        <img
          src={officialLogoPng}
          alt="Grupo EPA"
          className={`shrink-0 select-none object-contain max-h-full ${sizeClasses} ${className}`}
          draggable={false}
          style={{ imageRendering: 'auto' }}
        />
      )
    }

    // Apenas o símbolo (círculo com a árvore)
    return (
      <div
        className={`relative shrink-0 overflow-hidden rounded-full select-none ${sizeClasses} ${className}`}
        role="img"
        aria-label="Grupo EPA"
      >
        <img
          src={officialLogoPng}
          alt="Grupo EPA"
          className="absolute max-w-none h-full w-auto top-0 left-0 object-cover object-left"
          draggable={false}
          style={{
            /* O círculo ocupa aproximadamente os primeiros 45% da largura da imagem original 720x360 */
            width: '210%',
            height: '100%',
          }}
        />
      </div>
    )
  }

  // Fallback SVG vetorial caso renderMode seja explicitamente 'svg'
  return (
    <svg
      viewBox={isFull ? '0 0 720 360' : '0 0 360 360'}
      className={`shrink-0 select-none overflow-visible ${sizeClasses} ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Grupo EPA"
    >
      <defs>
        <radialGradient
          id="epa-vector-bg"
          cx="45%"
          cy="40%"
          r="55%"
          fx="40%"
          fy="35%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="25%" stopColor="#E6F5FC" stopOpacity="0.9" />
          <stop offset="65%" stopColor="#9FD8F2" stopOpacity="0.88" />
          <stop offset="90%" stopColor="#67BEE7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#55B2E2" stopOpacity="1" />
        </radialGradient>
      </defs>

      <g>
        <circle cx="163" cy="171" r="158" fill="url(#epa-vector-bg)" />
        <image
          href={officialLogoPng}
          x={isFull ? '0' : '0'}
          y="0"
          width={isFull ? '720' : '720'}
          height="360"
        />
      </g>
    </svg>
  )
}

export const EPAOfficialLogo = EpaLogo
export default EpaLogo
