import { useState, useEffect, useRef } from 'react'
import { IdleView } from './components/IdleView'
import { ProcessingView } from './components/ProcessingView'
import { SuccessView } from './components/SuccessView'
import { ErrorView } from './components/ErrorView'

export type UIState = 'IDLE' | 'PROCESSING' | 'SUCCESS' | 'ERROR'

export interface BulletRewrite {
  original: string
  rewritten: string
  justification: string
}

export interface AnalysisResult {
  keyword_gaps: string[]
  rewritten_bullet_points: BulletRewrite[]
}

export interface SuccessPayload {
  jobId: string
  matchScore: number
  analysisResults: AnalysisResult
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const POLL_INTERVAL_MS = 2000

export default function App() {
  const [uiState, setUiState] = useState<UIState>('IDLE')
  const [jobId, setJobId] = useState<string | null>(null)
  const [successPayload, setSuccessPayload] = useState<SuccessPayload | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    if (!jobId) return

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/analyze/${jobId}`)
        const json = await res.json()

        if (!res.ok) {
          stopPolling()
          setErrorMessage(json.message ?? 'Polling request failed.')
          setUiState('ERROR')
          return
        }

        const status: string = json.data.status

        if (status === 'COMPLETED') {
          stopPolling()
          setSuccessPayload({
            jobId: json.data.jobId,
            matchScore: Number(json.data.matchScore),
            analysisResults: json.data.analysisResults as AnalysisResult,
          })
          setUiState('SUCCESS')
        } else if (status === 'FAILED') {
          stopPolling()
          setErrorMessage(json.data.errorMessage ?? 'Analysis failed.')
          setUiState('ERROR')
        }
        // PENDING and PROCESSING: keep polling
      } catch {
        stopPolling()
        setErrorMessage('Network error. Could not reach the server.')
        setUiState('ERROR')
      }
    }, POLL_INTERVAL_MS)

    return () => stopPolling()
  }, [jobId])

  const handleSubmit = async (file: File, jobDescription: string) => {
    setUiState('PROCESSING')
    setErrorMessage(null)
    setSuccessPayload(null)

    const formData = new FormData()
    formData.append('cv', file)
    formData.append('jobDescription', jobDescription)

    try {
      const res = await fetch(`${API_BASE}/api/v1/analyze`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (!res.ok) {
        setErrorMessage(json.message ?? 'Failed to submit analysis.')
        setUiState('ERROR')
        return
      }

      setJobId(json.data.jobId)
    } catch {
      setErrorMessage('Network error. Could not reach the server.')
      setUiState('ERROR')
    }
  }

  const handleReset = () => {
    stopPolling()
    setJobId(null)
    setSuccessPayload(null)
    setErrorMessage(null)
    setUiState('IDLE')
  }

  return (
    <main className="min-h-screen bg-canvas font-mono flex items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <header className="mb-8">
          <h1 className="text-6xl font-bold tracking-[-0.03em] text-[#1a1a1a] leading-tight font-sans">
          cv_analyzer.
          </h1>
          <p className="text-xs font-mono text-neutral-400 mt-2 tracking-wide">
            ats keyword gap analysis + bullet rewriter
          </p>
        </header>

        <div className="bg-workspace rounded-3xl p-8">
          {uiState === 'IDLE' && <IdleView onSubmit={handleSubmit} />}
          {uiState === 'PROCESSING' && <ProcessingView />}
          {uiState === 'SUCCESS' && successPayload && (
            <SuccessView payload={successPayload} onReset={handleReset} />
          )}
          {uiState === 'ERROR' && (
            <ErrorView message={errorMessage} onReset={handleReset} />
          )}
        </div>
      </div>
    </main>
  )
}