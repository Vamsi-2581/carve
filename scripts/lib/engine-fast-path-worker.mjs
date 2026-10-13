// Runs carve-js render scripts for engine-fast-path.mjs, which blocks on
// `signal` so a hung render can be terminated at its deadline.
import * as nodeFs from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { workerData } from 'node:worker_threads'

const { cwd, port, signal } = workerData

function done(message) {
  port.postMessage(message)
  Atomics.store(signal, 0, 1)
  Atomics.notify(signal, 0)
}

let build
try {
  build = await import(pathToFileURL(join(cwd, 'dist/index.js')).href)
} catch (error) {
  done({ ready: false, error: String(error?.message ?? error) })
}

if (build) {
  const compiled = new Map()
  port.on('message', ({ body, argv }) => {
    let fn = compiled.get(body)
    if (!fn) {
      fn = new Function('__dist', '__fs', '__argv', '__write', body)
      compiled.set(body, fn)
    }
    let stdout = ''
    try {
      fn(build, nodeFs, argv, (chunk) => { stdout += chunk })
      done({ status: 0, stdout, stderr: '' })
    } catch (error) {
      done({ status: 1, stdout, stderr: String(error?.stack ?? error) })
    }
  })
  done({ ready: true })
}
