/*
 * Serve the two engine command shapes the comparison runs thousands of times
 * without starting a process per render, which cost ~156 ms (node) and ~88 ms
 * (php) a call on a CI runner and was most of the formatter job.
 *
 * - carve-js: a `node --input-type=module -e` render script runs in a worker
 *   thread holding the engine's dist build; the caller blocks on it with the
 *   same per-render deadline and the worker is terminated if it passes.
 * - carve-php: `php bin/carve ...` and `php -r ...` go to a warm fork server,
 *   which still gives every render a fresh child.
 *
 * Anything else returns null and the caller spawns as before.
 * CARVE_COMPARE_SPAWN=1 turns the fast path off entirely.
 */
import { closeSync, fstatSync, ftruncateSync, mkdtempSync, openSync, readSync, rmSync, writeSync, constants as fsConstants } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { constants as osConstants, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads'

const disabled = process.env.CARVE_COMPARE_SPAWN === '1'
const here = dirname(fileURLToPath(import.meta.url))
const signalNames = Object.fromEntries(Object.entries(osConstants.signals).map(([name, n]) => [n, name]))
const READY_MS = 30000

export function runFast(cmd, cwd, extraArgs, timeout) {
  if (disabled || !cwd) return null
  if (cmd[0] === 'node') return runJs(cmd, cwd, extraArgs, timeout)
  if (cmd[0] === 'php') return runPhp(cmd, cwd, extraArgs, timeout)
  return null
}

function result(status, stdout, stderr, elapsedMs, signal = null) {
  return {
    ok: status === 0,
    status,
    stdout: stdout.trim(),
    rawStdout: stdout,
    stderr: stderr.trim(),
    elapsedMs,
    error: undefined,
    signal,
  }
}

const jsBodies = new Map()
const jsWorkers = new Map()

// The script body with its imports and `process` uses turned into parameters,
// or null for a script this path does not understand.
function jsBody(script) {
  if (jsBodies.has(script)) return jsBodies.get(script)
  const imports = []
  const body = script.replace(/import\s*\{([^}]*)\}\s*from\s*'([^']+)';?/g, (_, names, from) => {
    imports.push(from)
    const binding = from === 'node:fs' ? '__fs' : '__dist'
    return `const {${names.replace(/\s+as\s+/g, ': ')}} = ${binding};`
  }).replace(/process\.argv/g, '__argv').replace(/process\.stdout\.write\(/g, '__write(')
  const known = imports.every((from) => from === 'node:fs' || from === './dist/index.js')
  const usable = known && !/\bprocess\b|\bimport\b|\bawait\b|\brequire\b/.test(body)
  jsBodies.set(script, usable ? body : null)
  return jsBodies.get(script)
}

// Blocks until the worker answers or the deadline passes (null).
function callWorker(worker, message, timeout) {
  Atomics.store(worker.signal, 0, 0)
  if (message) worker.port.postMessage(message)
  if (Atomics.wait(worker.signal, 0, 0, timeout) === 'timed-out') return null
  return receiveMessageOnPort(worker.port)?.message ?? null
}

function jsWorker(cwd) {
  const existing = jsWorkers.get(cwd)
  if (existing !== undefined) return existing
  const signal = new Int32Array(new SharedArrayBuffer(4))
  const { port1, port2 } = new MessageChannel()
  const thread = new Worker(join(here, 'engine-fast-path-worker.mjs'), {
    workerData: { cwd, port: port2, signal },
    transferList: [port2],
  })
  thread.unref()
  let worker = { thread, port: port1, signal }
  // A build the worker cannot import is spawned instead.
  if (!callWorker(worker, null, READY_MS)?.ready) {
    thread.terminate()
    worker = null
  }
  jsWorkers.set(cwd, worker)
  return worker
}

function runJs(cmd, cwd, extraArgs, timeout) {
  if (cmd.length !== 4 || cmd[1] !== '--input-type=module' || cmd[2] !== '-e') return null
  const body = jsBody(cmd[3])
  const worker = body && jsWorker(cwd)
  if (!worker) return null
  const started = process.hrtime.bigint()
  const reply = callWorker(worker, { body, argv: ['node', ...extraArgs] }, timeout)
  if (!reply) {
    worker.thread.terminate()
    jsWorkers.delete(cwd)
    return result(null, '', '', elapsed(started), 'SIGTERM')
  }
  return result(reply.status, reply.stdout, reply.stderr, elapsed(started))
}

const phpServers = new Map()

