import { useState } from 'react'
import type { SuccessPayload } from '../App'

interface SuccessViewProps {
  payload: SuccessPayload
  onReset: () => void
}

function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: 'STRONG ATS MATCH', color: '#4ade80' }
  if (score >= 40) return { text: 'MODERATE ATS RISK', color: '#fbbf24' }
  return { text: 'CRITICAL ATS FILTER RISK', color: '#f87171' }
}

export function SuccessView({ payload, onReset }: SuccessViewProps) {
  const { matchScore, analysisResults } = payload
  const {
    keyword_gaps,
    rewritten_bullet_points,
    one_page_verdict
  } = analysisResults
  const label = scoreLabel(matchScore)

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch {
      // Clipboard write failed silently — no destructive fallback needed here
    }
  }

  return (
    <div className="flex flex-col gap-0">

      {/* Meta header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-white/50 tracking-tight">Analysis complete</span>
        </div>
        <button
          onClick={onReset}
          className="text-xs font-mono text-white/30 border border-white/10 px-3 py-1 rounded-full
                     hover:text-white/60 hover:border-white/30 transition-colors tracking-tight"
        >
          Start over ↺
        </button>
      </div>

      {/* Top split: score | keyword gaps */}
      <div className="grid grid-cols-3 gap-0 border-2 border-white/20 rounded-2xl overflow-hidden mb-4">

        {/* Left: match score */}
        <div className="p-6 border-r-2 border-white/20 flex flex-col justify-between">
          <p className="text-xs font-mono text-white/40 tracking-tight uppercase mb-2">ATS Match Score</p>
          <div>
            <p className="text-6xl font-bold text-white leading-none font-sans">
              {matchScore}<span className="text-3xl">%</span>
            </p>
            <p className="text-xs font-mono mt-3 tracking-tight" style={{ color: label.color }}>
              {label.text}
            </p>
          </div>
        </div>

        {/* Right: keyword gaps */}
        <div className="col-span-2 p-6">
          <p className="text-xs font-mono text-white/40 tracking-tight uppercase mb-4">Missing Keywords</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {keyword_gaps.map((gap) => (
              <div key={gap} className="flex items-start gap-2">
                <span className="text-red-400/80 text-xs font-mono flex-shrink-0 mt-0.5">×</span>
                <span className="text-xs font-mono text-white/50 tracking-tight leading-snug">{gap}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CV length feedback */}
      <div className="border-2 border-white/20 rounded-2xl p-5 mb-4 flex flex-col gap-2">
        <p className="text-xs font-mono text-white/40 tracking-tight uppercase">CV Length Feedback</p>
        <p className="text-xs font-mono text-white/80 tracking-tight leading-relaxed">
          {one_page_verdict || "Document formatting demonstrates precise single-page technical layout discipline."}
        </p>
      </div>

      {/* Bottom: rewrites */}
      <div className="border-2 border-white/20 rounded-2xl overflow-hidden">
        <div className="p-4 border-b-2 border-white/20">
          <p className="text-xs font-mono text-white/40 tracking-tight uppercase">Suggested Rewrites</p>
        </div>

        <div className="divide-y-2 divide-white/20">
          {rewritten_bullet_points.map((bullet, i) => (
            <div key={i} className="grid grid-cols-2 divide-x-2 divide-white/20">

              {/* Left: original */}
              <div className="p-5">
                <p className="text-xs font-mono text-white/30 tracking-tight uppercase mb-3">Your original</p>
                <p className="text-xs font-mono text-white/30 tracking-tight leading-relaxed line-through">
                  {bullet.original}
                </p>
              </div>

              {/* Right: rewritten */}
              <div className="p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-mono tracking-tight uppercase" style={{ color: '#4ade80' }}>
                    Suggested rewrite
                  </p>
                  <button
                    onClick={() => handleCopy(bullet.rewritten, i)}
                    className="text-xs font-mono text-white/40 border border-white/15 px-2.5 py-1 rounded-full
                               hover:text-white/80 hover:border-white/40 transition-colors tracking-tight flex-shrink-0"
                  >
                    {copiedIndex === i ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <p className="text-sm font-sans font-medium text-white/90 leading-relaxed">
                  {bullet.rewritten}
                </p>
                <div
                  className="border rounded px-3 py-2 mt-1"
                  style={{
                    borderColor: 'rgba(74,222,128,0.2)',
                    backgroundColor: 'rgba(74,222,128,0.04)',
                  }}
                >
                  <p className="text-xs font-mono text-white/40 tracking-tight leading-relaxed">
                    {bullet.justification}
                  </p>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  )
}