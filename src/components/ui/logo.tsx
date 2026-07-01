import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: { container: 'h-8 w-8', img: 32 },
  md: { container: 'h-11 w-11', img: 44 },
  lg: { container: 'h-14 w-14', img: 56 },
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <div className={`flex ${s.container} items-center justify-center rounded-xl bg-indigo-500/90 shadow-lg shadow-indigo-500/20 overflow-hidden ${className}`}>
      <Image
        src="/sabudh-logo.png"
        alt="Sabudh AI"
        width={s.img}
        height={s.img}
        className="object-contain p-1"
      />
    </div>
  )
}

export function LogoWithText({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <Logo size={size} />
      <span className={`font-bold text-gray-900 ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
        Sabudh AI
      </span>
    </div>
  )
}
