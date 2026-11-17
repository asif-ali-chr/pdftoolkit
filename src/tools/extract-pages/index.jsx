import { useEffect, useRef, useState } from 'react'
import {
  FileOutput,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  RefreshCw,
  Check,
  AlertCircle,
  Files,
  FileDown,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { runJob } from '../../lib/workerClient.js'
import { createZip } from '../../lib/download.js'
import { formatBytes, baseName } from '../../lib/files.js'

function indicesToRangeString(indices) {
  if (!indices || indices.length === 0) return ''
  const sorted = [...indices].sort((a, b) => a - b)
  const ranges = []
  let start = sorted[0]
  let prev = start

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i]
    if (curr === prev + 1) {
      prev = curr
    } else {
      ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
      start = curr
      prev = curr
    }
  }
  ranges.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`)
  return ranges.join(', ')
}

function parseRangeInput(str, totalPages) {
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean)
  const set = new Set()

  for (const part of parts) {
    const match = /^(\d+)(?:\s*(-)\s*(\d*))?$/.exec(part)
    if (!match) continue

    const start = Number(match[1])
    const hasDash = Boolean(match[2])
    const end = hasDash ? (match[3] === '' ? totalPages : Number(match[3])) : start

    if (start < 1 || end < 1 || start > totalPages || end > totalPages || start > end) continue

    for (let p = start; p <= end; p++) {
      set.add(p - 1)
    }
  }

  return set
}

export default function ExtractPagesTool() {
  const [file, setFile] = useState(null)
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })

  // Array of thumbnail objects: { index: number, url: string }
  const [thumbnails, setThumbnails] = useState([])
  // Set of selected 0-based page indices
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [rangeTextInput, setRangeTextInput] = useState('')

  // Output mode: 'combined' (1 single PDF) vs 'separate' (ZIP of individual PDFs)
  const [outputMode, setOutputMode] = useState('combined')

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename, count }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const renderAbortRef = useRef(null)
  const createdUrlsRef = useRef([])

  const working = phase === 'working'
  const totalPages = fileInfo.totalPages
  const selectedCount = selectedPages.size

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      renderAbortRef.current?.abort()
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function cleanupUrls() {
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    createdUrlsRef.current = []
    setThumbnails([])
  }

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    setError(null)
    cleanupUrls()
    setFile(selectedFile)
    setSelectedPages(new Set())
    setRangeTextInput('')
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

        // Default: select the first page so it is not completely empty
        const initialSelected = new Set([0])
        setSelectedPages(initialSelected)
        setRangeTextInput(indicesToRangeString(initialSelected))
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
    setRangeTextInput('')
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  // Toggle individual page selection
  function togglePage(index) {
    if (working) return
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      setRangeTextInput(indicesToRangeString(next))
      return next
    })
  }

  // Batch selectors
  function selectAll() {
    if (working || totalPages === 0) return
    const all = new Set()
    for (let i = 0; i < totalPages; i++) all.add(i)
    setSelectedPages(all)
    setRangeTextInput(indicesToRangeString(all))
  }

  function deselectAll() {
    if (working) return
    const empty = new Set()
    setSelectedPages(empty)
    setRangeTextInput('')
  }

  function selectOdd() {
    if (working || totalPages === 0) return
    const odd = new Set()
    for (let i = 0; i < totalPages; i += 2) odd.add(i) // 0-based: 0 (page 1), 2 (page 3)...
    setSelectedPages(odd)
    setRangeTextInput(indicesToRangeString(odd))
  }

  function selectEven() {
    if (working || totalPages === 0) return
    const even = new Set()
    for (let i = 1; i < totalPages; i += 2) even.add(i) // 0-based: 1 (page 2), 3 (page 4)...
    setSelectedPages(even)
    setRangeTextInput(indicesToRangeString(even))
  }

  function invertSelection() {
    if (working || totalPages === 0) return
    setSelectedPages((prev) => {
      const inverted = new Set()
      for (let i = 0; i < totalPages; i++) {
        if (!prev.has(i)) inverted.add(i)
      }
      setRangeTextInput(indicesToRangeString(inverted))
      return inverted
    })
  }

  function applyRangeTextInput(text) {
    setRangeTextInput(text)
    if (!totalPages) return
    const parsed = parseRangeInput(text, totalPages)
    setSelectedPages(parsed)
  }

  async function handleExtract() {
    if (selectedCount === 0) {
      setError('Please select at least one page to extract.')
      return
    }

    setError(null)
    const sortedIndices = Array.from(selectedPages).sort((a, b) => a - b)
    setProgress({ done: 0, total: sortedIndices.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const buffer = await file.arrayBuffer()
      const payload = {
        file: { name: file.name, buffer },
        pageIndices: sortedIndices,
        separateFiles: outputMode === 'separate',
      }

      const res = await runJob('extract-pages', payload, {
        signal: controller.signal,
        transfer: [buffer],
        onProgress: (done, total) => setProgress({ done, total }),
      })

      const outputFiles = res?.files || []
      if (outputFiles.length === 0) {
        throw new Error('No extracted files were produced.')
      }

      const base = baseName(file.name)
      if (outputFiles.length === 1) {
        const single = outputFiles[0]
        const blob = new Blob([single.bytes], { type: 'application/pdf' })
        setResult({ blob, filename: single.name, count: 1 })
      } else {
        const zipBlob = await createZip(outputFiles.map((f) => ({ name: f.name, data: f.bytes })))
        setResult({ blob: zipBlob, filename: `${base}-extracted-pages.zip`, count: outputFiles.length })
      }
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while extracting pages.')
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
    setRangeTextInput('')
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Your pages have been extracted!</p>
            <p className="mt-1 text-sm text-slate-500">
              {result.count === 1
                ? 'Extracted selected pages into 1 clean PDF document.'
                : `Extracted ${result.count} individual pages bundled into a ZIP archive.`}
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton
              blob={result.blob}
              filename={result.filename}
              label={result.count > 1 ? `Download ZIP (${result.count} PDFs)` : 'Download extracted PDF'}
            />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Extract more pages
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
          label="Drop a PDF file here to extract pages"
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
              <span>This file is password-protected. Please unlock it before extracting pages.</span>
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
              {/* Selection Toolbar */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
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
                    <button
                      type="button"
                      onClick={invertSelection}
                      disabled={working}
                      className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Invert
                    </button>
                  </div>
                </div>

                {/* Range text input helper */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 shrink-0">Selected range:</span>
                  <input
                    type="text"
                    value={rangeTextInput}
                    onChange={(e) => applyRangeTextInput(e.target.value)}
                    disabled={working}
                    placeholder="e.g. 1-3, 5, 8"
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                  />
                  <span className="text-slate-400 hidden sm:inline">(Click thumbnails or type ranges)</span>
                </div>
              </div>

              {/* Output Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setOutputMode('combined')}
                  disabled={working}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${
                    outputMode === 'combined'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileOutput size={15} aria-hidden="true" />
                  Combine into 1 PDF
                </button>
                <button
                  type="button"
                  onClick={() => setOutputMode('separate')}
                  disabled={working}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition ${
                    outputMode === 'separate'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Files size={15} aria-hidden="true" />
                  Extract as separate PDFs (ZIP)
                </button>
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
                          ? 'border-orange-500 bg-orange-50/25 ring-2 ring-orange-500 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Selection Checkbox Pill */}
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

                      {/* Thumbnail Image */}
                      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-1.5 border border-slate-100">
                        <img
                          src={url}
                          alt={`Page ${index + 1}`}
                          className={`max-h-full max-w-full object-contain pointer-events-none transition ${
                            isSelected ? 'opacity-100 drop-shadow-sm' : 'opacity-70 group-hover:opacity-90'
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
                  label="Extracting pages"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {selectedCount === 0
                      ? 'Click on page cards to select them for extraction.'
                      : outputMode === 'combined'
                      ? `Ready to extract ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} into a single PDF.`
                      : `Ready to extract ${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'} into separate PDF files.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleExtract}
                    disabled={selectedCount === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FileDown size={18} aria-hidden="true" />
                    Extract {selectedCount > 0 ? `${selectedCount} ${selectedCount === 1 ? 'page' : 'pages'}` : 'pages'}
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
