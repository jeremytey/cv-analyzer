import { useEffect, useState } from 'react'

const STAGES = [
  'extracting cv text...',
  'parsing job description...',
  'identifying keyword gaps...',
  'generating rewrites...',
  'finalizing score...',
]

export function ProcessingView() {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStageIndex((prev) => {
        if (prev < STAGES.length - 1) return prev + 1
        clearInterval(interval)
        return prev
      })
    }, 2200)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col gap-0">

      {/* Top label */}
      <div className="mb-6">
        <span className="text-xs font-mono text-white/50 tracking-tight uppercase">
          processing
        </span>
      </div>

      {/* Stage display */}
      <div className="border border-white/10 rounded-2xl p-8 min-h-[260px] flex flex-col justify-between">

        <div className="flex flex-col gap-3">
          {STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center gap-3">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-500 ${
                  i < stageIndex
                    ? 'bg-white/40'
                    : i === stageIndex
                    ? 'bg-white'
                    : 'bg-white/10'
                }`}
              />
              <span
                className={`text-sm font-mono tracking-tight transition-colors duration-500 ${
                  i < stageIndex
                    ? 'text-white/30'
                    : i === stageIndex
                    ? 'text-white/80'
                    : 'text-white/15'
                }`}
              >
                {stage}
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs font-mono text-white/20 tracking-tight mt-8">
          this takes 10–20 seconds
        </p>
      </div>

    </div>
  )
}