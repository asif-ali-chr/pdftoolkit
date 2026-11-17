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
  RotateCw,
  RotateCcw,
  Trash2,
  CheckCircle2,
  FileCheck,
  Settings2,
} from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { runJob } from '../../lib/workerClient.js'
import { formatBytes } from '../../lib/files.js'

function SortableImageCard({ item, index, onRotateCw, onRotateCcw, onRemove, disabled }) {
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
      {/* Top Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          Page {index + 1}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(item.id)
          }}
          disabled={disabled}
          title="Remove image"
          aria-label={`Remove image ${index + 1}`}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Draggable Thumbnail Area */}
      <div
        className="relative flex aspect-[3/4] w-full cursor-grab items-center justify-center overflow-hidden rounded-lg bg-slate-50 p-2 border border-slate-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <img
          src={item.url}
          alt={item.file.name}
          style={{
            transform: `rotate(${item.rotation}deg)`,
            transition: 'transform 200ms ease-out',
          }}
          className="max-h-full max-w-full object-contain pointer-events-none drop-shadow-xs"
        />

        {item.rotation !== 0 && (
          <span className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-xs">
            {item.rotation}°
          </span>
        )}

        <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg">
          <span className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm border border-slate-200">
            Drag to reorder
          </span>
        </div>
      </div>

      {/* File details */}
      <p className="mt-2 truncate text-xs font-medium text-slate-700" title={item.file.name}>
        {item.file.name}
      </p>
      <p className="text-[11px] text-slate-400">{formatBytes(item.file.size)}</p>

      {/* Action Controls */}
      <div className="mt-2 flex items-center justify-around border-t border-slate-100 pt-2 text-slate-500">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRotateCcw(item.id)
          }}
          disabled={disabled}
          title="Rotate 90° Left"
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
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40"
        >
          <RotateCw size={13} aria-hidden="true" />
          +90°
        </button>
      </div>
    </div>
  )
}

/**
 * Convert an image file into a JPEG or PNG buffer compatible with pdf-lib.
 * If rotated or not standard JPEG/PNG, draws to an offscreen canvas.
 */
