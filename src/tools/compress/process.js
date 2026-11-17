import { PDFDocument } from 'pdf-lib'
import { openPdf, renderPageToBlob } from '../../lib/render.js'
import { baseName } from '../../lib/files.js'

/**
 * @typedef {Object} CompressOptions
 * @property {'extreme' | 'recommended' | 'low' | 'lossless'} [level]
 *           - 'extreme': Max size reduction, lower visual quality (~72-85 DPI, JPEG 0.50)
 *           - 'recommended': Balanced clarity and size (~100-110 DPI, JPEG 0.68)
 *           - 'low': High quality, mild reduction (~130-150 DPI, JPEG 0.82)
 *           - 'lossless': Clean up metadata & use object streams without rasterizing
 * @property {number} [customScale]
 * @property {number} [customQuality]
 */

/**
 * Compress a PDF document completely in the browser.
 *
 * @param {File | { name: string, buffer?: ArrayBuffer, arrayBuffer?: () => Promise<ArrayBuffer> }} file
 * @param {CompressOptions} [options]
 * @param {(done: number, total: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 * @returns {Promise<{
 *   bytes: Uint8Array,
 *   name: string,
 *   originalSize: number,
 *   compressedSize: number,
 *   reductionPercent: number,
 *   method: 'raster' | 'lossless'
 * }>}
 */
export async function compressPdf(file, options = {}, onProgress = () => {}, signal) {
  const { level = 'recommended', customScale, customQuality } = options

  const buffer = file.buffer || (await file.arrayBuffer())
  const originalSize = buffer.byteLength
  const base = baseName(file.name)
  const outputName = `${base}-compressed.pdf`

  // 1. Lossless optimization mode (preserves selectable vector text and fonts)
  if (level === 'lossless') {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    onProgress(0, 1)

    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const bytes = await doc.save({ useObjectStreams: true })
    onProgress(1, 1)

    const compressedSize = bytes.byteLength
    const diff = originalSize - compressedSize
    const reductionPercent = originalSize > 0 ? Math.round((diff / originalSize) * 100) : 0

    return {
      bytes,
      name: outputName,
      originalSize,
      compressedSize,
      reductionPercent,
      method: 'lossless',
    }
  }

  // 2. Recompression presets
  const presetConfig = {
    extreme: { scale: 1.0, quality: 0.50 },
    recommended: { scale: 1.4, quality: 0.68 },
    low: { scale: 1.8, quality: 0.82 },
  }

  const config = presetConfig[level] || presetConfig.recommended
  const scale = customScale || config.scale
  const quality = customQuality || config.quality

  const doc = await openPdf(new Uint8Array(buffer))

  try {
    const { pdf } = doc
    const totalPages = pdf.numPages
    onProgress(0, totalPages)

    const outDoc = await PDFDocument.create()
    outDoc.setProducer('PDF Toolkit')
    outDoc.setCreator('PDF Toolkit')

    for (let p = 1; p <= totalPages; p++) {
      if (signal?.aborted) {
        throw new DOMException('Cancelled', 'AbortError')
      }

      const page = await pdf.getPage(p)
      const baseViewport = page.getViewport({ scale: 1 })
      const pageW = baseViewport.width
      const pageH = baseViewport.height

      const blob = await renderPageToBlob(page, {
        scale,
        type: 'image/jpeg',
        quality,
      })
      page.cleanup()

      const jpgBuffer = await blob.arrayBuffer()
      const embeddedJpg = await outDoc.embedJpg(jpgBuffer)

      const newPage = outDoc.addPage([pageW, pageH])
      newPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
      })

      onProgress(p, totalPages)
    }

    const bytes = await outDoc.save({ useObjectStreams: true })
    let finalBytes = bytes
    let method = 'raster'

    // If rasterizing accidentally made the file larger than the original (e.g. tiny 15KB text-only PDF),
    // attempt lossless compression as a safety net so the user doesn't get a bloated file.
    if (bytes.byteLength >= originalSize) {
      try {
        const losslessDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
        const losslessBytes = await losslessDoc.save({ useObjectStreams: true })
        if (losslessBytes.byteLength < bytes.byteLength) {
          finalBytes = losslessBytes
          method = 'lossless'
        }
      } catch {
        // Keep raster bytes if lossless fallback fails
      }
    }

    const compressedSize = finalBytes.byteLength
    const diff = originalSize - compressedSize
    const reductionPercent = originalSize > 0 ? Math.round((diff / originalSize) * 100) : 0

    return {
      bytes: finalBytes,
      name: outputName,
      originalSize,
      compressedSize,
      reductionPercent,
      method,
    }
  } finally {
    await doc.close()
  }
}
