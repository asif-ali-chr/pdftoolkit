import { useEffect, useRef, useState } from 'react'
import {
  Split,
  RotateCcw,
  CheckCircle2,
  Lock,
  FileText,
  Plus,
  Trash2,
  Layers,
  ListOrdered,
  FileArchive,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { runJob } from '../../lib/workerClient.js'
import { createZip } from '../../lib/download.js'
import { formatBytes, baseName } from '../../lib/files.js'

function parseRangeString(str, totalPages) {
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) throw new Error('Enter at least one page or range (e.g. 1-3, 4-6).')

  return parts.map((part) => {
    const match = /^(\d+)(?:\s*(-)\s*(\d*))?$/.exec(part)
    if (!match) throw new Error(`"${part}" is not a valid page or range.`)

    const start = Number(match[1])
    const hasDash = Boolean(match[2])
    const end = hasDash ? (match[3] === '' ? totalPages : Number(match[3])) : start

    if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
      throw new Error(`"${part}" is outside this document (it has ${totalPages} pages).`)
    }
    if (start > end) {
      throw new Error(`"${part}" is backwards. Write it as ${end}-${start}.`)
    }

    const indices = []
    for (let p = start; p <= end; p++) indices.push(p - 1)
    return {
      label: start === end ? `page_${start}` : `pages_${start}-${end}`,
      indices,
    }
  })
}

/**
 * Visual thumbnail preview strip for a given page range [from .. to]
 */
