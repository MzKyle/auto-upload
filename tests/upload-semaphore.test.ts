import assert from 'node:assert/strict'
import test from 'node:test'
import { UploadSemaphore } from '../src/main/utils/upload-semaphore'

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

test('weighted semaphore queues by slot weight and releases cleanly', async () => {
  const semaphore = new UploadSemaphore(4)

  await semaphore.acquire(undefined, 3)
  let queuedResolved = false
  let laterResolved = false
  const queued = semaphore.acquire(undefined, 2).then(() => {
    queuedResolved = true
  })
  const later = semaphore.acquire(undefined, 1).then(() => {
    laterResolved = true
  })
  await tick()

  assert.equal(queuedResolved, false)
  assert.equal(laterResolved, false)
  assert.equal(semaphore.getCurrent(), 3)

  semaphore.release(3)
  await queued
  await later

  assert.equal(queuedResolved, true)
  assert.equal(laterResolved, true)
  assert.equal(semaphore.getCurrent(), 3)

  semaphore.release(3)
  assert.equal(semaphore.getCurrent(), 0)
})

test('weighted semaphore aborts queued acquire without leaking slots', async () => {
  const semaphore = new UploadSemaphore(2)
  const controller = new AbortController()

  await semaphore.acquire(undefined, 2)
  const queued = semaphore.acquire(controller.signal, 1)
  controller.abort()

  await assert.rejects(queued, {
    name: 'AbortError'
  })
  assert.equal(semaphore.getCurrent(), 2)

  semaphore.release(2)
  assert.equal(semaphore.getCurrent(), 0)
})
