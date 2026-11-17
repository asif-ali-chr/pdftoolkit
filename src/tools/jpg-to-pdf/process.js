import { PDFDocument, PageSizes } from 'pdf-lib'
import { baseName } from '../../lib/files.js'

/**
 * @typedef {Object} JpgToPdfImageItem
 * @property {string} name
 * @property {ArrayBuffer} buffer
 * @property {'jpg' | 'png'} type
 */

/**
 * @typedef {Object} JpgToPdfOptions
 * @property {'fit' | 'a4' | 'letter'} [pageSize] - 'fit', 'a4', 'letter'
 * @property {'auto' | 'portrait' | 'landscape'} [orientation] - 'auto', 'portrait', 'landscape'
 * @property {'none' | 'small' | 'big'} [margin] - 'none' (0), 'small' (20), 'big' (40)
 */

/**
 * Convert an array of image buffers to a single PDF document.
 * Pure logic: no DOM, runs in a Web Worker or in Node.
 *
 * @param {{
 *   images: JpgToPdfImageItem[],
 *   options?: JpgToPdfOptions
 * }} payload
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{ files: { name: string, bytes: Uint8Array }[] }>}
 */
export async function imagesToPdfBuffer({ images, options = {} }, onProgress = () => {}) {
  if (!images || images.length === 0) throw new Error('Choose at least one image.')

  const { pageSize = 'fit', orientation = 'auto', margin = 'none' } = options

  const marginMap = {
    none: 0,
    small: 20,
    big: 40,
  }
  const marginPt = marginMap[margin] ?? 0

  const doc = await PDFDocument.create()
  doc.setProducer('PDF Toolkit')
  doc.setCreator('PDF Toolkit')

  for (let i = 0; i < images.length; i++) {
    const item = images[i]
    let embeddedImg
    if (item.type === 'png') {
      embeddedImg = await doc.embedPng(item.buffer)
    } else {
      embeddedImg = await doc.embedJpg(item.buffer)
    }

    const imgWidth = embeddedImg.width
    const imgHeight = embeddedImg.height

    if (pageSize === 'fit') {
      // Fit to image dimensions + optional margins
      const pageW = imgWidth + marginPt * 2
      const pageH = imgHeight + marginPt * 2
      const page = doc.addPage([pageW, pageH])
      page.drawImage(embeddedImg, {
        x: marginPt,
        y: marginPt,
        width: imgWidth,
        height: imgHeight,
      })
    } else {
      // Standard page sizes (A4 or Letter)
      const baseSize = pageSize === 'letter' ? PageSizes.Letter : PageSizes.A4
      const [w, h] = baseSize

      // Determine orientation
      const isLandscape =
        orientation === 'landscape'
          ? true
          : orientation === 'portrait'
            ? false
            : imgWidth > imgHeight

      const pageW = isLandscape ? Math.max(w, h) : Math.min(w, h)
      const pageH = isLandscape ? Math.min(w, h) : Math.max(w, h)

      const boxW = Math.max(pageW - marginPt * 2, 10)
      const boxH = Math.max(pageH - marginPt * 2, 10)

      const scale = Math.min(boxW / imgWidth, boxH / imgHeight)
      const drawW = imgWidth * scale
      const drawH = imgHeight * scale

      const x = marginPt + (boxW - drawW) / 2
      const y = marginPt + (boxH - drawH) / 2

      const page = doc.addPage([pageW, pageH])
      page.drawImage(embeddedImg, {
        x,
        y,
        width: drawW,
        height: drawH,
      })
    }

    onProgress(i + 1, images.length)
  }

  const bytes = await doc.save()
  const firstBase = baseName(images[0]?.name || 'images')

  return {
    files: [
      {
        name: `${firstBase}.pdf`,
        bytes,
      },
    ],
  }
}
