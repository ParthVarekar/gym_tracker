const LANDMARK = Object.freeze({
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24
});

const BUFFER_SIZE = 30;
const MIN_VISIBILITY = 0.1;
const BASE_THRESHOLD = 0.04;
const MIN_THRESHOLD = 0.01;
const MAX_GESTURE_TIME_MS = 3500;
const CHIN_HOLD_MS = 800;
const COOLDOWN_MS = 3000;
const MIN_BASELINE_SAMPLES = 6;

const GESTURE_STATE = Object.freeze({
  NEUTRAL: "NEUTRAL",
  STEP_1: "STEP_1",
  STEP_2: "STEP_2",
  STEP_3: "STEP_3",
  STEP_4: "STEP_4"
});

let trackingActive = false;
let gestureState = GESTURE_STATE.NEUTRAL;
let gestureStartTime = 0;
let cooldownUntil = 0;
let chinHoldStart = 0;
let gestureDirection = 0;

const headBuffer = new Float32Array(BUFFER_SIZE);
let headCount = 0;
let headIndex = 0;

const medianScratch = new Array(BUFFER_SIZE);

function visibilityOf(point) {
  if (!point) {
    return 0;
  }
  return Number.isFinite(point.visibility) ? point.visibility : 1;
}

function isPointUsable(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function isVisible(point) {
  return isPointUsable(point) && visibilityOf(point) >= MIN_VISIBILITY;
}

function midpoint(a, b) {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5
  };
}

function dot(ax, ay, bx, by) {
  return ax * bx + ay * by;
}

function computeNormalizedHeadOffset(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length <= LANDMARK.RIGHT_HIP) {
    return null;
  }

  const nose = landmarks[LANDMARK.NOSE];
  const leftShoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const rightShoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const leftHip = landmarks[LANDMARK.LEFT_HIP];
  const rightHip = landmarks[LANDMARK.RIGHT_HIP];

  if (!isVisible(nose) || !isVisible(leftShoulder) || !isVisible(rightShoulder)) {
    return null;
  }

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const shoulderSpan = Math.hypot(
    rightShoulder.x - leftShoulder.x,
    rightShoulder.y - leftShoulder.y
  );

  if (!Number.isFinite(shoulderSpan) || shoulderSpan < 1e-5) {
    return null;
  }

  const hipsVisible = isVisible(leftHip) && isVisible(rightHip);
  if (!hipsVisible) {
    return (nose.y - shoulderMid.y) / shoulderSpan;
  }

  const hipMid = midpoint(leftHip, rightHip);
  const torsoX = shoulderMid.x - hipMid.x;
  const torsoY = shoulderMid.y - hipMid.y;
  const torsoLength = Math.hypot(torsoX, torsoY);

  if (!Number.isFinite(torsoLength) || torsoLength < 1e-5) {
    return (nose.y - shoulderMid.y) / shoulderSpan;
  }

  const unitX = torsoX / torsoLength;
  const unitY = torsoY / torsoLength;
  const headVecX = nose.x - shoulderMid.x;
  const headVecY = nose.y - shoulderMid.y;
  const headOffset = dot(headVecX, headVecY, unitX, unitY);

  return headOffset / torsoLength;
}

function pushHeadSample(value) {
  headBuffer[headIndex] = value;
  headIndex = (headIndex + 1) % BUFFER_SIZE;
  headCount = Math.min(BUFFER_SIZE, headCount + 1);
}

function computeMedian() {
  if (!headCount) {
    return 0;
  }

  for (let i = 0; i < headCount; i += 1) {
    medianScratch[i] = headBuffer[i];
  }

  medianScratch.length = headCount;
  medianScratch.sort((a, b) => a - b);

  const mid = Math.floor(headCount * 0.5);
  if (headCount % 2 === 0) {
    return (medianScratch[mid - 1] + medianScratch[mid]) * 0.5;
  }
  return medianScratch[mid];
}

