import test from 'node:test'
import assert from 'node:assert/strict'
import tracking from '../data/videoTracking.json'
import {
  filmPhase,
  FILM_FPS,
  LAST_FRAME_TIME,
  rectStyle,
  timeForProgress,
  trackedRect,
  visibleCardRect,
} from './cinema'

test('cards leaving the film cannot become invisible keyboard targets', () => {
  assert.equal(visibleCardRect([-200, 100, 100, 100]), null)
  assert.equal(visibleCardRect([1270, 100, 100, 100]), null)
  assert.deepEqual(visibleCardRect([-30, 100, 100, 100]), [0, 100, 70, 100])
  assert.deepEqual(visibleCardRect([1200, 660, 100, 100]), [1200, 660, 80, 60])
})

test('scroll progress maps to bounded source frames in both directions', () => {
  assert.equal(timeForProgress(0), 0)
  assert.equal(timeForProgress(1), LAST_FRAME_TIME)
  assert.equal(timeForProgress(-10), 0)
  assert.equal(timeForProgress(10), LAST_FRAME_TIME)
  assert.equal(timeForProgress(Number.NaN), 0)
  for (const progress of [0.1, 0.9, 0.5, 0.2]) {
    const time = timeForProgress(progress)
    assert.ok(Math.abs(time * FILM_FPS - Math.round(time * FILM_FPS)) < 0.001)
  }
})

test('reduced motion presents three static, accessible scenes', () => {
  assert.equal(timeForProgress(0.1, true), timeForProgress(0.2, true))
  assert.equal(timeForProgress(0.4, true), 4.5)
  assert.equal(timeForProgress(0.9, true), LAST_FRAME_TIME)
  assert.equal(filmPhase(0), 'listings')
  assert.equal(filmPhase(4.5), 'inspection')
  assert.equal(filmPhase(9.9), 'scanner')
})

test('hotspots interpolate source coordinates and preserve bounds', () => {
  const keys = [
    [0, 100, 100, 200, 200],
    [1, 200, 200, 100, 100],
  ]
  assert.deepEqual(trackedRect(keys, 0.5), [150, 150, 150, 150])
  assert.deepEqual(trackedRect(keys, -1), [100, 100, 200, 200])
  assert.deepEqual(trackedRect(keys, 2), [200, 200, 100, 100])
  assert.deepEqual(rectStyle([640, 360, 128, 72]), {
    left: '50%',
    top: '50%',
    width: '10%',
    height: '10%',
  })
})

test('measured tracks are ordered, finite, and usable throughout their scene', () => {
  for (const keys of [
    ...tracking.cards.map((card) => card.frames),
    tracking.form,
    tracking.ghostDial,
    tracking.scamDial,
  ]) {
    assert.ok(keys.length > 30)
    keys.forEach((key, index) => {
      assert.equal(key.length, 5)
      assert.ok(key.every(Number.isFinite))
      assert.ok(key[3] > 0 && key[4] > 0)
      if (index) assert.ok(key[0] > keys[index - 1][0])
    })
  }
  const finalForm = trackedRect(tracking.form, LAST_FRAME_TIME)
  // Guard against tracking drift that would move the input off the visible film.
  assert.ok(finalForm[0] > 340 && finalForm[0] < 400)
  assert.ok(finalForm[1] > 300 && finalForm[1] < 340)
  assert.ok(finalForm[2] > 490 && finalForm[2] < 590)
})
