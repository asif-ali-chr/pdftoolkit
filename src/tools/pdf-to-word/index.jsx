import { useEffect, useRef, useState } from 'react'
import {
  FileType,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  Check,
  AlertCircle,
  BookOpen,
  Layers,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { formatBytes } from '../../lib/files.js'
import { convertPdfToWord } from './process.js'

const PRESETS = [
  {
    id: 'original',
    name: 'Preserve Original PDF',
    font: 'Auto-detect',
    badge: 'Recommended',
    description: 'Matches original fonts, colors, text sizes, table column widths, and page dimensions directly from the PDF.',
    activeClass: 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-200',
  },
  {
    id: 'modern',
    name: 'Modern Business',
    font: 'Calibri',
    badge: 'Calibri',
    description: 'Standard office styling with clean Calibri typography, navy headings, and 1.15 line spacing.',
    activeClass: 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200',
  },
  {
    id: 'formal',
    name: 'Formal / Academic',
    font: 'Times New Roman',
    badge: 'Times',
    description: 'Classic serif typography with 1.5 line spacing. Ideal for legal, research, and thesis documents.',
    activeClass: 'border-slate-700 bg-slate-50/80 ring-2 ring-slate-300',
  },
  {
    id: 'clean',
    name: 'Technical / Clean',
    font: 'Arial',
    badge: 'Arial',
    description: 'Neutral Arial font with structured layout. Ideal for technical manuals, specifications, and reports.',
    activeClass: 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-200',
  },
]

export default function PdfToWordTool() {
  const [file, setFile] = useState(null)
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })
  const [thumbnails, setThumbnails] = useState([])
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })

  // Settings
  const [stylePreset, setStylePreset] = useState('original') // 'original' | 'modern' | 'formal' | 'clean'
  const [includePageBreaks, setIncludePageBreaks] = useState(true)
  const [detectTables, setDetectTables] = useState(true)
  const [pageSelectionMode, setPageSelectionMode] = useState('all') // 'all' | 'custom'
  const [selectedPages, setSelectedPages] = useState(new Set()) // 0-based page indices

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null)
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
    setSelectedPages(new Set())
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
        // Default selected pages: all pages
        const allIndices = new Set(Array.from({ length: res.totalPages }, (_, i) => i))
        setSelectedPages(allIndices)
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
    setSelectedPages(new Set())
  }

  function startOver() {
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setFileInfo({ isLocked: false, totalPages: 0 })
    setSelectedPages(new Set())
  }

  function togglePageSelection(index) {
    if (working) return
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function selectAllPages() {
    if (working || totalPages === 0) return
    setSelectedPages(new Set(Array.from({ length: totalPages }, (_, i) => i)))
  }

  function deselectAllPages() {
    if (working) return
    setSelectedPages(new Set())
  }

  async function handleConvert() {
    if (!file || working) return
    setError(null)

    const targetIndices =
      pageSelectionMode === 'custom'
        ? Array.from(selectedPages).sort((a, b) => a - b)
        : Array.from({ length: totalPages }, (_, i) => i)

    if (targetIndices.length === 0) {
      setError('Please select at least one page to convert.')
      return
    }

    setProgress({ done: 0, total: targetIndices.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await convertPdfToWord(
        file,
        {
          stylePreset,
          includePageBreaks,
          detectTables,
          pageIndices: targetIndices,
        },
        (done, total) => setProgress({ done, total }),
        controller.signal,
      )

      setResult(res)
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while converting PDF to Word.')
      }
    }
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <CheckCircle2 size={48} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold text-slate-800">Your Word document is ready!</p>
            <p className="mt-1 text-sm text-slate-500">
              Successfully extracted and formatted text into an editable Word document ({formatBytes(result.blob.size)}).
            </p>
          </div>

          {/* Stats Summary Card */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-2xl border border-slate-200 bg-slate-50/75 p-4 shadow-xs">
            <div className="rounded-xl bg-white p-3 border border-slate-200/80 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Words</span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{result.wordCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200/80 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paragraphs</span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{result.paragraphCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200/80 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Headings</span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{result.headingCount.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200/80 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Tables</span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{result.tableCount || 0}</p>
            </div>
            <div className="rounded-xl bg-white p-3 border border-slate-200/80 text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pages</span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">{result.totalPages}</p>
            </div>
          </div>

          {result.dominantFont && (
            <p className="text-xs text-slate-500">
              Preserved PDF typography · Dominant font: <span className="font-semibold text-slate-700">{result.dominantFont}</span>
            </p>
          )}

          {result.tableCount > 0 && (
            <p className="text-xs text-blue-700 bg-blue-50 px-3.5 py-1.5 rounded-full border border-blue-200">
              ✓ Successfully formatted {result.tableCount} {result.tableCount === 1 ? 'table' : 'tables'} with proportional column widths and cell alignments.
            </p>
          )}

          {result.scannedPageCount > 0 && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs text-amber-800">
              <AlertCircle size={16} className="text-amber-600 shrink-0" aria-hidden="true" />
              <span>
                {result.scannedPageCount === 1
                  ? '1 page had no selectable text (scanned or image content).'
                  : `${result.scannedPageCount} pages had no selectable text (scanned or image content).`}
              </span>
            </div>
          )}

          <div className="mt-2">
            <DownloadButton blob={result.blob} filename={result.filename} label="Download Word Document (.docx)" />
          </div>

          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Convert another PDF
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
          label="Drop a PDF file here to convert to Word"
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
              This file is password-protected. Please unlock it before converting.
            </div>
          )}

          {!fileInfo.isLocked && (
            <>
              {/* Document Style Preset */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Typography & Document Styling
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {PRESETS.map((preset) => {
                    const active = stylePreset === preset.id

                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setStylePreset(preset.id)}
                        disabled={working}
                        className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                          active
                            ? preset.activeClass
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <span className="font-semibold text-slate-800 text-xs sm:text-sm">{preset.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                              active ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {preset.badge || preset.font}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{preset.description}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Page Range & Layout Options */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pages & Layout
                  </span>
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setPageSelectionMode('all')}
                      disabled={working}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        pageSelectionMode === 'all'
                          ? 'bg-orange-100 text-orange-700 font-semibold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      All pages ({totalPages})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPageSelectionMode('custom')}
                      disabled={working}
                      className={`rounded px-2.5 py-1 font-medium transition ${
                        pageSelectionMode === 'custom'
                          ? 'bg-orange-100 text-orange-700 font-semibold'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Select pages ({selectedPages.size})
                    </button>
                  </div>
                </div>

                {/* Page Breaks Checkbox */}
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePageBreaks}
                    onChange={(e) => setIncludePageBreaks(e.target.checked)}
                    disabled={working}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span>Insert page breaks between PDF pages (maintains page pagination in Word)</span>
                </label>

                {/* Table Detection Checkbox */}
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={detectTables}
                    onChange={(e) => setDetectTables(e.target.checked)}
                    disabled={working}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span>Detect and format tables (converts multi-column tabular data into editable Word tables)</span>
                </label>

                {/* Custom Page Picker Grid */}
                {pageSelectionMode === 'custom' && totalPages > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Click pages to include or exclude:</span>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={selectAllPages}
                          disabled={working}
                          className="font-medium text-orange-600 hover:text-orange-700"
                        >
                          Select all
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          type="button"
                          onClick={deselectAllPages}
                          disabled={working}
                          className="font-medium text-slate-500 hover:text-slate-700"
                        >
                          Deselect all
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                      {Array.from({ length: totalPages }, (_, i) => i).map((pageIdx) => {
                        const isSelected = selectedPages.has(pageIdx)
                        const thumbUrl = thumbnails[pageIdx]

                        return (
                          <div
                            key={pageIdx}
                            onClick={() => togglePageSelection(pageIdx)}
                            className={`group relative flex flex-col items-center cursor-pointer rounded-lg border p-1.5 transition ${
                              isSelected
                                ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-200'
                                : 'border-slate-200 bg-white opacity-60 hover:opacity-100'
                            }`}
                          >
                            <div className="relative flex aspect-3/4 w-full items-center justify-center overflow-hidden rounded bg-slate-100">
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={`Page ${pageIdx + 1}`}
                                  className="h-full w-full object-contain pointer-events-none select-none"
                                  loading="lazy"
                                />
                              ) : (
                                <FileText size={16} className="text-slate-400 animate-pulse" />
                              )}

                              {isSelected && (
                                <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white shadow-xs">
                                  <Check size={10} strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <span className="mt-1 text-[11px] font-medium text-slate-700">
                              Page {pageIdx + 1}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Working State or Action Bar */}
              {working ? (
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label="Extracting and formatting text into Word document"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {pageSelectionMode === 'custom'
                      ? `Converting ${selectedPages.size} selected ${selectedPages.size === 1 ? 'page' : 'pages'} to .docx`
                      : `Converting all ${totalPages} pages to .docx`}
                  </p>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={!totalPages || fileInfo.isLocked || working || (pageSelectionMode === 'custom' && selectedPages.size === 0)}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FileType size={18} aria-hidden="true" /> Convert to Word
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
