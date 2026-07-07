import Image from 'next/image'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: { container: 'h-[100px] w-[100px]', img: 100 },
  md: { container: 'h-[120px] w-[120px]', img: 120 },
  lg: { container: 'h-[140px] w-[140px]', img: 140 },
}

export function Logo({ size = 'md', className = '' }: LogoProps) {
  const s = sizes[size]
  return (
    <div className={`flex ${s.container} items-center justify-center overflow-hidden shrink-0 ${className}`}>
      <Image
        src="/sabudh-logo-transparent.png"
        alt="Sabudh AI"
        width={s.img}
        height={s.img}
        className="object-contain"
      />
    </div>
  )
}

export function LogoWithText({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className="inline-flex items-center gap-3">
      <Logo size={size} />
      <div className="flex flex-col">
        <span className={`font-bold text-gray-900 leading-tight ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
          Sabudh AI
        </span>
        <span className="text-[10px] font-medium text-gray-400 tracking-wide">
          Powered by HotBot Studios
        </span>
      </div>
    </div>
  )
}