async function processImageBuffer(file, rotation = 0) {
  const isJpg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name)
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name)

  if ((isJpg || isPng) && rotation === 0) {
    return {
      name: file.name,
      buffer: await file.arrayBuffer(),
      type: isPng ? 'png' : 'jpg',
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const rad = (rotation * Math.PI) / 180
      const isRotated90or270 = rotation % 180 !== 0
      const canvas = document.createElement('canvas')
      canvas.width = isRotated90or270 ? img.height : img.width
      canvas.height = isRotated90or270 ? img.width : img.height

      const ctx = canvas.getContext('2d')
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(rad)
      ctx.drawImage(img, -img.width / 2, -img.height / 2)

      canvas.toBlob(
        async (blob) => {
          canvas.width = canvas.height = 0
          if (!blob) return reject(new Error('Failed to process image.'))
          resolve({
            name: file.name,
            buffer: await blob.arrayBuffer(),
            type: 'jpg',
          })
        },
        'image/jpeg',
        0.92,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Could not load image ${file.name}`))
    }
    img.src = url
  })
}

export default function JpgToPdfTool() {
  const [items, setItems] = useState([])
  const [pageSize, setPageSize] = useState('fit') // 'fit' | 'a4' | 'letter'
  const [orientation, setOrientation] = useState('auto') // 'auto' | 'portrait' | 'landscape'
  const [margin, setMargin] = useState('none') // 'none' | 'small' | 'big'

  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename, count }
  const [error, setError] = useState(null)

  const abortRef = useRef(null)
  const createdUrlsRef = useRef([])

  const working = phase === 'working'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  function addImages(files) {
    setError(null)
    const newItems = files.map((file) => {
      const url = URL.createObjectURL(file)
      createdUrlsRef.current.push(url)
      return {
        id: crypto.randomUUID(),
        file,
        url,
        rotation: 0,
      }
    })
    setItems((prev) => [...prev, ...newItems])
  }

  const removeImage = useCallback((id) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((item) => item.id !== id)
    })
  }, [])

  const rotateCw = useCallback((id) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item)),
    )
  }, [])

  const rotateCcw = useCallback((id) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, rotation: (item.rotation - 90 + 360) % 360 } : item)),
    )
  }, [])

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from !== -1 && to !== -1 && from !== to) {
      setItems((prev) => arrayMove(prev, from, to))
    }
  }

  async function handleConvert() {
    if (items.length === 0) {
      setError('Please add at least one image.')
      return
    }

    setError(null)
    setProgress({ done: 0, total: items.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Process images into clean jpg/png buffers (applying any user rotations)
      const processedImages = await Promise.all(
        items.map((item) => processImageBuffer(item.file, item.rotation)),
      )

      const transferBuffers = processedImages.map((img) => img.buffer)

      const res = await runJob(
        'jpg-to-pdf',
        {
          images: processedImages,
          options: {
            pageSize,
            orientation,
            margin,
          },
        },
        {
          signal: controller.signal,
          transfer: transferBuffers,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )

      const outputFiles = res?.files || []
      if (outputFiles.length === 0) {
        throw new Error('No PDF was produced.')
      }

      const single = outputFiles[0]
      const blob = new Blob([single.bytes], { type: 'application/pdf' })
      setResult({ blob, filename: single.name, count: items.length })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong while converting images to PDF.')
      }
    }
  }

  function startOver() {
    createdUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    createdUrlsRef.current = []
    setItems([])
    setResult(null)
    setError(null)
    setPhase('idle')
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle2 size={44} className="text-emerald-500" aria-hidden="true" />
          <div>
            <p className="text-xl font-bold text-slate-800">Your images are converted!</p>
            <p className="mt-1 text-sm text-slate-500">
              Successfully generated a {result.count}-page PDF document ({formatBytes(result.blob.size)}).
            </p>
          </div>
          <div className="mt-2">
            <DownloadButton blob={result.blob} filename={result.filename} label="Download PDF" />
          </div>
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-2"
          >
            <RotateCcw size={14} aria-hidden="true" /> Convert more images
          </button>
        </div>
      </ToolLayout>
    )
  }

  return (
    <ToolLayout error={error} onDismissError={() => setError(null)}>
      {items.length === 0 ? (
        <DropZone
          accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp"
          multiple={true}
          onFiles={addImages}
          onError={setError}
          label="Drop JPG, PNG, or WebP images here"
          hint="or click to choose image files from your device"
        />
      ) : (
        <div className="space-y-5">
          {/* Settings Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Settings2 size={16} className="text-orange-600" aria-hidden="true" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                PDF Page Settings
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Page Size */}
              <div>
                <label htmlFor="page-size-select" className="mb-1 block text-xs font-medium text-slate-600">
                  Page size
                </label>
                <select
                  id="page-size-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  disabled={working}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                >
                  <option value="fit">Fit to Image (Original)</option>
                  <option value="a4">A4 (210 × 297 mm)</option>
                  <option value="letter">US Letter (8.5 × 11 in)</option>
                </select>
              </div>

              {/* Orientation */}
              <div>
                <label htmlFor="orientation-select" className="mb-1 block text-xs font-medium text-slate-600">
                  Orientation
                </label>
                <select
                  id="orientation-select"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value)}
                  disabled={working || pageSize === 'fit'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="auto">Auto (Smart match)</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>

              {/* Margin */}
              <div>
                <label htmlFor="margin-select" className="mb-1 block text-xs font-medium text-slate-600">
                  Margin
                </label>
                <select
                  id="margin-select"
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  disabled={working}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-200"
                >
                  <option value="none">No margin</option>
                  <option value="small">Small margin (0.5 in)</option>
                  <option value="big">Big margin (1.0 in)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Image Cards Grid */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {items.length} {items.length === 1 ? 'Image' : 'Images'} (Drag to change page order)
              </span>
              <button
                type="button"
                onClick={startOver}
                disabled={working}
                className="text-xs font-medium text-slate-500 hover:text-red-600"
              >
                Clear all
              </button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {items.map((item, index) => (
                    <SortableImageCard
                      key={item.id}
                      item={item}
                      index={index}
                      onRotateCw={rotateCw}
                      onRotateCcw={rotateCcw}
                      onRemove={removeImage}
                      disabled={working}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Compact DropZone to add more images */}
          <DropZone
            compact
            multiple={true}
            accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp"
            onFiles={addImages}
            onError={setError}
            label="Add more images"
            disabled={working}
          />

          {/* Working State or Action Bar */}
          {working ? (
            <ProgressBar
              done={progress.done}
              total={progress.total}
              label="Creating PDF from images"
              onCancel={() => abortRef.current?.abort()}
            />
          ) : (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-slate-500">
                {items.length} {items.length === 1 ? 'page' : 'pages'} will be created.
              </p>
              <button
                type="button"
                onClick={handleConvert}
                disabled={items.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <FileCheck size={18} aria-hidden="true" /> Convert to PDF
              </button>
            </div>
          )}
        </div>
      )}
    </ToolLayout>
  )
}
