import { useEffect, useRef, useState } from 'react'
import {
  FileImage,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  RefreshCw,
  Check,
  AlertCircle,
  Download,
  Settings2,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { createZip, downloadBlob } from '../../lib/download.js'
import { formatBytes, baseName } from '../../lib/files.js'
import { convertPdfToImages } from './process.js'

export default function PdfToJpgTool() {
  const [file, setFile] = useState(null)
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })

  // Settings
  const [format, setFormat] = useState('jpeg') // 'jpeg' | 'png'
  const [dpi, setDpi] = useState('high') // 'standard' (1.5x) | 'high' (2.0x) | 'ultra' (3.0x)

  // Thumbnails: { index: number, url: string }
  const [thumbnails, setThumbnails] = useState([])
  // Selected page indices (0-based) to convert
  const [selectedPages, setSelectedPages] = useState(new Set())

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { files, zipBlob, zipFilename, singleBlob, singleFilename }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const renderAbortRef = useRef(null)
  const createdUrlsRef = useRef([])
  const convertedUrlsRef = useRef([])

  const working = phase === 'working'
  const totalPages = fileInfo.totalPages
  const selectedCount = selectedPages.size

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      renderAbortRef.current?.abort()
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      convertedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function cleanupUrls() {
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    createdUrlsRef.current = []
    convertedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    convertedUrlsRef.current = []
    setThumbnails([])
  }

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    setError(null)
    cleanupUrls()
    setFile(selectedFile)
    setSelectedPages(new Set())
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
        const loadedThumbs = res.thumbnails.map((url, i) => ({
          index: i,
          url,
        }))
        setThumbnails(loadedThumbs)
        setFileInfo({ isLocked: false, totalPages: res.totalPages })

        // Default: select all pages
        const all = new Set()
        for (let i = 0; i < res.totalPages; i++) all.add(i)
        setSelectedPages(all)
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
    renderAbortRef.current?.abort()
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setSelectedPages(new Set())
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  // Toggle page selection
  function togglePage(index) {
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

  function selectAll() {
    if (working || totalPages === 0) return
    const all = new Set()
    for (let i = 0; i < totalPages; i++) all.add(i)
    setSelectedPages(all)
  }

  function deselectAll() {
    if (working) return
    setSelectedPages(new Set())
  }

  function selectOdd() {
    if (working || totalPages === 0) return
    const odd = new Set()
    for (let i = 0; i < totalPages; i += 2) odd.add(i)
    setSelectedPages(odd)
  }

  function selectEven() {
    if (working || totalPages === 0) return
    const even = new Set()
    for (let i = 1; i < totalPages; i += 2) even.add(i)
    setSelectedPages(even)
  }

  async function handleConvert() {
    if (selectedCount === 0) {
      setError('Please select at least one page to convert.')
      return
    }

    setError(null)
    const sortedIndices = Array.from(selectedPages).sort((a, b) => a - b)
    setProgress({ done: 0, total: sortedIndices.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { files } = await convertPdfToImages(
        file,
        {
          pageIndices: sortedIndices,
          format,
          dpi,
        },
        (done, total) => setProgress({ done, total }),
        controller.signal,
      )

      files.forEach((f) => convertedUrlsRef.current.push(f.url))

      const base = baseName(file.name)
      if (files.length === 1) {
        setResult({
          files,
          singleBlob: files[0].data,
          singleFilename: files[0].name,
          count: 1,
        })
      } else {
        const zipBlob = await createZip(files.map((f) => ({ name: f.name, data: f.data })))
        setResult({
          files,
          zipBlob,
          zipFilename: `${base}-${format === 'png' ? 'png' : 'jpg'}-images.zip`,
          count: files.length,
        })
      }

      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while converting PDF to images.')
      }
    }
  }

  function startOver() {
    renderAbortRef.current?.abort()
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setSelectedPages(new Set())
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Your images are ready!</p>
            <p className="mt-1 text-sm text-slate-500">
              Successfully converted {result.count} {result.count === 1 ? 'page' : 'pages'} to{' '}
              {format === 'png' ? 'PNG' : 'JPG'}.
            </p>
          </div>

          <div className="mt-2">
            {result.count === 1 ? (
              <DownloadButton
                blob={result.singleBlob}
                filename={result.singleFilename}
                label="Download Image"
              />
            ) : (
              <DownloadButton
                blob={result.zipBlob}
                filename={result.zipFilename}
                label={`Download All as ZIP (${result.count} images)`}
              />
            )}
          </div>

          {/* Individual image previews with one-click download */}
          <div className="mt-6 w-full text-left">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Generated Images (Click to download individual pages)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {result.files.map((img) => (
                <div
                  key={img.name}
                  className="group relative flex flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-xs transition hover:border-slate-300 hover:shadow-md"
                >
                  <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-1.5 border border-slate-100">
                    <img src={img.url} alt={img.name} className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="truncate text-xs font-medium text-slate-700" title={img.name}>
                      Page {img.pageNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => downloadBlob(img.data, img.name)}
                      title={`Download ${img.name}`}
                      className="rounded p-1 text-slate-500 hover:bg-orange-50 hover:text-orange-600"
                    >
                      <Download size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-4"
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
          label="Drop a PDF file here to convert to JPG"
          hint="or click to choose from your device"
        />
      ) : (
        <div className="space-y-4">
          {/* File Card Header */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/75 p-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-white">
                {fileInfo.isLocked ? (
                  <Lock size={18} className="text-amber-500" aria-hidden="true" />
                ) : (
                  <FileText size={18} className="text-slate-400" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-800" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(file.size)}
                  {fileInfo.totalPages > 0 && ` · ${fileInfo.totalPages} total pages`}
                  {fileInfo.isLocked && ' · Password-protected'}
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

          {fileInfo.isLocked && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0 text-amber-600" />
              <span>This file is password-protected. Please unlock it before converting.</span>
            </div>
          )}

          {loadingThumbnails && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
              <RefreshCw size={28} className="mx-auto animate-spin text-orange-500" aria-hidden="true" />
              <p className="font-semibold text-slate-800">Reading PDF pages...</p>
              <p className="text-xs text-slate-500">
                Rendered {thumbProgress.done} of {thumbProgress.total || '...'} pages
              </p>
            </div>
          )}

          {!fileInfo.isLocked && !loadingThumbnails && (
            <>
              {/* Settings Bar */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
                  <Settings2 size={16} className="text-orange-600" aria-hidden="true" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Export Settings
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Format Selector */}
                  <div>
                    <label htmlFor="format-select" className="mb-1 block text-xs font-medium text-slate-600">
                      Image format
                    </label>
                    <select
                      id="format-select"
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      disabled={working}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                    >
                      <option value="jpeg">JPG (Standard, smaller file size)</option>
                      <option value="png">PNG (Lossless, sharpest text)</option>
                    </select>
                  </div>

                  {/* Resolution / DPI */}
                  <div>
                    <label htmlFor="dpi-select" className="mb-1 block text-xs font-medium text-slate-600">
                      Image quality / resolution
                    </label>
                    <select
                      id="dpi-select"
                      value={dpi}
                      onChange={(e) => setDpi(e.target.value)}
                      disabled={working}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                    >
                      <option value="standard">Standard (~110 DPI / 1.5x) - Fast</option>
                      <option value="high">High (~150 DPI / 2.0x) - Recommended</option>
                      <option value="ultra">Ultra (~220 DPI / 3.0x) - Best Quality</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      selectedCount > 0
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {selectedCount} of {totalPages} pages selected
                  </span>

                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={working || selectedCount === totalPages}
                    className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    disabled={working || selectedCount === 0}
                    className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={selectOdd}
                    disabled={working}
                    className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Odd pages
                  </button>
                  <button
                    type="button"
                    onClick={selectEven}
                    disabled={working}
                    className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Even pages
                  </button>
                </div>
              </div>

              {/* Visual Grid of Page Thumbnails */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {thumbnails.map(({ index, url }) => {
                  const isSelected = selectedPages.has(index)
                  return (
                    <div
                      key={index}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={working ? -1 : 0}
                      onClick={() => togglePage(index)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          togglePage(index)
                        }
                      }}
                      className={`group relative flex cursor-pointer flex-col rounded-xl border p-2 transition select-none ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50/20 ring-2 ring-orange-500 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isSelected
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Page {index + 1}
                        </span>

                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                            isSelected
                              ? 'border-orange-600 bg-orange-600 text-white'
                              : 'border-slate-300 bg-white group-hover:border-slate-400'
                          }`}
                        >
                          {isSelected && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                        </div>
                      </div>

                      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-1.5 border border-slate-100">
                        <img
                          src={url}
                          alt={`Page ${index + 1}`}
                          className={`max-h-full max-w-full object-contain pointer-events-none transition ${
                            isSelected ? 'opacity-100 drop-shadow-xs' : 'opacity-70 group-hover:opacity-90'
                          }`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Working State or Action Bar */}
              {working ? (
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label={`Converting pages to ${format === 'png' ? 'PNG' : 'JPG'}`}
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {selectedCount === 0
                      ? 'Please select pages to convert.'
                      : `Will convert ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} to ${format === 'png' ? 'PNG' : 'JPG'} (${dpi.toUpperCase()} resolution).`}
                  </p>
                  <button
                    type="button"
                    onClick={handleConvert}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FileImage size={18} aria-hidden="true" />
                    Convert to {format === 'png' ? 'PNG' : 'JPG'}
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
