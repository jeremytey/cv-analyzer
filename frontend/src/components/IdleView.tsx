import { useState, useRef, useCallback } from 'react'

interface IdleViewProps {
  onSubmit: (file: File, jobDescription: string) => void
}

export function IdleView({ onSubmit }: IdleViewProps) {
  const [file, setFile] = useState<File | null>(null)
  const [jobDescription, setJobDescription] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSetFile = (f: File) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    if (!allowed.includes(f.type)) {
      setError('only pdf or word documents accepted.')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('file exceeds 5mb limit.')
      return
    }
    setError(null)
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }, [])

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const handleSubmit = () => {
    if (!file) {
      setError('no file selected.')
      return
    }
    if (!jobDescription.trim()) {
      setError('job description is required.')
      return
    }
    onSubmit(file, jobDescription)
  }

  return (
    <div className="flex flex-col gap-0">

      {/* Top label */}
      <div className="mb-6">
        <span className="text-xs font-mono text-white/50 tracking-tight uppercase">
          input
        </span>
      </div>

      {/* Two-column grid: dropzone | textarea */}
      <div className="grid grid-cols-2 gap-0 border border-white/10 rounded-2xl overflow-hidden">

        {/* Left: PDF dropzone */}
        <div
          className={`p-6 flex flex-col justify-between min-h-[260px] border-r border-white/10 cursor-pointer transition-colors ${
            isDragging ? 'bg-white/5' : 'bg-transparent'
          }`}
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div>
            <p className="text-xs font-mono text-white/50 tracking-tight mb-4">
              cv_document
            </p>
            {file ? (
              <div className="inline-flex items-center gap-2 border border-white/10 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
                <span className="text-xs font-mono text-white/70 tracking-tight truncate max-w-[180px]">
                  {file.name}
                </span>
              </div>
            ) : (
              <p className="text-sm font-mono text-white/40 tracking-tight leading-relaxed">
                drop pdf here<br />or click to select
              </p>
            )}
          </div>
          <div className="mt-6">
            <p className="text-xs font-mono text-white/30 tracking-tight">
              pdf · doc · docx · max 5mb
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) validateAndSetFile(f)
            }}
          />
        </div>

        {/* Right: job description textarea */}
        <div className="p-6 flex flex-col min-h-[260px]">
          <p className="text-xs font-mono text-white/50 tracking-tight mb-4">
            job_description
          </p>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="paste the full job description here..."
            className="flex-1 bg-transparent text-sm font-mono text-white/80 placeholder:text-white/30 
                       tracking-tight leading-relaxed resize-none outline-none w-full"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-3 text-xs font-mono text-red-400/70 tracking-tight">
          ✕ {error}
        </p>
      )}

      {/* Action row — pill button + circle arrow sidecar */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 bg-accent text-workspace text-sm font-mono 
                     tracking-tight px-6 py-2.5 rounded-full hover:bg-white transition-colors"
        >
          analyze cv
        </button>
        <button
          onClick={handleSubmit}
          aria-label="submit"
          className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center
                     text-white/50 hover:border-white/40 hover:text-white/80 transition-colors text-sm"
        >
          ↗
        </button>
      </div>

    </div>
  )
}