function phpServer(cwd) {
  const existing = phpServers.get(cwd)
  if (existing !== undefined) return existing
  let server = null
  const probe = spawnSync('php', ['-r', 'exit(function_exists("pcntl_fork") ? 0 : 3);'], { cwd })
  if (probe.status === 0) {
    const dir = mkdtempSync(join(tmpdir(), 'carve-php-fork-'))
    const fifo = (name) => {
      const path = join(dir, name)
      if (spawnSync('mkfifo', [path]).status !== 0) throw new Error(`mkfifo ${path} failed`)
      return path
    }
    const requests = fifo('requests')
    const statuses = fifo('statuses')
    const requestFd = openSync(requests, fsConstants.O_RDWR)
    const statusFd = openSync(statuses, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
    const statusWriteFd = openSync(statuses, fsConstants.O_WRONLY)
    const outFd = openSync(join(dir, 'stdout'), 'a+')
    const errFd = openSync(join(dir, 'stderr'), 'a+')
    const child = spawn('php', [join(here, 'php-fork-server.php')], {
      cwd,
      detached: true,
      stdio: [requestFd, outFd, errFd, statusWriteFd],
    })
    child.unref()
    closeSync(statusWriteFd)
    server = { child, dir, requestFd, statusFd, outFd, errFd, pending: '' }
    // No vendor/ or a broken autoloader: this checkout is spawned instead.
    if (readStatusLine(server, Date.now() + READY_MS) !== 'ready') {
      stopPhpServer(server)
      server = null
    }
  }
  phpServers.set(cwd, server)
  return server
}

function stopPhpServer(server) {
  try { process.kill(-server.child.pid, 'SIGKILL') } catch {}
  for (const fd of [server.requestFd, server.statusFd, server.outFd, server.errFd]) {
    try { closeSync(fd) } catch {}
  }
  rmSync(server.dir, { recursive: true, force: true })
}

process.on('exit', () => {
  for (const server of phpServers.values()) if (server) stopPhpServer(server)
})

const sleeper = new Int32Array(new SharedArrayBuffer(4))

// One status line, or null on timeout / a server that went away.
function readStatusLine(server, deadline) {
  const buffer = Buffer.alloc(256)
  while (!server.pending.includes('\n')) {
    let n
    try {
      n = readSync(server.statusFd, buffer, 0, buffer.length, null)
    } catch (error) {
      if (error.code !== 'EAGAIN') throw error
      if (Date.now() > deadline) return null
      Atomics.wait(sleeper, 0, 0, 1)
      continue
    }
    if (n === 0) return null
    server.pending += buffer.toString('utf8', 0, n)
  }
  const at = server.pending.indexOf('\n')
  const line = server.pending.slice(0, at)
  server.pending = server.pending.slice(at + 1)
  return line
}

function drain(fd) {
  const size = fstatSync(fd).size
  const buffer = Buffer.alloc(size)
  let read = 0
  while (read < size) read += readSync(fd, buffer, read, size - read, read)
  ftruncateSync(fd, 0)
  return buffer.toString('utf8')
}

function runPhp(cmd, cwd, extraArgs, timeout) {
  let request
  if (cmd.length >= 2 && cmd[1] === 'bin/carve') {
    request = { argv: [...cmd.slice(1), ...extraArgs] }
  } else if (cmd.length === 3 && cmd[1] === '-r') {
    request = { argv: ['Standard input code', ...extraArgs], code: cmd[2] }
  } else {
    return null
  }
  // bin/carve reads stdin without a file argument, and stdin is the request pipe.
  if (extraArgs.length === 0) return null
  const server = phpServer(cwd)
  if (!server) return null
  const started = process.hrtime.bigint()
  writeSync(server.requestFd, JSON.stringify(request) + '\n')
  const deadline = Date.now() + timeout
  const line = readStatusLine(server, deadline)
  if (line === null) {
    const timedOut = Date.now() > deadline
    stopPhpServer(server)
    if (!timedOut) {
      // The server itself died: spawn this render and every later one.
      phpServers.set(cwd, null)
      return null
    }
    phpServers.delete(cwd)
    return result(null, '', '', elapsed(started), 'SIGTERM')
  }
  const [code, signal] = line.split(' ').map(Number)
  const stdout = drain(server.outFd)
  const stderr = drain(server.errFd)
  if (signal) return result(null, stdout, stderr, elapsed(started), signalNames[signal] ?? `signal ${signal}`)
  return result(code, stdout, stderr, elapsed(started))
}

function elapsed(started) {
  return Number(process.hrtime.bigint() - started) / 1_000_000
}
