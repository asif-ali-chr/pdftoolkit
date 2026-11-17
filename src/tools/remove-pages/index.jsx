import { useEffect, useRef, useState } from 'react'
import {
  FileMinus2,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  RefreshCw,
  Trash2,
  AlertCircle,
  Undo2,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { runJob } from '../../lib/workerClient.js'
import { formatBytes } from '../../lib/files.js'

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

export default function RemovePagesTool() {
  const [file, setFile] = useState(null)
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })

  // Array of thumbnail objects: { index: number, url: string }
  const [thumbnails, setThumbnails] = useState([])
  // Set of 0-based page indices marked for removal
  const [pagesToRemove, setPagesToRemove] = useState(new Set())
  const [rangeTextInput, setRangeTextInput] = useState('')

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename, remainingCount }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const renderAbortRef = useRef(null)
  const createdUrlsRef = useRef([])

  const working = phase === 'working'
  const totalPages = fileInfo.totalPages
  const removeCount = pagesToRemove.size
  const remainingCount = totalPages - removeCount
  const allRemoved = totalPages > 0 && removeCount === totalPages

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
    setPagesToRemove(new Set())
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
    setPagesToRemove(new Set())
    setRangeTextInput('')
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  // Toggle page marked for removal
  function togglePage(index) {
    if (working) return
    setPagesToRemove((prev) => {
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
  function markAllForRemoval() {
    if (working || totalPages === 0) return
    const all = new Set()
    for (let i = 0; i < totalPages; i++) all.add(i)
    setPagesToRemove(all)
    setRangeTextInput(indicesToRangeString(all))
  }

  function keepAll() {
    if (working) return
    const empty = new Set()
    setPagesToRemove(empty)
    setRangeTextInput('')
  }

  function removeOdd() {
    if (working || totalPages === 0) return
    const odd = new Set()
    for (let i = 0; i < totalPages; i += 2) odd.add(i) // 0-based: 0 (page 1), 2 (page 3)...
    setPagesToRemove(odd)
    setRangeTextInput(indicesToRangeString(odd))
  }

  function removeEven() {
    if (working || totalPages === 0) return
    const even = new Set()
    for (let i = 1; i < totalPages; i += 2) even.add(i) // 0-based: 1 (page 2), 3 (page 4)...
    setPagesToRemove(even)
    setRangeTextInput(indicesToRangeString(even))
  }

  function invertRemoval() {
    if (working || totalPages === 0) return
    setPagesToRemove((prev) => {
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
    setPagesToRemove(parsed)
  }

  async function handleRemovePages() {
    if (removeCount === 0) {
      setError('Please click on at least one page you want to remove.')
      return
    }

    if (allRemoved) {
      setError('You cannot remove all pages. At least one page must remain.')
      return
    }

    setError(null)
    const sortedRemoveIndices = Array.from(pagesToRemove).sort((a, b) => a - b)
    setProgress({ done: 0, total: remainingCount })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const buffer = await file.arrayBuffer()
      const payload = {
        file: { name: file.name, buffer },
        pagesToRemove: sortedRemoveIndices,
      }

      const res = await runJob('remove-pages', payload, {
        signal: controller.signal,
        transfer: [buffer],
        onProgress: (done, total) => setProgress({ done, total }),
      })

      const outputFiles = res?.files || []
      if (outputFiles.length === 0) {
        throw new Error('No output file was produced.')
      }

      const single = outputFiles[0]
      const blob = new Blob([single.bytes], { type: 'application/pdf' })
      setResult({ blob, filename: single.name, remainingCount })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while removing pages.')
      }
    }
  }

  function startOver() {
    renderAbortRef.current?.abort()
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setPagesToRemove(new Set())
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
            <p className="text-xl font-bold text-slate-800">Pages successfully removed!</p>
            <p className="mt-1 text-sm text-slate-500">
              Removed {removeCount} {removeCount === 1 ? 'page' : 'pages'}. Your new document has{' '}
              {result.remainingCount} {result.remainingCount === 1 ? 'page' : 'pages'}.
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton
              blob={result.blob}
              filename={result.filename}
              label="Download updated PDF"
            />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Remove pages from another PDF
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
          label="Drop a PDF file here to remove pages"
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
              <span>This file is password-protected. Please unlock it before removing pages.</span>
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
              {/* Removal Toolbar */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        removeCount > 0
                          ? 'bg-red-100 text-red-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {removeCount} {removeCount === 1 ? 'page' : 'pages'} to remove
                    </span>

                    <span className="text-xs text-slate-500 hidden sm:inline">
                      ({remainingCount} {remainingCount === 1 ? 'page' : 'pages'} will remain)
                    </span>

                    {removeCount > 0 && (
                      <button
                        type="button"
                        onClick={keepAll}
                        disabled={working}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        <Undo2 size={13} aria-hidden="true" />
                        Keep all
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={removeOdd}
                      disabled={working}
                      className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Remove odd
                    </button>
                    <button
                      type="button"
                      onClick={removeEven}
                      disabled={working}
                      className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Remove even
                    </button>
                    <button
                      type="button"
                      onClick={invertRemoval}
                      disabled={working}
                      className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Invert
                    </button>
                    <button
                      type="button"
                      onClick={markAllForRemoval}
                      disabled={working || removeCount === totalPages}
                      className="rounded px-2 py-1 font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      Remove all
                    </button>
                  </div>
                </div>

                {/* Range text input helper */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 shrink-0">Pages to remove:</span>
                  <input
                    type="text"
                    value={rangeTextInput}
                    onChange={(e) => applyRangeTextInput(e.target.value)}
                    disabled={working}
                    placeholder="e.g. 1, 4-6"
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 font-mono text-xs text-slate-800 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-200"
                  />
                  <span className="text-slate-400 hidden sm:inline">(Click pages to mark for deletion)</span>
                </div>
              </div>

              {allRemoved && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-600" />
                  <span>You cannot remove all pages. Please leave at least one page to keep.</span>
                </div>
              )}

              {/* Visual Grid of Page Thumbnails */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {thumbnails.map(({ index, url }) => {
                  const isMarkedForRemoval = pagesToRemove.has(index)
                  return (
                    <div
                      key={index}
                      role="checkbox"
                      aria-checked={isMarkedForRemoval}
                      tabIndex={working ? -1 : 0}
                      onClick={() => togglePage(index)}
                      onKeyDown={(e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault()
                          togglePage(index)
                        }
                      }}
                      className={`group relative flex cursor-pointer flex-col rounded-xl border p-2 transition select-none ${
                        isMarkedForRemoval
                          ? 'border-red-400 bg-red-50/30 ring-2 ring-red-400 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                      }`}
                    >
                      {/* Top status bar */}
                      <div className="mb-1.5 flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            isMarkedForRemoval
                              ? 'bg-red-100 text-red-700 line-through'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Page {index + 1}
                        </span>

                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border transition ${
                            isMarkedForRemoval
                              ? 'border-red-500 bg-red-500 text-white'
                              : 'border-slate-300 bg-white group-hover:border-red-400 group-hover:text-red-500'
                          }`}
                        >
                          {isMarkedForRemoval ? (
                            <Trash2 size={12} strokeWidth={2.5} aria-hidden="true" />
                          ) : (
                            <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100">✕</span>
                          )}
                        </div>
                      </div>

                      {/* Thumbnail Image */}
                      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-1.5 border border-slate-100">
                        <img
                          src={url}
                          alt={`Page ${index + 1}`}
                          className={`max-h-full max-w-full object-contain pointer-events-none transition ${
                            isMarkedForRemoval ? 'opacity-40 grayscale' : 'opacity-100 drop-shadow-xs'
                          }`}
                        />

                        {/* Strikethrough diagonal red line or removal overlay */}
                        {isMarkedForRemoval && (
                          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
                            <span className="rounded-md bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                              Delete
                            </span>
                          </div>
                        )}

                        {/* Hover hint */}
                        {!isMarkedForRemoval && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-red-600 shadow-sm border border-red-100">
                              Click to remove
                            </span>
                          </div>
                        )}
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
                  label="Removing pages"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {removeCount === 0
                      ? 'Click on the pages you want to delete from this PDF.'
                      : allRemoved
                      ? 'Cannot remove all pages.'
                      : `Will remove ${removeCount} ${removeCount === 1 ? 'page' : 'pages'} and save a new PDF with ${remainingCount} ${remainingCount === 1 ? 'page' : 'pages'}.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleRemovePages}
                    disabled={removeCount === 0 || allRemoved}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <FileMinus2 size={18} aria-hidden="true" />
                    Remove {removeCount > 0 ? `${removeCount} ${removeCount === 1 ? 'page' : 'pages'}` : 'pages'}
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
