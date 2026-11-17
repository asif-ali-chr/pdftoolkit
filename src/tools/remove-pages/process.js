import { PDFDocument } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'
import { baseName } from '../../lib/files.js'

/**
 * Remove selected pages from a PDF document.
 * Pure logic: no DOM, runs in a Web Worker or in Node.
 *
 * @param {{
 *   file: { name: string, buffer: ArrayBuffer },
 *   pagesToRemove: number[] // 0-based page indices to remove
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function removePagesPdfBuffer({ file, pagesToRemove = [] }, onProgress = () => {}) {
  if (!file?.buffer) throw new Error('No PDF file provided.')

  const source = await loadPdfDocument(file.buffer, file.name)
  const totalPages = source.getPageCount()
  const base = baseName(file.name)

  const removeSet = new Set(pagesToRemove)
  const pagesToKeep = []
  for (let i = 0; i < totalPages; i++) {
    if (!removeSet.has(i)) {
      pagesToKeep.push(i)
    }
  }

  if (pagesToKeep.length === 0) {
    throw new Error('You cannot remove all pages. At least one page must remain.')
  }

  if (pagesToKeep.length === totalPages) {
    throw new Error('No pages were marked for removal.')
  }

  const out = await PDFDocument.create()
  out.setProducer('PDF Toolkit')
  out.setCreator('PDF Toolkit')

  const copiedPages = await out.copyPages(source, pagesToKeep)
  copiedPages.forEach((page) => out.addPage(page))

  const bytes = await out.save()
  onProgress(pagesToKeep.length, pagesToKeep.length)

  return {
    files: [
      {
        name: `${base}-pages-removed.pdf`,
        bytes,
      },
    ],
  }
}
