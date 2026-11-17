import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { matchesAccept } from '../lib/files.js'

/**
 * Drag-and-drop / click-to-browse file picker.
 * Calls onFiles(acceptedFiles) and, if some files were the wrong type, onError(message).
 */
export default function DropZone({
  accept = 'application/pdf,.pdf',
  multiple = true,
  onFiles,
  onError,
  label,
  hint,
  compact = false,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handle(fileList) {
    const all = Array.from(fileList || [])
    const accepted = all.filter((f) => matchesAccept(f, accept))
    const rejected = all.length - accepted.length
    if (rejected > 0) {
      onError?.(
        rejected === 1
          ? `1 file was skipped because it is not a supported type.`
          : `${rejected} files were skipped because they are not a supported type.`,
      )
    }
    if (accepted.length > 0) onFiles(multiple ? accepted : accepted.slice(0, 1))
  }

  function open() {
    if (!disabled) inputRef.current?.click()
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (!disabled) handle(e.dataTransfer.files)
      }}
      className={[
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition',
        compact ? 'gap-1 px-4 py-4' : 'gap-2 px-6 py-14',
        dragging ? 'border-orange-500 bg-orange-50' : 'border-slate-300 bg-slate-50 hover:border-orange-400',
        disabled ? 'cursor-not-allowed opacity-50' : '',
      ].join(' ')}
    >
      <Upload size={compact ? 20 : 32} className="text-orange-500" aria-hidden="true" />
      <p className="font-semibold text-slate-700">{label ?? (multiple ? 'Drop PDF files here' : 'Drop a PDF file here')}</p>
      <p className="text-sm text-slate-500">{hint ?? 'or click to choose from your device'}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        data-testid="file-input"
        onChange={(e) => {
          handle(e.target.files)
          e.target.value = '' // allow choosing the same file again
        }}
      />
    </div>
  )
}
