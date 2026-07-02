import { cn } from '@/lib/utils'

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-white/20 py-6", className)}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-gray-500">
          Powered by{' '}
          <a
            href="https://Hotbotstudios.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            HotBot Studios
          </a>
        </p>
      </div>
    </footer>
  )
}
