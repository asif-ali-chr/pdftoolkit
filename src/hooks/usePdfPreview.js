import { useEffect, useState } from 'react'
import { renderThumbnail } from '../lib/render.js'

const LOADING = { status: 'loading', url: null, pageCount: null }

/**
 * Renders page 1 of a PDF file as a small thumbnail and reports its page count.
 * Frees the thumbnail's memory automatically when the component unmounts.
 * @param {File} file
 */
export function usePdfPreview(file) {
  const [preview, setPreview] = useState(LOADING)

  useEffect(() => {
    let cancelled = false
    let objectUrl = null

    renderThumbnail(file).then((result) => {
      if (cancelled) {
        if (result.url) URL.revokeObjectURL(result.url)
        return
      }
      objectUrl = result.url
      setPreview(result)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  return preview
}