function RangePreview({ from, to, totalPages, thumbnails }) {
  const [expanded, setExpanded] = useState(false)

  const fromNum = Number(from)
  const toNum = Number(to ?? totalPages)

  if (!from || !toNum) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 py-3 text-center text-xs text-slate-400">
        Enter page numbers above to preview this range.
      </div>
    )
  }

  if (fromNum > toNum) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/70 py-2 px-3 text-center text-xs font-medium text-red-600">
        &quot;From&quot; page ({fromNum}) cannot be greater than &quot;To&quot; page ({toNum}).
      </div>
    )
  }

  if (fromNum < 1 || toNum > totalPages) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 py-2 px-3 text-center text-xs font-medium text-amber-700">
        Pages must be between 1 and {totalPages}.
      </div>
    )
  }

  const pageCount = toNum - fromNum + 1
  const pages = []
  for (let p = fromNum; p <= toNum; p++) {
    pages.push(p)
  }

  const shouldCollapse = pageCount > 8 && !expanded
  const visiblePages = shouldCollapse
    ? [...pages.slice(0, 4), 'ellipsis', ...pages.slice(-3)]
    : pages

  return (
    <div className="relative rounded-lg border border-slate-200/80 bg-white/80 p-2.5 shadow-2xs">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 px-0.5 scrollbar-thin">
        {visiblePages.map((item, idx) => {
          if (item === 'ellipsis') {
            return (
              <button
                key={`ellipsis-${idx}`}
                type="button"
                onClick={() => setExpanded(true)}
                className="flex h-24 w-18 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-orange-300 bg-orange-50/80 p-1 text-center transition hover:bg-orange-100 hover:border-orange-400"
                title={`Click to view all ${pageCount} pages`}
              >
                <span className="text-xs font-bold text-orange-700">+{pageCount - 7}</span>
                <span className="text-[10px] text-orange-600 leading-tight">pages</span>
                <span className="mt-1 text-[9px] font-semibold text-orange-600 underline">Show all</span>
              </button>
            )
          }

          const pageNumber = item
          const thumbUrl = thumbnails[pageNumber - 1]

          return (
            <div key={pageNumber} className="flex flex-col items-center shrink-0">
              <div className="relative flex h-24 w-18 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xs transition hover:border-orange-300">
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

      {expanded && pageCount > 8 && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] font-medium text-orange-600 hover:text-orange-700 underline"
          >
            Show less
          </button>
        </div>
      )}
    </div>
  )
}

export default function SplitTool() {
  const [file, setFile] = useState(null)
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })
  const [thumbnails, setThumbnails] = useState([])
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })

  const [mode, setMode] = useState('range') // 'range' | 'pages'
  const [rangeInputType, setRangeInputType] = useState('cards') // 'cards' | 'text'
  const [rangeText, setRangeText] = useState('')
  const [ranges, setRanges] = useState([{ id: '1', from: 1, to: null }])
  const [mergeIntoSingle, setMergeIntoSingle] = useState(false)

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename, count }
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
    setRanges([{ id: '1', from: 1, to: null }])
    setRangeText('')
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
        setRanges([{ id: '1', from: 1, to: res.totalPages }])
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

  function addRange() {
    const last = ranges[ranges.length - 1]
    const lastTo = last ? (last.to ?? (totalPages || 1)) : 1
    const nextFrom = Math.min(lastTo + 1, totalPages || 1)
    const nextTo = totalPages || nextFrom
    setRanges((prev) => [...prev, { id: crypto.randomUUID(), from: nextFrom, to: nextTo }])
  }

  function updateRange(id, field, value) {
    setRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: Number(value) || 0 } : r)),
    )
  }

  function removeRange(id) {
    if (ranges.length <= 1) return
    setRanges((prev) => prev.filter((r) => r.id !== id))
  }

  function validateRanges() {
    if (!totalPages) return { valid: false, error: 'Document pages are still loading.' }

    if (mode === 'pages') return { valid: true }

    if (rangeInputType === 'text') {
      try {
        const textToParse = rangeText.trim() || `1-${totalPages}`
        parseRangeString(textToParse, totalPages)
        return { valid: true }
      } catch (err) {
        return { valid: false, error: err.message }
      }
    }

    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i]
      const toVal = r.to ?? totalPages
      if (!r.from || !toVal) {
        return { valid: false, error: `Range ${i + 1} has empty fields.` }
      }
      if (r.from < 1 || r.from > totalPages) {
        return { valid: false, error: `Range ${i + 1}: "From" page must be between 1 and ${totalPages}.` }
      }
      if (toVal < 1 || toVal > totalPages) {
        return { valid: false, error: `Range ${i + 1}: "To" page must be between 1 and ${totalPages}.` }
      }
      if (r.from > toVal) {
        return { valid: false, error: `Range ${i + 1}: "From" page (${r.from}) cannot be greater than "To" page (${toVal}).` }
      }
    }

    return { valid: true }
  }

  async function handleSplit() {
    setError(null)

    const validation = validateRanges()
    if (!validation.valid) {
      setError(validation.error)
      return
    }

    let calculatedRanges = []
    if (mode === 'pages') {
      for (let p = 1; p <= totalPages; p++) {
        calculatedRanges.push({
          label: `page_${p}`,
          indices: [p - 1],
        })
      }
    } else if (rangeInputType === 'text') {
      const textToParse = rangeText.trim() || `1-${totalPages}`
      calculatedRanges = parseRangeString(textToParse, totalPages)
    } else {
      calculatedRanges = ranges.map((r) => {
        const toVal = r.to ?? totalPages
        const indices = []
        for (let p = r.from; p <= toVal; p++) indices.push(p - 1)
        return {
          label: r.from === toVal ? `page_${r.from}` : `pages_${r.from}-${toVal}`,
          indices,
        }
      })
    }

    setProgress({ done: 0, total: calculatedRanges.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const buffer = await file.arrayBuffer()
      const payload = {
        file: { name: file.name, buffer },
        ranges: calculatedRanges,
        mergeIntoSingle: mode === 'range' && mergeIntoSingle,
      }

      const res = await runJob('split', payload, {
        signal: controller.signal,
        transfer: [buffer],
        onProgress: (done, total) => setProgress({ done, total }),
      })

      const outputFiles = res?.files || []
      if (outputFiles.length === 0) {
        throw new Error('No files were produced.')
      }

      const base = baseName(file.name)
      if (outputFiles.length === 1) {
        const single = outputFiles[0]
        const blob = new Blob([single.bytes], { type: 'application/pdf' })
        setResult({ blob, filename: single.name, count: 1 })
      } else {
        const zipBlob = await createZip(outputFiles.map((f) => ({ name: f.name, data: f.bytes })))
        setResult({ blob: zipBlob, filename: `${base}-split.zip`, count: outputFiles.length })
      }
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while splitting the PDF.')
      }
    }
  }

  function startOver() {
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setFileInfo({ isLocked: false, totalPages: 0 })
  }

  // Parse ranges dynamically for live preview when in text input mode
  let textRanges = []
  let textParseError = null
  if (mode === 'range' && rangeInputType === 'text' && totalPages > 0) {
    try {
      const textToParse = rangeText.trim() || `1-${totalPages}`
      textRanges = parseRangeString(textToParse, totalPages)
    } catch (err) {
      textParseError = err.message
    }
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Your PDF has been split</p>
            <p className="mt-1 text-sm text-slate-500">
              {result.count === 1
                ? 'Extracted 1 PDF document.'
                : `Created ${result.count} separate PDF documents bundled in a ZIP archive.`}
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton
              blob={result.blob}
              filename={result.filename}
              label={result.count > 1 ? `Download ZIP (${result.count} PDFs)` : 'Download split PDF'}
            />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Split another PDF
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
          label="Drop a PDF file here"
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
                  {formatBytes(file.size)}
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
              This file is password-protected. Please unlock it before splitting.
            </div>
          )}

          {!fileInfo.isLocked && (
            <>
              {/* Split Mode Selector */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setMode('range')}
                  disabled={working}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                    mode === 'range'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ListOrdered size={16} aria-hidden="true" />
                  Split by range
                </button>
                <button
                  type="button"
                  onClick={() => setMode('pages')}
                  disabled={working}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                    mode === 'pages'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers size={16} aria-hidden="true" />
                  Extract all pages
                </button>
              </div>

              {/* Mode 1: Split by range */}
              {mode === 'range' && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Range Configuration
                    </span>
                    <div className="flex gap-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setRangeInputType('cards')}
                        disabled={working}
                        className={`rounded px-2.5 py-1 font-medium transition ${
                          rangeInputType === 'cards'
                            ? 'bg-orange-100 text-orange-700'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Visual ranges
                      </button>
                      <button
                        type="button"
                        onClick={() => setRangeInputType('text')}
                        disabled={working}
                        className={`rounded px-2.5 py-1 font-medium transition ${
                          rangeInputType === 'text'
                            ? 'bg-orange-100 text-orange-700'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Text input
                      </button>
                    </div>
                  </div>

                  {rangeInputType === 'cards' ? (
                    <div className="space-y-4">
                      {ranges.map((r, index) => {
                        const toVal = r.to ?? totalPages
                        const pageCount = r.from && toVal && r.from <= toVal && toVal <= totalPages ? toVal - r.from + 1 : 0

                        return (
                          <div
                            key={r.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300"
                          >
                            {/* Range Controls Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">
                                  Range {index + 1}
                                </span>
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                  <span>From page</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={totalPages || 1}
                                    value={r.from}
                                    disabled={working || !totalPages}
                                    onChange={(e) => updateRange(r.id, 'from', e.target.value)}
                                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center font-medium text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                                  />
                                  <span>to</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={totalPages || 1}
                                    value={r.to ?? (totalPages || 1)}
                                    disabled={working || !totalPages}
                                    onChange={(e) => updateRange(r.id, 'to', e.target.value)}
                                    className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-center font-medium text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                                  />
                                  {totalPages > 0 && (
                                    <span className="text-slate-400">of {totalPages}</span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 ml-auto">
                                {pageCount > 0 && (
                                  <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                                    {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                                  </span>
                                )}
                                {ranges.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeRange(r.id)}
                                    disabled={working}
                                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                                    aria-label={`Delete range ${index + 1}`}
                                    title="Delete this range"
                                  >
                                    <Trash2 size={16} aria-hidden="true" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Live Page Preview for this Range */}
                            <div className="mt-3">
                              <RangePreview
                                from={r.from}
                                to={r.to ?? totalPages}
                                totalPages={totalPages}
                                thumbnails={thumbnails}
                              />
                            </div>
                          </div>
                        )
                      })}

                      <button
                        type="button"
                        onClick={addRange}
                        disabled={working || !totalPages}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-400 hover:text-orange-600"
                      >
                        <Plus size={14} aria-hidden="true" /> Add another range
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label htmlFor="range-text-input" className="block text-xs font-medium text-slate-600">
                          Enter page numbers and/or ranges separated by commas:
                        </label>
                        <input
                          id="range-text-input"
                          type="text"
                          value={rangeText}
                          onChange={(e) => setRangeText(e.target.value)}
                          disabled={working || !totalPages}
                          placeholder={totalPages ? `e.g. 1-2, 3-${totalPages}` : 'e.g. 1-3, 4-6'}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                        />
                        <p className="text-xs text-slate-400">
                          Examples: <code className="rounded bg-slate-100 px-1">1-3, 5, 8-{totalPages || 10}</code>
                        </p>
                      </div>

                      {/* Live Preview for Text Input Ranges */}
                      {textParseError ? (
                        <div className="rounded-lg border border-red-200 bg-red-50/70 p-2.5 text-xs text-red-600">
                          {textParseError}
                        </div>
                      ) : textRanges.length > 0 ? (
                        <div className="space-y-3 pt-2 border-t border-slate-100">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Preview of Parsed Ranges ({textRanges.length})
                          </span>
                          <div className="space-y-3">
                            {textRanges.map((tr, idx) => {
                              const fromPage = tr.indices[0] + 1
                              const toPage = tr.indices[tr.indices.length - 1] + 1
                              return (
                                <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-2.5">
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                                        Range {idx + 1}
                                      </span>
                                      <span className="text-xs font-semibold text-slate-700">
                                        {fromPage === toPage ? `Page ${fromPage}` : `Pages ${fromPage}–${toPage}`}
                                      </span>
                                    </div>
                                    <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                      {tr.indices.length} {tr.indices.length === 1 ? 'page' : 'pages'}
                                    </span>
                                  </div>
                                  <RangePreview
                                    from={fromPage}
                                    to={toPage}
                                    totalPages={totalPages}
                                    thumbnails={thumbnails}
                                  />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Option: Merge all ranges */}
                  <label className="flex items-center gap-2 pt-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mergeIntoSingle}
                      onChange={(e) => setMergeIntoSingle(e.target.checked)}
                      disabled={working}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span>Merge all extracted ranges into a single PDF document</span>
                  </label>
                </div>
              )}

              {/* Mode 2: Extract all pages */}
              {mode === 'pages' && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 text-center space-y-4">
                  <div>
                    <FileArchive size={32} className="mx-auto text-orange-500" aria-hidden="true" />
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      Extract each page as an individual PDF
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {totalPages > 0
                        ? `Every page from 1 to ${totalPages} will be saved as its own PDF (${totalPages} files) and packaged into a ZIP.`
                        : 'Each page will be saved as its own PDF and packaged into a ZIP archive.'}
                    </p>
                  </div>

                  {totalPages > 0 && (
                    <div className="pt-2 border-t border-slate-100 text-left">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                        Preview of all pages ({totalPages}):
                      </p>
                      <RangePreview
                        from={1}
                        to={totalPages}
                        totalPages={totalPages}
                        thumbnails={thumbnails}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Working State */}
              {working ? (
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label="Splitting PDF"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    {mode === 'range'
                      ? mergeIntoSingle
                        ? 'Produces 1 combined PDF.'
                        : 'Produces separate PDFs (downloadable as ZIP if > 1).'
                      : `Produces ${totalPages || 'all'} separate PDF files.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleSplit}
                    disabled={!totalPages || fileInfo.isLocked || working}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Split size={18} aria-hidden="true" /> Split PDF
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
