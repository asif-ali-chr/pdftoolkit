import JSZip from 'jszip'

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing memory.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Bundle several results into one .zip Blob.
 * @param {{ name: string, data: Blob | Uint8Array | ArrayBuffer }[]} files
 * @returns {Promise<Blob>}
 */
export async function createZip(files) {
  const zip = new JSZip()
  for (const { name, data } of files) zip.file(name, data)
  return zip.generateAsync({ type: 'blob' })
}
