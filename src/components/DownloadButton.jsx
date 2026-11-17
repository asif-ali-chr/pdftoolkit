import { Download } from 'lucide-react'
import { downloadBlob } from '../lib/download.js'
import { formatBytes } from '../lib/files.js'

/**
 * @param {{ blob: Blob, filename: string, label?: string }} props
 */
export default function DownloadButton({ blob, filename, label = 'Download' }) {
  return (
    <button
      type="button"
      onClick={() => downloadBlob(blob, filename)}
      className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300"
    >
      <Download size={18} aria-hidden="true" />
      {label}
      <span className="text-sm font-normal text-orange-100">({formatBytes(blob.size)})</span>
    </button>
  )
}
