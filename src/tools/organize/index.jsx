import { useEffect, useRef, useState, useCallback } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  LayoutGrid,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Redo2,
  CheckCircle2,
  RefreshCw,
  Lock,
  FileText,
  AlertCircle,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { renderAllThumbnails } from '../../lib/render.js'
import { runJob } from '../../lib/workerClient.js'
import { formatBytes } from '../../lib/files.js'

function SortablePageCard({ item, index, onRotateCw, onRotateCcw, onDelete, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col rounded-xl border bg-white p-2.5 shadow-sm transition select-none ${
        isDragging
          ? 'z-30 border-orange-500 shadow-xl ring-2 ring-orange-400 opacity-90 scale-105'
          : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Top Header Bar */}
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          #{index + 1}
          {item.originalIndex !== index && (
            <span className="font-normal text-slate-400 text-[10px]">
              (orig #{item.originalIndex + 1})
            </span>
          )}
        </span>

        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete(item.id)
          }}
          disabled={disabled}
          title="Delete page"
          aria-label={`Delete page ${index + 1}`}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Thumbnail Area - Draggable */}
      <div
        className="relative flex aspect-[3/4] w-full cursor-grab items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2 border border-slate-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <img
          src={item.url}
          alt={`Page ${index + 1}`}
          style={{
            transform: `rotate(${item.rotation}deg)`,
            transition: 'transform 200ms ease-out',
          }}
          className="max-h-full max-w-full object-contain pointer-events-none drop-shadow-xs"
        />

        {/* Rotation indicator badge */}
        {item.rotation !== 0 && (
          <span className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
            {item.rotation}°
          </span>
        )}

        {/* Hover Hint */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg">
          <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm border border-slate-200">
            Drag to move
          </span>
        </div>
      </div>

      {/* Bottom Action Controls */}
      <div className="mt-2.5 flex items-center justify-around border-t border-slate-100 pt-2 text-slate-500">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRotateCcw(item.id)
          }}
          disabled={disabled}
          title="Rotate 90° Left"
          aria-label={`Rotate page ${index + 1} 90 degrees left`}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
        >
          <RotateCcw size={13} aria-hidden="true" />
          -90°
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRotateCw(item.id)
          }}
          disabled={disabled}
          title="Rotate 90° Right"
          aria-label={`Rotate page ${index + 1} 90 degrees right`}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
        >
          <RotateCw size={13} aria-hidden="true" />
          +90°
        </button>
      </div>
    </div>
  )
}

