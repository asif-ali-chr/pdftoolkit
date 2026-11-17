import { PDFDocument, degrees } from 'pdf-lib'
import { loadPdfDocument } from '../../lib/pdf.js'
import { baseName } from '../../lib/files.js'

/**
 * @typedef {Object} PageOrganizeConfig
 * @property {number} originalIndex - 0-based index of the page in the original PDF
 * @property {number} rotation - Extra rotation in degrees (e.g. 0, 90, 180, 270)
 */

/**
 * Reorder, rotate, and delete (by exclusion) pages of a PDF buffer.
 * Pure logic: no DOM, runs in a Web Worker or in Node.
 *
 * @param {{
 *   file: { name: string, buffer: ArrayBuffer },
 *   pages: PageOrganizeConfig[]
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function organizePdfBuffer({ file, pages }, onProgress = () => {}) {
  if (!file?.buffer) throw new Error('No PDF file provided.')
  if (!pages || pages.length === 0) throw new Error('The organized PDF must contain at least one page.')

  const source = await loadPdfDocument(file.buffer, file.name)
  const totalOriginalPages = source.getPageCount()
  const base = baseName(file.name)

  const out = await PDFDocument.create()
  out.setProducer('PDF Toolkit')
  out.setCreator('PDF Toolkit')

  for (let i = 0; i < pages.length; i++) {
    const { originalIndex, rotation = 0 } = pages[i]
    if (originalIndex < 0 || originalIndex >= totalOriginalPages) {
      throw new Error(`Original page ${originalIndex + 1} is outside this document (it has ${totalOriginalPages} pages).`)
    }

    const [copiedPage] = await out.copyPages(source, [originalIndex])

    const existingAngle = copiedPage.getRotation().angle || 0
    const normalizedRotation = ((existingAngle + rotation) % 360 + 360) % 360
    copiedPage.setRotation(degrees(normalizedRotation))

    out.addPage(copiedPage)
    onProgress(i + 1, pages.length)
  }

  const bytes = await out.save()

  return {
    files: [
      {
        name: `${base}-organized.pdf`,
        bytes,
      },
    ],
  }
}