function computeAdaptiveThreshold() {
  if (headCount < 4) {
    return BASE_THRESHOLD;
  }

  for (let i = 0; i < headCount; i += 1) {
    medianScratch[i] = headBuffer[i];
  }

  medianScratch.length = headCount;
  medianScratch.sort((a, b) => a - b);

  const lowIdx = Math.floor((headCount - 1) * 0.25);
  const highIdx = Math.floor((headCount - 1) * 0.75);
  const spread = Math.abs(medianScratch[highIdx] - medianScratch[lowIdx]);
  const adaptive = spread * 0.6;
  return Math.max(MIN_THRESHOLD, Math.min(BASE_THRESHOLD, adaptive || BASE_THRESHOLD));
}

function resetGestureState() {
  gestureState = GESTURE_STATE.NEUTRAL;
  gestureStartTime = 0;
  chinHoldStart = 0;
  gestureDirection = 0;
}

function activateTracking(timestamp) {
  trackingActive = true;
  cooldownUntil = timestamp + COOLDOWN_MS;
  resetGestureState();
}

function headZone(head, nodDown, nodUp) {
  if (head < nodDown) {
    return -1;
  }
  if (head > nodUp) {
    return 1;
  }
  return 0;
}

function expectedZoneForStep(step, direction) {
  // direction = first crossing sign (+1 or -1), then alternate each step.
  if (step % 2 === 1) {
    return direction;
  }
  return -direction;
}

function processDoubleNod(head, nodDown, nodUp, timestamp) {
  if (gestureState !== GESTURE_STATE.NEUTRAL && gestureStartTime > 0) {
    if (timestamp - gestureStartTime > MAX_GESTURE_TIME_MS) {
      resetGestureState();
    }
  }

  const zone = headZone(head, nodDown, nodUp);
  if (!zone) {
    return;
  }

  if (gestureState === GESTURE_STATE.NEUTRAL) {
    gestureDirection = zone;
    gestureState = GESTURE_STATE.STEP_1;
    gestureStartTime = timestamp;
    return;
  }

  if (!gestureDirection) {
    resetGestureState();
    return;
  }

  if (gestureState === GESTURE_STATE.STEP_1) {
    if (zone === expectedZoneForStep(2, gestureDirection)) {
      gestureState = GESTURE_STATE.STEP_2;
    }
    return;
  }

  if (gestureState === GESTURE_STATE.STEP_2) {
    if (zone === expectedZoneForStep(3, gestureDirection)) {
      gestureState = GESTURE_STATE.STEP_3;
    }
    return;
  }

  if (gestureState === GESTURE_STATE.STEP_3) {
    if (zone === expectedZoneForStep(4, gestureDirection)) {
      gestureState = GESTURE_STATE.STEP_4;
      activateTracking(timestamp);
    }
  }
}

function processChinHold(head, nodDown, nodUp, timestamp) {
  if (head < nodDown) {
    if (!chinHoldStart) {
      chinHoldStart = timestamp;
    }
    return;
  }

  if (!chinHoldStart) {
    return;
  }

  const heldFor = timestamp - chinHoldStart;
  const releasedAbove = head > nodUp;
  chinHoldStart = 0;

  if (heldFor >= CHIN_HOLD_MS && releasedAbove) {
    activateTracking(timestamp);
  }
}

export function detectStartSignal(landmarks, timestamp) {
  if (trackingActive) {
    return true;
  }

  if (!Number.isFinite(timestamp) || timestamp < cooldownUntil) {
    return false;
  }

  const head = computeNormalizedHeadOffset(landmarks);
  if (!Number.isFinite(head)) {
    return false;
  }

  pushHeadSample(head);
  if (headCount < MIN_BASELINE_SAMPLES) {
    return false;
  }

  const neutral = computeMedian();
  const threshold = computeAdaptiveThreshold();
  const nodDown = neutral - threshold;
  const nodUp = neutral + threshold;

  processDoubleNod(head, nodDown, nodUp, timestamp);
  if (!trackingActive) {
    processChinHold(head, nodDown, nodUp, timestamp);
  }

  return trackingActive;
}

export function resetStartGate() {
  trackingActive = false;
  cooldownUntil = 0;
  resetGestureState();
  headCount = 0;
  headIndex = 0;
}

export function isTrackingActive() {
  return trackingActive;
}
