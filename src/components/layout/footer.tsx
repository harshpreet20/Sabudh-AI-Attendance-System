export function Footer() {
  return (
    <footer className="border-t border-white/20 py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-gray-500">
          Program Developed by{' '}
          <span className="font-medium text-gray-700">Sabudh Foundation</span>
          {' '}and Marketed by{' '}
          <a
            href="https://Hotbotstudios.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
          >
            HotBot Studios LLP
          </a>
        </p>
      </div>
    </footer>
  )
}
