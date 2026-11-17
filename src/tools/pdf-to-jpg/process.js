import { openPdf, renderPageToBlob } from '../../lib/render.js'
import { baseName } from '../../lib/files.js'

/**
 * @typedef {Object} PdfToJpgOptions
 * @property {number[]} [pageIndices] - 0-based page indices to export (defaults to all)
 * @property {'jpeg' | 'png'} [format] - 'jpeg' or 'png'
 * @property {'standard' | 'high' | 'ultra'} [dpi] - 'standard' (1.5x), 'high' (2.0x), 'ultra' (3.0x)
 * @property {number} [quality] - JPEG quality (0.1 to 1.0)
 */

/**
 * Convert pages of a PDF into high-resolution image Blobs.
 *
 * @param {File | { name: string, buffer?: ArrayBuffer, arrayBuffer?: () => Promise<ArrayBuffer> }} file
 * @param {PdfToJpgOptions} [options]
 * @param {(done: number, total: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ files: Array<{ name: string, data: Blob, url: string, pageNumber: number }> }>}
 */
export async function convertPdfToImages(file, options = {}, onProgress = () => {}, signal) {
  const {
    pageIndices,
    format = 'jpeg',
    dpi = 'high',
    quality = 0.92,
  } = options

  const scaleMap = {
    standard: 1.5,
    high: 2.0,
    ultra: 3.0,
  }
  const scale = scaleMap[dpi] || 2.0
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg'
  const ext = format === 'png' ? 'png' : 'jpg'
  const base = baseName(file.name)

  const buffer = file.buffer || (await file.arrayBuffer())
  const data = new Uint8Array(buffer)

  const doc = await openPdf(data)
  const files = []

  try {
    const { pdf } = doc
    const totalPages = pdf.numPages
    const targetIndices =
      pageIndices && pageIndices.length > 0
        ? pageIndices
        : Array.from({ length: totalPages }, (_, i) => i)

    for (let i = 0; i < targetIndices.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Cancelled', 'AbortError')
      }

      const p = targetIndices[i]
      if (p < 0 || p >= totalPages) continue

      const page = await pdf.getPage(p + 1)
      const blob = await renderPageToBlob(page, { scale, type: mimeType, quality })
      page.cleanup()

      const url = URL.createObjectURL(blob)
      files.push({
        name: `${base}-page-${p + 1}.${ext}`,
        data: blob,
        url,
        pageNumber: p + 1,
      })

      onProgress(i + 1, targetIndices.length)
    }

    return { files }
  } finally {
    await doc.close()
  }
}
