import { useRef, useState } from 'react'
import { Combine, RotateCcw, CheckCircle2 } from 'lucide-react'
import ToolLayout from '../../components/ToolLayout.jsx'
import DropZone from '../../components/DropZone.jsx'
import FileList from '../../components/FileList.jsx'
import ProgressBar from '../../components/ProgressBar.jsx'
import DownloadButton from '../../components/DownloadButton.jsx'
import { useFileList } from '../../hooks/useFileList.js'
import { runJob } from '../../lib/workerClient.js'

export default function MergeTool() {
  const { items, addFiles, removeFile, moveFile, clear } = useFileList()
  const [phase, setPhase] = useState('idle') // 'idle' | 'working' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState(null) // { blob, filename }
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const working = phase === 'working'

  async function handleMerge() {
    setError(null)
    setProgress({ done: 0, total: items.length })
    setPhase('working')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Read the bytes only now, at the moment the job starts.
      const files = await Promise.all(
        items.map(async ({ file }) => ({ name: file.name, buffer: await file.arrayBuffer() })),
      )
      const bytes = await runJob(
        'merge',
        { files },
        {
          signal: controller.signal,
          transfer: files.map((f) => f.buffer),
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )
      setResult({ blob: new Blob([bytes], { type: 'application/pdf' }), filename: 'merged.pdf' })
      setPhase('done')
    } catch (err) {
      setPhase('idle')
      if (err?.name !== 'AbortError') setError(err?.message || 'Something went wrong while merging.')
    }
  }

  function startOver() {
    clear()
    setResult(null)
    setError(null)
    setPhase('idle')
  }

  if (phase === 'done' && result) {
    return (
      <ToolLayout error={error} onDismissError={() => setError(null)}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle2 size={40} className="text-emerald-500" aria-hidden="true" />
          <p className="text-lg font-semibold text-slate-800">Your PDFs are merged</p>
          <DownloadButton blob={result.blob} filename={result.filename} label="Download merged PDF" />
          <button
            type="button"
            onClick={startOver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
          >
            <RotateCcw size={14} aria-hidden="true" /> Merge more files
          </button>
        </div>
      </ToolLayout>
    )
  }

  return (
    <ToolLayout error={error} onDismissError={() => setError(null)}>
      {items.length === 0 ? (
        <DropZone onFiles={addFiles} onError={setError} />
      ) : (
        <>
          <FileList items={items} onRemove={removeFile} onMove={moveFile} disabled={working} />
          <DropZone compact onFiles={addFiles} onError={setError} label="Add more PDFs" disabled={working} />

          {working ? (
            <ProgressBar
              done={progress.done}
              total={progress.total}
              label="Merging"
              onCancel={() => abortRef.current?.abort()}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                {items.length < 2 ? 'Add at least one more PDF.' : 'Drag files to change the order.'}
              </p>
              <button
                type="button"
                onClick={handleMerge}
                disabled={items.length < 2}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Combine size={18} aria-hidden="true" /> Merge PDF
              </button>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
