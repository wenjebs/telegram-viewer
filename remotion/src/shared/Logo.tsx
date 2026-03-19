import type { CSSProperties } from 'react'

interface LogoProps {
  size?: number
  bracketColor?: string
  bracketOpacity?: number
  bracketScale?: number
  dotColor?: string
  dotOpacity?: number
  style?: CSSProperties
}

export const Logo: React.FC<LogoProps> = ({
  size = 80,
  bracketColor = '#ffffff',
  bracketOpacity = 1,
  bracketScale = 1,
  dotColor = '#ffffff',
  dotOpacity = 1,
  style,
}) => {
  const outerRadius = size * 0.2
  const innerSize = size * 0.625
  const innerRadius = innerSize * 0.2
  const innerOffset = (size - innerSize * bracketScale) / 2
  const dotSize = size * 0.05

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={style}
    >
      {/* Outer rounded square background */}
      <rect
        width={size}
        height={size}
        rx={outerRadius}
        fill="#000000"
      />
      {/* Inner viewfinder bracket */}
      <rect
        x={innerOffset}
        y={innerOffset}
        width={innerSize * bracketScale}
        height={innerSize * bracketScale}
        rx={innerRadius * bracketScale}
        fill="none"
        stroke={bracketColor}
        strokeWidth={size * 0.03}
        opacity={bracketOpacity}
      />
      {/* Center focus dot */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={dotSize}
        fill={dotColor}
        opacity={dotOpacity}
      />
    </svg>
  )
}
