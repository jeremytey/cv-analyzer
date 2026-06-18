interface ErrorViewProps {
  message: string | null
  onReset: () => void
}

export function ErrorView({ message, onReset }: ErrorViewProps) {
  return (
    <div className="flex flex-col gap-0">

      <div className="mb-6">
        <span className="text-xs font-mono text-white/50 tracking-tight uppercase">
          error
        </span>
      </div>

      <div className="border border-white/10 rounded-2xl p-8 min-h-[260px] flex flex-col justify-between">
        <div>
          <p className="text-sm font-mono text-white/80 tracking-tight leading-relaxed">
            {message ?? 'something went wrong.'}
          </p>
        </div>

        <button
          onClick={onReset}
          className="mt-8 self-start flex items-center gap-2 bg-accent text-workspace text-sm font-mono
                     tracking-tight px-6 py-2.5 rounded-full hover:bg-white transition-colors"
        >
          try again
        </button>
      </div>

    </div>
  )
}