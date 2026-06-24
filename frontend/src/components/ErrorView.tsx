interface ErrorViewProps {
  message: string | null
  retries: number
  onReset: () => void
}

export function ErrorView({ message, retries, onReset }: ErrorViewProps) {
  const isUpstreamBusy =
    message?.includes('[Gemini Service Unavailable]') === true || retries >= 3

  return (
    <div className="flex flex-col gap-0">

      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <span className="text-xs font-mono text-white/50 tracking-tight uppercase">
          error_log
        </span>
        <span className="text-xs font-mono text-white/30 tracking-tight">
          ATTEMPT: {retries.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="border border-white/10 rounded-2xl p-8 min-h-[260px] flex flex-col justify-between gap-6">
        <div className="flex flex-col gap-4">

          {/* Error message */}
          <p className="text-sm font-mono text-white/80 tracking-tight leading-relaxed">
            {message ?? 'something went wrong.'}
          </p>

          {/* Upstream busy advisory — shown when Gemini is overloaded or retries >= 3 */}
          {isUpstreamBusy && (
            <div className="border border-white/10 rounded-xl p-4 bg-white/5">
              <p className="text-xs font-sans font-semibold text-accent uppercase tracking-wider mb-1">
                Rate-Limit Backoff Suggested
              </p>
              <p className="text-xs font-mono text-white/60 leading-relaxed">
                The upstream AI core is under heavy load. Wait 3–5 minutes before retrying — your file and job description are still loaded.
              </p>
            </div>
          )}

        </div>

        {/* Action button — inputs persist on click, no re-upload needed */}
        <button
          onClick={onReset}
          className="self-start flex items-center gap-2 bg-accent text-workspace text-sm font-mono
                     tracking-tight px-6 py-2.5 rounded-full hover:bg-white transition-colors"
        >
          return & adjust inputs
        </button>

      </div>

    </div>
  )
}