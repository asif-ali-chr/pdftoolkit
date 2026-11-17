import { PDFDocument } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'
import { baseName } from '../../lib/files.js'

/**
 * @typedef {Object} SplitRange
 * @property {string} [label] - Label for the range (e.g. "1-3", "page-1")
 * @property {number[]} indices - 0-based page indices to include
 */

/**
 * Split a PDF buffer into one or more PDF buffers based on page ranges.
 * Pure logic: no DOM, runs in a Web Worker or in Node tests.
 *
 * @param {{
 *   file: { name: string, buffer: ArrayBuffer },
 *   ranges: SplitRange[],
 *   mergeIntoSingle?: boolean
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function splitPdfBuffer({ file, ranges, mergeIntoSingle = false }, onProgress = () => {}) {
  if (!file?.buffer) throw new Error('No PDF file provided.')
  if (!ranges || ranges.length === 0) throw new Error('Please specify at least one page or range.')

  const source = await loadPdfDocument(file.buffer, file.name)
  const totalPages = source.getPageCount()
  const base = baseName(file.name)

  if (mergeIntoSingle) {
    const out = await PDFDocument.create()
    out.setProducer('PDF Toolkit')
    out.setCreator('PDF Toolkit')

    let done = 0
    const total = ranges.reduce((acc, r) => acc + (r.indices?.length || 0), 0)

    for (const range of ranges) {
      if (!range.indices || range.indices.length === 0) continue
      for (const idx of range.indices) {
        if (idx < 0 || idx >= totalPages) {
          throw new Error(`Page ${idx + 1} is outside this document (it has ${totalPages} pages).`)
        }
      }
      const pages = await out.copyPages(source, range.indices)
      pages.forEach((page) => out.addPage(page))
      done += range.indices.length
      onProgress(done, Math.max(total, 1))
    }

    const bytes = await out.save()
    return {
      files: [
        {
          name: `${base}-split.pdf`,
          bytes,
        },
      ],
    }
  }

  const files = []
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    if (!range.indices || range.indices.length === 0) continue

    for (const idx of range.indices) {
      if (idx < 0 || idx >= totalPages) {
        throw new Error(`Page ${idx + 1} is outside this document (it has ${totalPages} pages).`)
      }
    }

    const out = await PDFDocument.create()
    out.setProducer('PDF Toolkit')
    out.setCreator('PDF Toolkit')

    const pages = await out.copyPages(source, range.indices)
    pages.forEach((page) => out.addPage(page))

    const bytes = await out.save()
    const labelPart = range.label ? `_${range.label.replace(/[^a-zA-Z0-9_-]/g, '-')}` : `_part_${i + 1}`

    files.push({
      name: `${base}${labelPart}.pdf`,
      bytes,
    })

    onProgress(i + 1, ranges.length)
  }

  if (files.length === 0) {
    throw new Error('No valid pages were selected to split.')
  }

  return { files }
}
