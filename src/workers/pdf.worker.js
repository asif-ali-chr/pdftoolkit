import * as Comlink from 'comlink'
import { mergePdfBuffers } from '../tools/merge/process.js'
import { splitPdfBuffer } from '../tools/split/process.js'
import { organizePdfBuffer } from '../tools/organize/process.js'
import { extractPagesPdfBuffer } from '../tools/extract-pages/process.js'
import { removePagesPdfBuffer } from '../tools/remove-pages/process.js'
import { imagesToPdfBuffer } from '../tools/jpg-to-pdf/process.js'
import { addPageNumbersPdfBuffer } from '../tools/page-numbers/process.js'

/**
 * Registry of operations that can run off the main thread.
 * Each one is a pure function: (payload, report) => Promise<Uint8Array | { files: { name: string, bytes: Uint8Array }[] }>
 * where report(done, total) sends progress back to the page.
 * Add an entry here when a tool gets its logic in `tools/<id>/process.js`.
 * (Heavy, special-purpose jobs such as OCR will get their own worker files.)
 */
const operations = {
  merge: ({ files }, report) => mergePdfBuffers(files, report),
  split: (payload, report) => splitPdfBuffer(payload, report),
  organize: (payload, report) => organizePdfBuffer(payload, report),
  'extract-pages': (payload, report) => extractPagesPdfBuffer(payload, report),
  'remove-pages': (payload, report) => removePagesPdfBuffer(payload, report),
  'jpg-to-pdf': (payload, report) => imagesToPdfBuffer(payload, report),
  'page-numbers': (payload, report) => addPageNumbersPdfBuffer(payload, report),
}

Comlink.expose({
  async run(operation, payload, onProgress) {
    const op = operations[operation]
    if (!op) throw new Error(`Unknown operation: ${operation}`)

    const report = (done, total) => {
      onProgress?.(done, total)
    }
    const result = await op(payload, report)

    // Hand the bytes back without copying (only possible if the view owns its whole buffer).
    if (result instanceof Uint8Array) {
      const owns = result.byteOffset === 0 && result.byteLength === result.buffer.byteLength
      const out = owns ? result : result.slice()
      return Comlink.transfer(out, [out.buffer])
    }

    if (result && Array.isArray(result.files)) {
      const transferables = []
      const files = result.files.map((f) => {
        const bytes = f.bytes
        const owns = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        const out = owns ? bytes : bytes.slice()
        transferables.push(out.buffer)
        return { name: f.name, bytes: out }
      })
      return Comlink.transfer({ files }, transferables)
    }

    return result
  },
})
