export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
    xl: 'w-12 h-12 border-3',
  }
  return (
    <div className={`${sizes[size]} border-current border-t-transparent rounded-full animate-spin ${className}`} />
  )
}

export function LoadingOverlay({ message = 'Loading...' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 shadow-xl flex flex-col items-center gap-3">
        <Spinner size="lg" className="text-blue-600" />
        <div className="text-sm text-neutral-600 dark:text-neutral-400">{message}</div>
      </div>
    </div>
  )
}

export function ButtonSpinner() {
  return <Spinner size="sm" className="text-white" />
}

