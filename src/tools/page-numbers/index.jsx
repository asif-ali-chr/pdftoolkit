import { useState, useRef, useEffect } from 'react'
import {
  ListOrdered,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  Settings2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { usePdfPreview } from '../../hooks/usePdfPreview.js'
import { renderThumbnail } from '../../lib/render.js'
import { runJob } from '../../lib/workerClient.js'
import { formatBytes } from '../../lib/files.js'

const POSITIONS = [
  { id: 'top-left', label: 'Top Left', v: 'top', h: 'left' },
  { id: 'top-center', label: 'Top Center', v: 'top', h: 'center' },
  { id: 'top-right', label: 'Top Right', v: 'top', h: 'right' },
  { id: 'bottom-left', label: 'Bottom Left', v: 'bottom', h: 'left' },
  { id: 'bottom-center', label: 'Bottom Center', v: 'bottom', h: 'center' },
  { id: 'bottom-right', label: 'Bottom Right', v: 'bottom', h: 'right' },
]

function getPositionStyles(pos, m) {
  const isTop = pos.startsWith('top')
  const isCenter = pos.endsWith('center')
  const isLeft = pos.endsWith('left')
  const isRight = pos.endsWith('right')

  // Inset based on margin: 20pt -> 8px, 36pt -> 14px, 54pt -> 20px
  const insetPx = m === 20 ? 8 : m === 54 ? 20 : 14

  const style = {}
  if (isTop) style.top = `${insetPx}px`
  else style.bottom = `${insetPx}px`

  if (isCenter) {
    style.left = '50%'
    style.transform = 'translateX(-50%)'
    style.textAlign = 'center'
  } else if (isLeft) {
    style.left = `${insetPx}px`
    style.textAlign = 'left'
  } else if (isRight) {
    style.right = `${insetPx}px`
    style.textAlign = 'right'
  }

  return style
}

export default function PageNumbersTool() {
  const [file, setFile] = useState(null)
  const preview = usePdfPreview(file)

  // Settings
  const [position, setPosition] = useState('bottom-right')
  const [format, setFormat] = useState('page-n-of-total')
  const [skipFirstPage, setSkipFirstPage] = useState(false)
  const [startPage, setStartPage] = useState(1)
  const [endPage, setEndPage] = useState('')
  const [firstNumber, setFirstNumber] = useState(1)
  const [fontSize, setFontSize] = useState(12)
  const [fontFamily, setFontFamily] = useState('helvetica')
  const [color, setColor] = useState('black')
  const [margin, setMargin] = useState(36)

  // Real PDF page preview state
  const [previewPage, setPreviewPage] = useState(1)
  const [pagePreviewUrl, setPagePreviewUrl] = useState(null)
  const [renderedPage, setRenderedPage] = useState(null)
  const previewUrlRef = useRef(null)

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const working = phase === 'working'
  const totalPages = preview?.pageCount || 0
  const pageLoading = Boolean(file && preview.status === 'ready' && renderedPage !== previewPage)

  // Render actual PDF page for live preview card whenever file, status, or previewPage changes
  useEffect(() => {
    if (!file || preview.status !== 'ready') return

    let cancelled = false

    renderThumbnail(file, { pageNumber: previewPage, maxWidth: 380 })
      .then((res) => {
        if (cancelled) {
          if (res.url) URL.revokeObjectURL(res.url)
          return
        }
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current)
        }
        previewUrlRef.current = res.url
        setPagePreviewUrl(res.url)
        setRenderedPage(previewPage)
      })
      .catch(() => {
        // Ignore render errors
      })

    return () => {
      cancelled = true
    }
  }, [file, preview.status, previewPage])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  function cleanupPreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPagePreviewUrl(null)
    setRenderedPage(null)
  }

  function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    cleanupPreviewUrl()
    setError(null)
    setFile(selectedFile)
    setStartPage(1)
    setEndPage('')
    setSkipFirstPage(false)
    setFirstNumber(1)
    setPreviewPage(1)
  }

  function handleRemoveFile() {
    cleanupPreviewUrl()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setPreviewPage(1)
  }

  function startOver() {
    cleanupPreviewUrl()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setPreviewPage(1)
  }

  // Calculate numbering logic for the currently previewed page
  const effectiveStart = skipFirstPage ? Math.max(startPage, 2) : Math.max(startPage, 1)
  const effectiveEnd = Math.min(Number(endPage) || totalPages || 1, totalPages || 1)
  const totalCountForFormat = Math.max(1, effectiveEnd - effectiveStart + 1)
  const isPageNumbered = previewPage >= effectiveStart && previewPage <= effectiveEnd

  function getPreviewText() {
    if (!isPageNumbered) return null
    const current = firstNumber + (previewPage - effectiveStart)
    const total = totalCountForFormat
    if (format === 'n-slash-total') return `${current} / ${total}`
    if (format === 'just-n') return `${current}`
    if (format === 'dash-n-dash') return `- ${current} -`
    return `Page ${current} of ${total}`
  }

  const fontStyle = {
    fontFamily:
      fontFamily === 'times'
        ? 'Times New Roman, Times, serif'
        : fontFamily === 'courier'
        ? 'Courier New, Courier, monospace'
        : 'Helvetica, Arial, sans-serif',
    fontSize: fontSize === 10 ? '10px' : fontSize === 14 ? '13px' : '11px',
    color: color === 'light-gray' ? '#8c8c8c' : color === 'dark-gray' ? '#444444' : '#000000',
  }

  async function handleAddPageNumbers() {
    if (!file) return
    setError(null)
    setProgress({ done: 0, total: totalPages || 1 })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const buffer = await file.arrayBuffer()
      const payload = {
        file: { name: file.name, buffer },
        options: {
          position,
          format,
          skipFirstPage,
          startPage: Number(startPage) || 1,
          endPage: endPage ? Number(endPage) : undefined,
          firstNumber: Number(firstNumber) || 1,
          fontSize: Number(fontSize) || 12,
          fontFamily,
          color,
          margin: Number(margin) || 36,
        },
      }

      const res = await runJob('page-numbers', payload, {
        signal: controller.signal,
        transfer: [buffer],
        onProgress: (done, total) => setProgress({ done, total }),
      })

      const outputFiles = res?.files || []
      if (outputFiles.length === 0) {
        throw new Error('No PDF was produced.')
      }

      const single = outputFiles[0]
      const blob = new Blob([single.bytes], { type: 'application/pdf' })
      setResult({ blob, filename: single.name })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while adding page numbers.')
      }
    }
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Page numbers added!</p>
            <p className="mt-1 text-sm text-slate-500">
              Your document has been numbered successfully ({formatBytes(result.blob.size)}).
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton blob={result.blob} filename={result.filename} label="Download Numbered PDF" />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Number another PDF
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
          label="Drop a PDF file here to add page numbers"
          hint="or click to choose from your device"
        />
      ) : (
        <div className="space-y-5">
          {/* File Card Header */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/75 p-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                {preview.status === 'ready' && preview.url && (
                  <img src={preview.url} alt="PDF preview" className="h-full w-full object-contain" />
                )}
                {preview.status === 'locked' && <Lock size={18} className="text-amber-500" aria-hidden="true" />}
                {preview.status === 'loading' && <FileText size={18} className="animate-pulse text-slate-400" aria-hidden="true" />}
                {preview.status === 'error' && <FileText size={18} className="text-slate-400" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.size)}
                  {preview.status === 'ready' && ` · ${totalPages} ${totalPages === 1 ? 'page' : 'pages'}`}
                  {preview.status === 'loading' && ' · Reading page count...'}
                  {preview.status === 'locked' && ' · Password-protected'}
                </p>
              </div>
            </div>

            {!working && (
              <button
                type="button"
                onClick={handleRemoveFile}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-red-600"
              >
                Change file
              </button>
            )}
          </div>

          {preview.status === 'locked' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This file is password-protected. Please unlock it before adding page numbers.
            </div>
          )}

          {preview.status !== 'locked' && (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* Left 2 Cols: Numbering Controls */}
              <div className="space-y-4 md:col-span-2">
                {/* Position Picker */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Settings2 size={16} className="text-orange-600" aria-hidden="true" />
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Position on Page
                    </h2>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {POSITIONS.map((pos) => {
                      const active = position === pos.id
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setPosition(pos.id)}
                          disabled={working}
                          className={`flex items-center justify-center rounded-lg border py-2.5 text-xs font-medium transition ${
                            active
                              ? 'border-orange-500 bg-orange-50 font-semibold text-orange-700 ring-2 ring-orange-200'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {pos.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Format and Range */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
                  <div>
                    <label htmlFor="format-select" className="mb-1 block text-xs font-medium text-slate-600">
                      Numbering format
                    </label>
                    <select
                      id="format-select"
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      disabled={working}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                    >
                      <option value="page-n-of-total">Page 1 of {totalPages || 10}</option>
                      <option value="n-slash-total">1 / {totalPages || 10}</option>
                      <option value="just-n">1 (Number only)</option>
                      <option value="dash-n-dash">- 1 - (Dashes)</option>
                    </select>
                  </div>

                  {/* Skip Cover Page Checkbox */}
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={skipFirstPage}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setSkipFirstPage(checked)
                        if (checked && previewPage === 1 && totalPages > 1) {
                          setPreviewPage(2)
                        } else if (!checked && previewPage === 2) {
                          setPreviewPage(1)
                        }
                      }}
                      disabled={working}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span>Skip first page (Do not number cover page)</span>
                  </label>

                  {/* Page range inputs */}
                  <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <label htmlFor="start-page-input" className="mb-1 block text-xs font-medium text-slate-600">
                        From page
                      </label>
                      <input
                        id="start-page-input"
                        type="number"
                        min={1}
                        max={totalPages || 1}
                        value={skipFirstPage && startPage === 1 ? 2 : startPage}
                        onChange={(e) => setStartPage(Number(e.target.value) || 1)}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      />
                    </div>
                    <div>
                      <label htmlFor="end-page-input" className="mb-1 block text-xs font-medium text-slate-600">
                        To page
                      </label>
                      <input
                        id="end-page-input"
                        type="number"
                        min={1}
                        max={totalPages || 1}
                        value={endPage}
                        placeholder={totalPages ? String(totalPages) : 'End'}
                        onChange={(e) => setEndPage(e.target.value)}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      />
                    </div>
                    <div>
                      <label htmlFor="first-number-input" className="mb-1 block text-xs font-medium text-slate-600">
                        Start at #
                      </label>
                      <input
                        id="first-number-input"
                        type="number"
                        min={1}
                        value={firstNumber}
                        onChange={(e) => setFirstNumber(Number(e.target.value) || 1)}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Typography and Margins */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label htmlFor="font-size-select" className="mb-1 block text-xs font-medium text-slate-600">
                        Font size
                      </label>
                      <select
                        id="font-size-select"
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      >
                        <option value={10}>Small (10 pt)</option>
                        <option value={12}>Medium (12 pt)</option>
                        <option value={14}>Large (14 pt)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="font-family-select" className="mb-1 block text-xs font-medium text-slate-600">
                        Font family
                      </label>
                      <select
                        id="font-family-select"
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value)}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      >
                        <option value="helvetica">Helvetica</option>
                        <option value="times">Times Roman</option>
                        <option value="courier">Courier</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="color-select" className="mb-1 block text-xs font-medium text-slate-600">
                        Color
                      </label>
                      <select
                        id="color-select"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      >
                        <option value="black">Black</option>
                        <option value="dark-gray">Dark Gray</option>
                        <option value="light-gray">Light Gray</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="margin-select" className="mb-1 block text-xs font-medium text-slate-600">
                        Margin
                      </label>
                      <select
                        id="margin-select"
                        value={margin}
                        onChange={(e) => setMargin(Number(e.target.value))}
                        disabled={working}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                      >
                        <option value={20}>Small (20 pt)</option>
                        <option value={36}>Medium (0.5 in)</option>
                        <option value={54}>Large (0.75 in)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Col: Live Visual Preview Card with Real PDF Page Image */}
              <div className="flex flex-col">
                <div className="flex-1 flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                  {/* Header with Title and Page Switcher */}
                  <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Eye size={16} className="text-orange-600" aria-hidden="true" />
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                        Live Preview
                      </h2>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600">
                        <button
                          type="button"
                          disabled={previewPage <= 1 || working}
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Previous page preview"
                          aria-label="Previous page preview"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="font-medium text-slate-700 select-none px-1">
                          Page {previewPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          disabled={previewPage >= totalPages || working}
                          onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                          className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Next page preview"
                          aria-label="Next page preview"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Document Viewport */}
                  <div className="relative flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-slate-100/75 p-3 min-h-[340px]">
                    {pageLoading && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-lg bg-white/70 backdrop-blur-xs text-xs font-medium text-slate-600 gap-1.5">
                        <Loader2 size={22} className="animate-spin text-orange-600" />
                        <span>Rendering page {previewPage}...</span>
                      </div>
                    )}

                    {pagePreviewUrl ? (
                      <div className="relative inline-block overflow-hidden rounded border border-slate-300 bg-white shadow-md">
                        <img
                          src={pagePreviewUrl}
                          alt={`Page ${previewPage} preview`}
                          className="block max-h-[320px] w-auto max-w-full object-contain pointer-events-none select-none"
                        />

                        {isPageNumbered ? (
                          <div
                            className="absolute pointer-events-none transition-all duration-150"
                            style={getPositionStyles(position, margin)}
                          >
                            <span
                              className="inline-block rounded px-1.5 py-0.5 font-medium shadow-xs border border-orange-400 bg-white/95 text-slate-900"
                              style={fontStyle}
                            >
                              {getPreviewText()}
                            </span>
                          </div>
                        ) : (
                          <div className="absolute inset-x-2 bottom-2 rounded bg-slate-900/80 px-2 py-1 text-center text-[11px] font-medium text-white shadow-md backdrop-blur-xs">
                            {skipFirstPage && previewPage === 1
                              ? 'Cover page · Not numbered'
                              : 'Page out of numbering range'}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Fallback skeleton while loading initial page */
                      <div className="relative mx-auto flex aspect-[3/4] w-full max-w-[210px] flex-col justify-between rounded-lg border border-slate-300 bg-white p-3 shadow-md animate-pulse">
                        <div className="space-y-1.5 opacity-30 mt-2">
                          <div className="h-2 w-3/4 rounded bg-slate-300" />
                          <div className="h-1.5 w-full rounded bg-slate-200" />
                          <div className="h-1.5 w-5/6 rounded bg-slate-200" />
                        </div>
                        <div className="flex items-center justify-center text-xs text-slate-400">
                          <Loader2 size={16} className="animate-spin text-orange-500 mr-1.5" /> Loading preview...
                        </div>
                        <div className="space-y-1.5 opacity-30 mb-2">
                          <div className="h-1.5 w-full rounded bg-slate-200" />
                          <div className="h-1.5 w-1/2 rounded bg-slate-200" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Info / Helpers */}
                  <div className="mt-3 text-center">
                    {isPageNumbered ? (
                      <p className="text-xs text-slate-600">
                        Will display as <span className="font-semibold text-slate-800">{getPreviewText()}</span> on Page {previewPage}
                      </p>
                    ) : (
                      <div className="text-xs text-amber-700">
                        {skipFirstPage && previewPage === 1 ? (
                          <div className="space-y-1">
                            <p>Page 1 is set as cover page (no number).</p>
                            {totalPages > 1 && (
                              <button
                                type="button"
                                onClick={() => setPreviewPage(2)}
                                className="font-medium text-orange-600 hover:text-orange-700 underline"
                              >
                                View Page 2 preview →
                              </button>
                            )}
                          </div>
                        ) : (
                          <p>Page {previewPage} is outside the numbering range.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Bar or Working State */}
          {working ? (
            <ProgressBar
              done={progress.done}
              total={progress.total}
              label="Stamping page numbers"
              onCancel={() => abortRef.current?.abort()}
            />
          ) : (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                Page numbers will be stamped at the {position.replace('-', ' ')}.
              </p>
              <button
                type="button"
                onClick={handleAddPageNumbers}
                disabled={!file || preview.status !== 'ready'}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ListOrdered size={18} aria-hidden="true" /> Add Page Numbers
              </button>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  )
}
