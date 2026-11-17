import * as Comlink from 'comlink'

/**
 * Run an operation from `workers/pdf.worker.js` off the main thread.
 *
 * - `onProgress(done, total)` is called as the job advances.
 * - Pass an AbortSignal to cancel: the worker is terminated and the promise
 *   rejects with an error whose name is "AbortError".
 * - `transfer` lists ArrayBuffers inside `payload` to move (not copy) to the worker.
 *   They become unusable on this side afterwards.
 *
 * A fresh worker is created for every job and terminated afterwards, so memory
 * is fully released when the job ends.
 *
 * @param {string} operation
 * @param {object} payload
 * @param {{ onProgress?: (done: number, total: number) => void, signal?: AbortSignal, transfer?: Transferable[] }} [options]
 * @returns {Promise<any>}
 */
export function runJob(operation, payload, { onProgress, signal, transfer = [] } = {}) {
  const worker = new Worker(new URL('../workers/pdf.worker.js', import.meta.url), { type: 'module' })
  const api = Comlink.wrap(worker)

  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    function onAbort() {
      finish()
      reject(new DOMException('Cancelled', 'AbortError'))
    }

    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort)

    api
      .run(operation, Comlink.transfer(payload, transfer), onProgress ? Comlink.proxy(onProgress) : undefined)
      .then(resolve, reject)
      .finally(finish)
  })
}
