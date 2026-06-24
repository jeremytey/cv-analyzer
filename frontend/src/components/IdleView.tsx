import { useState, useRef, useCallback } from 'react'

interface IdleViewProps {
  file: File | null
  setFile: (file: File | null) => void
  jobDescription: string
  setJobDescription: (desc: string) => void
  onSubmit: (file: File, jobDescription: string) => void
}

export function IdleView({ file, setFile, jobDescription, setJobDescription, onSubmit }: IdleViewProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSetFile = (f: File) => {
    if (f.type !== 'application/pdf') {
      setError('only pdf documents accepted.')
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
    if (!file) { setError('no file selected.'); return }
    if (!jobDescription.trim()) { setError('job description is required.'); return }
    onSubmit(file, jobDescription)
  }

  return (
    <div className="flex flex-col gap-0">

      <div className="mb-6">
        <span className="text-xs font-mono text-white/50 tracking-tight uppercase">input</span>
      </div>

      {/* Grid: dropzone | textarea */}
      <div className="grid grid-cols-2 gap-0 border-2 border-white/20 rounded-2xl overflow-hidden">

        {/* Left: PDF dropzone */}
        <div
          className={`p-6 flex flex-col justify-between min-h-[280px] border-r-2 border-white/20 cursor-pointer transition-colors relative ${
            isDragging ? 'bg-white/5' : 'bg-transparent'
          }`}
          onClick={() => !file && inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          {/* Background PDF symbol */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <svg viewBox="0 0 64 80" className="w-24 h-24 opacity-[0.04]" fill="white">
              <path d="M8 0h32l16 16v64H8V0z"/>
              <path d="M40 0l16 16H40V0z" fill="white" opacity="0.6"/>
              <text x="10" y="58" fontSize="14" fontWeight="bold" fill="white" fontFamily="monospace">PDF</text>
            </svg>
          </div>

          <div className="relative z-10">
            <p className="text-xs font-mono text-white/50 tracking-tight mb-4">cv_document</p>

            {file ? (
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 border border-white/20 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60 flex-shrink-0" />
                  <span className="text-xs font-mono text-white/70 tracking-tight truncate max-w-[140px]">
                    {file.name}
                  </span>
                </div>
                {/* Remove button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setError(null) }}
                  className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center
                             text-white/40 hover:border-red-400/50 hover:text-red-400/70 transition-colors text-xs flex-shrink-0"
                  aria-label="remove file"
                >
                  ✕
                </button>
              </div>
            ) : (
              <p className="text-sm font-mono text-white/40 tracking-tight leading-relaxed">
                drop pdf here<br />or click to select
              </p>
            )}
          </div>

          <div className="relative z-10 mt-6">
            <p className="text-xs font-mono text-white/30 tracking-tight">pdf only · max 5mb</p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) validateAndSetFile(f) }}
          />
        </div>

        {/* Right: textarea */}
        <div className="p-6 flex flex-col min-h-[280px]">
          <p className="text-xs font-mono text-white/50 tracking-tight mb-4">job_description</p>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="paste the full job description here..."
            className="flex-1 bg-transparent text-sm font-mono text-white/80 placeholder:text-white/30
                       tracking-tight leading-relaxed resize-none outline-none w-full"
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs font-mono text-red-400/70 tracking-tight">✕ {error}</p>
      )}

      {/* Action row */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          style={{
            padding: '12px 24px',
            border: 'unset',
            borderRadius: '15px',
            color: '#212121',
            zIndex: 1,
            background: '#e8e8e3',
            position: 'relative',
            fontWeight: 700,
            fontSize: '14px',
            fontFamily: 'inherit',
            boxShadow: '4px 8px 19px -3px rgba(0,0,0,0.27)',
            transition: 'all 250ms',
            overflow: 'hidden',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget
            btn.style.color = '#e8e8e3'
            const before = btn.querySelector('.btn-fill') as HTMLElement
            if (before) before.style.width = '100%'
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget
            btn.style.color = '#212121'
            const before = btn.querySelector('.btn-fill') as HTMLElement
            if (before) before.style.width = '0'
          }}
        >
          <span
            className="btn-fill"
            style={{
              content: '',
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '0',
              borderRadius: '15px',
              backgroundColor: '#212121',
              zIndex: -1,
              boxShadow: '4px 8px 19px -3px rgba(0,0,0,0.27)',
              transition: 'all 250ms',
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>analyze cv</span>
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