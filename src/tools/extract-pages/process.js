import { PDFDocument } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'
import { baseName } from '../../lib/files.js'

/**
 * Extract selected pages from a PDF.
 * Pure logic: no DOM, runs in a Web Worker or in Node.
 *
 * @param {{
 *   file: { name: string, buffer: ArrayBuffer },
 *   pageIndices: number[], // 0-based page indices
 *   separateFiles?: boolean // if true, produce 1 PDF per selected page; else 1 combined PDF
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function extractPagesPdfBuffer({ file, pageIndices, separateFiles = false }, onProgress = () => {}) {
  if (!file?.buffer) throw new Error('No PDF file provided.')
  if (!pageIndices || pageIndices.length === 0) throw new Error('Select at least one page to extract.')

  const source = await loadPdfDocument(file.buffer, file.name)
  const totalPages = source.getPageCount()
  const base = baseName(file.name)

  for (const idx of pageIndices) {
    if (idx < 0 || idx >= totalPages) {
      throw new Error(`Page ${idx + 1} is outside this document (it has ${totalPages} pages).`)
    }
  }

  if (separateFiles) {
    const files = []
    for (let i = 0; i < pageIndices.length; i++) {
      const idx = pageIndices[i]
      const out = await PDFDocument.create()
      out.setProducer('PDF Toolkit')
      out.setCreator('PDF Toolkit')

      const [copiedPage] = await out.copyPages(source, [idx])
      out.addPage(copiedPage)

      const bytes = await out.save()
      files.push({
        name: `${base}-page-${idx + 1}.pdf`,
        bytes,
      })
      onProgress(i + 1, pageIndices.length)
    }
    return { files }
  }

  // Combined single PDF
  const out = await PDFDocument.create()
  out.setProducer('PDF Toolkit')
  out.setCreator('PDF Toolkit')

  const copiedPages = await out.copyPages(source, pageIndices)
  copiedPages.forEach((page) => out.addPage(page))

  const bytes = await out.save()
  onProgress(pageIndices.length, pageIndices.length)

  return {
    files: [
      {
        name: `${base}-extracted.pdf`,
        bytes,
      },
    ],
  }
}