export default function OrganizeTool() {
  const [file, setFile] = useState(null)
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })
  const [fileInfo, setFileInfo] = useState({ isLocked: false, totalPages: 0 })

  // History state for full Undo / Redo support
  const [history, setHistory] = useState({
    past: [],
    present: [],
    future: [],
  })

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const renderAbortRef = useRef(null)
  const createdUrlsRef = useRef([])
  const initialPagesRef = useRef([])

  const working = phase === 'working'
  const pages = history.present
  const canUndo = history.past.length > 0 && !working && !loadingThumbnails
  const canRedo = history.future.length > 0 && !working && !loadingThumbnails

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Commit a change to history (supporting undo/redo)
  const commitChange = useCallback((updater) => {
    setHistory((curr) => {
      const nextPresent = typeof updater === 'function' ? updater(curr.present) : updater
      return {
        past: [...curr.past, curr.present].slice(-50), // keep last 50 actions
        present: nextPresent,
        future: [],
      }
    })
  }, [])

  const handleUndo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr
      const previous = curr.past[curr.past.length - 1]
      const newPast = curr.past.slice(0, curr.past.length - 1)
      const newFuture = [curr.present, ...curr.future]
      return {
        past: newPast,
        present: previous,
        future: newFuture,
      }
    })
  }, [])

  const handleRedo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr
      const next = curr.future[0]
      const newFuture = curr.future.slice(1)
      const newPast = [...curr.past, curr.present]
      return {
        past: newPast,
        present: next,
        future: newFuture,
      }
    })
  }, [])

  // Keyboard shortcut listener for Cmd+Z / Ctrl+Z and Redo
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod) return

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault()
          handleRedo()
        } else {
          e.preventDefault()
          handleUndo()
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  // Clean up object URLs when unmounting
  useEffect(() => {
    return () => {
      renderAbortRef.current?.abort()
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function cleanupUrls() {
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    createdUrlsRef.current = []
    initialPagesRef.current = []
  }

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return
    setError(null)
    cleanupUrls()
    setFile(selectedFile)
    setHistory({ past: [], present: [], future: [] })
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
        const loadedPages = res.thumbnails.map((url, i) => ({
          id: crypto.randomUUID(),
          originalIndex: i,
          url,
          rotation: 0,
        }))
        initialPagesRef.current = loadedPages
        setHistory({ past: [], present: loadedPages, future: [] })
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
    setHistory({ past: [], present: [], future: [] })
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  // Page mutation handlers
  function handleRotateCw(id) {
    commitChange((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
    )
  }

  function handleRotateCcw(id) {
    commitChange((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: (p.rotation - 90 + 360) % 360 } : p)),
    )
  }

  function handleDeletePage(id) {
    commitChange((prev) => prev.filter((p) => p.id !== id))
  }

  function handleRotateAllCw() {
    commitChange((prev) =>
      prev.map((p) => ({ ...p, rotation: (p.rotation + 90) % 360 })),
    )
  }

  function handleRotateAllCcw() {
    commitChange((prev) =>
      prev.map((p) => ({ ...p, rotation: (p.rotation - 90 + 360) % 360 })),
    )
  }

  function handleReset() {
    if (initialPagesRef.current.length > 0) {
      commitChange(initialPagesRef.current)
    }
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = history.present.findIndex((i) => i.id === active.id)
    const to = history.present.findIndex((i) => i.id === over.id)
    if (from !== -1 && to !== -1 && from !== to) {
      commitChange((prev) => arrayMove(prev, from, to))
    }
  }

  async function handleOrganize() {
    if (pages.length === 0) {
      setError('You must keep at least one page in the document.')
      return
    }

    setError(null)
    setProgress({ done: 0, total: pages.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const buffer = await file.arrayBuffer()
      const payload = {
        file: { name: file.name, buffer },
        pages: pages.map((p) => ({
          originalIndex: p.originalIndex,
          rotation: p.rotation,
        })),
      }

      const res = await runJob('organize', payload, {
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
      setResult({ blob, filename: single.name })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while organizing the PDF.')
      }
    }
  }

  function startOver() {
    renderAbortRef.current?.abort()
    cleanupUrls()
    setFile(null)
    setResult(null)
    setError(null)
    setHistory({ past: [], present: [], future: [] })
    setFileInfo({ isLocked: false, totalPages: 0 })
    setPhase('idle')
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Your PDF is organized!</p>
            <p className="mt-1 text-sm text-slate-500">
              Successfully reordered, rotated, and filtered to {pages.length}{' '}
              {pages.length === 1 ? 'page' : 'pages'}.
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton blob={result.blob} filename={result.filename} label="Download organized PDF" />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Organize another PDF
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
                  {fileInfo.totalPages > 0 && ` · ${fileInfo.totalPages} original pages`}
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
              <span>This file is password-protected. Please unlock it before organizing.</span>
            </div>
          )}

          {loadingThumbnails && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
              <RefreshCw size={28} className="mx-auto animate-spin text-orange-500" aria-hidden="true" />
              <p className="font-semibold text-slate-800">Generating page thumbnails...</p>
              <p className="text-xs text-slate-500">
                Rendered {thumbProgress.done} of {thumbProgress.total || '...'} pages
              </p>
            </div>
          )}

          {!fileInfo.isLocked && !loadingThumbnails && (
            <>
              {/* Toolbar: Undo, Redo, Bulk Rotate, Reset */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="flex items-center gap-1.5">
                  {/* Undo Button */}
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    title="Undo (⌘Z / Ctrl+Z)"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Undo2 size={15} aria-hidden="true" />
                    Undo
                  </button>

                  {/* Redo Button */}
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    title="Redo (⌘⇧Z / Ctrl+Y)"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Redo2 size={15} aria-hidden="true" />
                    Redo
                  </button>

                  <div className="h-4 w-px bg-slate-200 mx-1" aria-hidden="true" />

                  {/* Rotate All Left */}
                  <button
                    type="button"
                    onClick={handleRotateAllCcw}
                    disabled={pages.length === 0 || working}
                    title="Rotate all pages 90° left"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    Rotate all left
                  </button>

                  {/* Rotate All Right */}
                  <button
                    type="button"
                    onClick={handleRotateAllCw}
                    disabled={pages.length === 0 || working}
                    title="Rotate all pages 90° right"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCw size={14} aria-hidden="true" />
                    Rotate all right
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Reset pages button */}
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={pages.length === 0 || working}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    Reset
                  </button>

                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                    {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                  </span>
                </div>
              </div>

              {/* Drag and Drop Grid */}
              {pages.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-700">All pages have been deleted</p>
                  <p className="text-xs text-slate-500">
                    Use Undo or click Reset below to restore your original pages.
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-700"
                  >
                    <RotateCcw size={14} aria-hidden="true" /> Restore all pages
                  </button>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {pages.map((page, index) => (
                        <SortablePageCard
                          key={page.id}
                          item={page}
                          index={index}
                          onRotateCw={handleRotateCw}
                          onRotateCcw={handleRotateCcw}
                          onDelete={handleDeletePage}
                          disabled={working}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Working State or Action Bar */}
              {working ? (
                <ProgressBar
                  done={progress.done}
                  total={progress.total}
                  label="Organizing PDF"
                  onCancel={() => abortRef.current?.abort()}
                />
              ) : (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-500">
                    Drag thumbnails to reorder. Use Undo / Redo (⌘Z / ⌘⇧Z) at any time.
                  </p>
                  <button
                    type="button"
                    onClick={handleOrganize}
                    disabled={pages.length === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <LayoutGrid size={18} aria-hidden="true" /> Organize PDF
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
