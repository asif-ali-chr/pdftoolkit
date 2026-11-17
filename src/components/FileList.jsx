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
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, FileText, Lock } from 'lucide-react'
import { formatBytes } from '../lib/files.js'
import { usePdfPreview } from '../hooks/usePdfPreview.js'

function FileRow({ item, index, onRemove, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  })
  const preview = usePdfPreview(item.file)

  let detail = formatBytes(item.file.size)
  if (preview.status === 'ready') detail += ` · ${preview.pageCount} ${preview.pageCount === 1 ? 'page' : 'pages'}`
  if (preview.status === 'locked') detail += ' · password-protected'
  if (preview.status === 'error') detail += ' · could not read'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-lg border bg-white p-2 ${
        isDragging ? 'relative z-10 border-orange-400 shadow-lg' : 'border-slate-200'
      }`}
    >
      <button
        type="button"
        className="touch-none cursor-grab rounded p-1 text-slate-400 hover:text-slate-700 disabled:cursor-default"
        aria-label={`Reorder ${item.file.name}. Press space, then use arrow keys.`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden="true" />
      </button>

      <span className="w-5 text-center text-sm text-slate-400">{index + 1}</span>

      <div className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-100">
        {preview.status === 'ready' && <img src={preview.url} alt="" className="h-full w-full object-contain" />}
        {preview.status === 'locked' && <Lock size={18} className="text-amber-500" aria-hidden="true" />}
        {(preview.status === 'loading' || preview.status === 'error') && (
          <FileText size={18} className="text-slate-300" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800" title={item.file.name}>
          {item.file.name}
        </p>
        <p className={`text-xs ${preview.status === 'locked' || preview.status === 'error' ? 'text-amber-600' : 'text-slate-500'}`}>
          {detail}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        aria-label={`Remove ${item.file.name}`}
        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </li>
  )
}

/**
 * Sortable list of chosen files.
 * @param {{
 *   items: { id: string, file: File }[],
 *   onRemove: (id: string) => void,
 *   onMove: (from: number, to: number) => void,
 *   disabled?: boolean,
 * }} props
 */
export default function FileList({ items, onRemove, onMove, disabled = false }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    if (from !== -1 && to !== -1) onMove(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" aria-label="Selected files">
          {items.map((item, index) => (
            <FileRow key={item.id} item={item} index={index} onRemove={onRemove} disabled={disabled} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
