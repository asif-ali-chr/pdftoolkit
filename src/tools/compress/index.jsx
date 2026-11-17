import { useEffect, useRef, useState } from 'react'
import {
  Minimize2,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  Sparkles,
  Zap,
  Eye,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { formatBytes } from '../../lib/files.js'
import { compressPdf } from './process.js'

const PRESETS = [
  {
    id: 'extreme',
    name: 'Extreme Compression',
    badge: 'Max reduction',
    description: 'Lowest quality, high compression. Great for scans and strict upload limits.',
    reductionEst: 'Up to 70–90% reduction',
    icon: Zap,
    accent: 'text-amber-600',
    activeClass: 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-200',
  },
  {
    id: 'recommended',
    name: 'Recommended',
    badge: 'Best balance',
    description: 'Good quality, good compression. Ideal for web sharing, emails, and forms.',
    reductionEst: 'Up to 50–75% reduction',
    icon: Sparkles,
    accent: 'text-orange-600',
    activeClass: 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-200',
  },
  {
    id: 'low',
    name: 'Less Compression',
    badge: 'High quality',
    description: 'High image quality, mild compression. Keeps photos and graphics sharp.',
    reductionEst: 'Up to 30–50% reduction',
    icon: Eye,
    accent: 'text-sky-600',
    activeClass: 'border-sky-400 bg-sky-50/50 ring-2 ring-sky-200',
  },
]

export default function CompressTool() {
  const [file, setFile] = useState(null)
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })
  const [thumbnails, setThumbnails] = useState([])
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })

  // Compression level: 'extreme' | 'recommended' | 'low' | 'lossless'
  const [level, setLevel] = useState('recommended')

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename, originalSize, compressedSize, reductionPercent, method }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const renderAbortRef = useRef(null)
  const createdUrlsRef = useRef([])

  const working = phase === 'working'
  const totalPages = fileInfo.totalPages

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      renderAbortRef.current?.abort()
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function cleanupUrls() {
    renderAbortRef.current?.abort()
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    createdUrlsRef.current = []
    setThumbnails([])
  }

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    setError(null)
    cleanupUrls()
    setFile(selectedFile)
    setFileInfo({ isLocked: false, totalPages: 0 })
    setLoadingThumbnails(true)
    setThumbProgress({ done: 0, total: 0 })

    const abortCtrl = new AbortController()
    renderAbortRef.current = abortCtrl

    try {
      const res = await renderAllThumbnails(selectedFile, {
        maxWidth: 160,
        signal: abortCtrl.signal,
        onPageRendered: (done, total, url) => {
          createdUrlsRef.current.push(url)
          setThumbProgress({ done, total })
          setThumbnails((prev) => {
            const next = [...prev]
            next[done - 1] = url
            return next
          })
        },
      })

      if (res.status === 'locked') {
        setFileInfo({ isLocked: true, totalPages: 0 })
        setLoadingThumbnails(false)
        return
      }

      if (res.status === 'error') {
        setError(res.error || 'Failed to read PDF pages.')
        setLoadingThumbnails(false)
        return
      }

      if (res.status === 'ready') {
        setThumbnails(res.thumbnails)
        setFileInfo({ isLocked: false, totalPages: res.totalPages })
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Failed to generate page previews.')
      }
    } finally {
      setLoadingThumbnails(false)
    }
  }

  function handleRemoveFile() {
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setFileInfo({ isLocked: false, totalPages: 0 })
  }

  function startOver() {
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setFileInfo({ isLocked: false, totalPages: 0 })
  }

  async function handleCompress() {
    if (!file || working) return
    setError(null)
    setProgress({ done: 0, total: totalPages || 1 })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await compressPdf(
        file,
        { level },
        (done, total) => setProgress({ done, total }),
        controller.signal,
      )

      const blob = new Blob([res.bytes], { type: 'application/pdf' })
      setResult({
        blob,
        filename: res.name,
        originalSize: res.originalSize,
        compressedSize: res.compressedSize,
        reductionPercent: res.reductionPercent,
        method: res.method,
      })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while compressing the PDF.')
      }
    }
  }

  if (phase === 'done' && result) {
    const isSmaller = result.reductionPercent > 0

    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <CheckCircle2 size={48} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold text-slate-800">Your PDF is compressed!</p>
            <p className="mt-1 text-sm text-slate-500">
              {isSmaller
                ? `Reduced from ${formatBytes(result.originalSize)} to ${formatBytes(result.compressedSize)}.`
                : `Your PDF was already well-optimized (${formatBytes(result.originalSize)}).`}
            </p>
          </div>

          {/* Before & After Comparison Card */}
          <div className="flex flex-wrap items-center justify-center gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-xs">
            <div className="text-center px-4">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Before</span>
              <p className="text-lg font-bold text-slate-700 mt-0.5">{formatBytes(result.originalSize)}</p>
            </div>

            <div className="flex items-center justify-center text-slate-400">
              <ArrowRight size={20} />
            </div>

            <div className="text-center px-4">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">After</span>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">{formatBytes(result.compressedSize)}</p>
            </div>

            {isSmaller && (
              <div className="rounded-xl bg-emerald-100 border border-emerald-300 px-4 py-2 text-center">
                <span className="block text-2xl font-black text-emerald-800">-{result.reductionPercent}%</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Smaller</span>
              </div>
            )}
          </div>

          {result.method === 'lossless' && (
            <p className="text-xs text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200">
              ✓ Preserved 100% selectable vector text and fonts without visual change.
            </p>
          )}

          <div className="mt-2">
            <DownloadButton blob={result.blob} filename={result.filename} label="Download Compressed PDF" />
          </div>

          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Compress another PDF
          </button>
        </div>
      </ToolLayout>
    )
  }

  return (
    <ToolLayout error={error} onDismissError={() => setError(null)}>
      {!file ? (
        <DropZone
          multiple={false}
          onFiles={(files) => handleFileSelect(files[0])}
          onError={setError}
          label="Drop a PDF file here to compress"
          hint="or click to choose from your device"
        />
      ) : (
        <div className="space-y-6">
          {/* File Header Card */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/75 p-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                {thumbnails[0] ? (
                  <img src={thumbnails[0]} alt="PDF preview" className="h-full w-full object-contain" />
                ) : fileInfo.isLocked ? (
                  <Lock size={20} className="text-amber-500" aria-hidden="true" />
                ) : loadingThumbnails ? (
                  <FileText size={20} className="animate-pulse text-slate-400" aria-hidden="true" />
                ) : (
                  <FileText size={20} className="text-slate-400" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{formatBytes(file.size)}</span>
                  {totalPages > 0 && ` · ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}`}
                  {loadingThumbnails && thumbProgress.total > 0 && ` · Rendering previews (${thumbProgress.done}/${thumbProgress.total})...`}
                  {loadingThumbnails && thumbProgress.total === 0 && ' · Reading PDF...'}
                  {fileInfo.isLocked && ' · Password-protected'}
                </p>
              </div>
            </div>

            {!working && (
              <button
                type="button"
                onClick={handleRemoveFile}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600"
                aria-label="Remove file"
              >
                Change file
              </button>
            )}
          </div>

          {fileInfo.isLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This file is password-protected. Please unlock it before compressing.
            </div>
          )}

          {!fileInfo.isLocked && (
            <>
              {/* Choose Compression Level */}
              <div className="space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Choose Compression Level
                </span>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {PRESETS.map((preset) => {
                    const active = level === preset.id
                    const Icon = preset.icon

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setLevel(preset.id)}
                        disabled={working}
                        className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                          active
                            ? preset.activeClass
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <Icon size={20} className={preset.accent} aria-hidden="true" />
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              active ? 'bg-white text-slate-800 shadow-2xs' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {preset.badge}
                          </span>
                        </div>

                        <span className="mt-3 text-sm font-semibold text-slate-800">{preset.name}</span>
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">{preset.description}</p>
                        <span className="mt-3 text-[11px] font-medium text-slate-400">{preset.reductionEst}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Alternative: Lossless Optimization Mode */}
                <button
                  type="button"
                  onClick={() => setLevel('lossless')}
                  disabled={working}
                  className={`mt-2 flex w-full items-start gap-3.5 rounded-xl border p-3.5 text-left transition ${
                    level === 'lossless'
                      ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <ShieldCheck size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        Lossless Cleanup (Preserve 100% Vector Text)
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Zero visual change
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                      Preserves selectable text, vector graphics, and original font quality without rasterizing.
                      Compacts redundant PDF object streams and clears unneeded metadata.
                    </p>
                  </div>
                </button>
              </div>

              {/* Document Pages Visual Preview */}
              {totalPages > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Document Pages ({totalPages})
                    </span>
                    <span className="text-xs text-slate-400">All pages will be compressed</span>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 px-0.5 scrollbar-thin">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => {
                      const thumbUrl = thumbnails[pageNumber - 1]
                      return (
                        <div key={pageNumber} className="flex flex-col items-center shrink-0">
                          <div className="relative flex h-22 w-16 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xs">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt={`Page ${pageNumber}`}
                                className="h-full w-full object-contain pointer-events-none select-none"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center gap-1 text-slate-300">
                                <FileText size={16} className="animate-pulse" />
                                <span className="text-[10px] text-slate-400">{pageNumber}</span>
                              </div>
                            )}
                          </div>
                          <span className="mt-1 text-[11px] font-medium text-slate-600">
                            Page {pageNumber}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Working State or Action Bar */}
              {working ? (
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label="Compressing PDF"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {level === 'lossless'
                      ? 'Lossless optimization maintains original text and fonts.'
                      : 'Pages will be re-compressed as high-efficiency images.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleCompress}
                    disabled={!totalPages || fileInfo.isLocked || working}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Minimize2 size={18} aria-hidden="true" /> Compress PDF
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </ToolLayout>
  )
}
