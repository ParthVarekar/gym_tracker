import { addRep, getState, incrementReps, setPhase } from "./state.js";

const EXERCISE = Object.freeze({
  PUSHUP: "pushup",
  SQUAT: "squat"
});

const REP_STATE = Object.freeze({
  IDLE: "IDLE",
  DOWN: "DOWN",
  UP: "UP"
});

const LANDMARK = Object.freeze({
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28
});

const VISIBILITY_THRESHOLDS = Object.freeze({
  // Relaxed only for push-ups.
  pushup: 0.2,
  // Squat threshold kept unchanged.
  squat: 0.25
});

const DEBOUNCE_FRAMES = Object.freeze({
  // Relaxed only for push-ups.
  pushup: 2,
  // Squat debounce kept unchanged.
  squat: 3
});

const MIN_REP_INTERVAL_MS = 220;

const PUSHUP_THRESHOLDS = Object.freeze({
  // Relaxed push-up thresholds.
  downElbow: 110,
  upElbow: 150,
  // Hysteresis buffers to prevent oscillation.
  reenterDownFromUpElbow: 120,
  canExitDownElbow: 145,
  // Minimum real movement amplitude to reject micro-jitter reps.
  minMovementDelta: 35
});

const SQUAT_THRESHOLDS = Object.freeze({
  downKnee: 95,
  downHip: 110,
  upKnee: 160,
  upHip: 140
});

const ORIENTATION_THRESHOLDS = Object.freeze({
  // Relaxed for push-ups to allow camera tilt.
  pushupHorizontalToleranceDeg: 30,
  // Squat orientation kept unchanged.
  squatShoulderHorizontalToleranceDeg: 15
});

const repCounterState = {
  currentState: REP_STATE.IDLE,
  lastUpTimestamp: 0,
  lastRepCount: 0,
  consecutiveAngleFrames: 0,
  exerciseType: EXERCISE.PUSHUP,
  repCountingEnabled: true,
  motionLinesEnabled: true,
  orientationValid: true,
  downFrames: 0,
  upFrames: 0,
  cycleStartTimestamp: 0,
  cycleDownTimestamp: 0,
  minElbow: Number.POSITIVE_INFINITY,
  maxElbow: Number.NEGATIVE_INFINITY,
  minKnee: Number.POSITIVE_INFINITY,
  maxKnee: Number.NEGATIVE_INFINITY,
  minHip: Number.POSITIVE_INFINITY,
  maxHip: Number.NEGATIVE_INFINITY,
  downPhaseMinElbow: Number.POSITIVE_INFINITY,
  downPhaseMaxElbow: Number.NEGATIVE_INFINITY,
  elbowSamples: [],
  kneeSamples: [],
  hipSamples: []
};

function toDegrees(rad) {
  return (rad * 180) / Math.PI;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function variance(values) {
  if (!values.length) {
    return 0;
  }

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sumSq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return sumSq / values.length;
}

function isLandmarkVisible(landmark, minVisibility) {
  if (!landmark) {
    return false;
  }

  return (landmark.visibility ?? 1) >= minVisibility;
}

function computeAngle(a, b, c) {
  if (!a || !b || !c) {
    return Number.NaN;
  }

  const angleRad = Math.abs(
    Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x)
  );
  let angleDeg = toDegrees(angleRad);
  if (angleDeg > 180) {
    angleDeg = 360 - angleDeg;
  }
  return angleDeg;
}

function getLandmark(landmarks, index) {
  return landmarks?.[index] ?? null;
}

function getMidpoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function normalizeLineAngleDeg(angleDeg) {
  let normalized = Math.abs(angleDeg);
  while (normalized > 180) {
    normalized -= 180;
  }
  if (normalized > 90) {
    normalized = 180 - normalized;
  }
  return normalized;
}

function computeShoulderLineAngleDeg(landmarks, minVisibility) {
  const left = getLandmark(landmarks, LANDMARK.LEFT_SHOULDER);
  const right = getLandmark(landmarks, LANDMARK.RIGHT_SHOULDER);
  if (!isLandmarkVisible(left, minVisibility) || !isLandmarkVisible(right, minVisibility)) {
    return Number.NaN;
  }

  return toDegrees(Math.atan2(right.y - left.y, right.x - left.x));
}

function isPushupOrientationValid(landmarks) {
  const minVisibility = VISIBILITY_THRESHOLDS.pushup;
  const angle = computeShoulderLineAngleDeg(landmarks, minVisibility);
  if (!isFiniteNumber(angle)) {
    return false;
  }

  const absAngle = Math.abs(angle);
  return (
    absAngle < ORIENTATION_THRESHOLDS.pushupHorizontalToleranceDeg ||
    Math.abs(absAngle - 180) < ORIENTATION_THRESHOLDS.pushupHorizontalToleranceDeg
  );
}

function isSquatOrientationValid(landmarks) {
  const shoulderAngle = computeShoulderLineAngleDeg(landmarks, VISIBILITY_THRESHOLDS.squat);
  if (!isFiniteNumber(shoulderAngle)) {
    return false;
  }

  const normalized = normalizeLineAngleDeg(shoulderAngle);
  return normalized <= ORIENTATION_THRESHOLDS.squatShoulderHorizontalToleranceDeg;
}

function computeChainAngle(landmarks, indices, minVisibility) {
  const a = getLandmark(landmarks, indices[0]);
  const b = getLandmark(landmarks, indices[1]);
  const c = getLandmark(landmarks, indices[2]);
  if (
    !isLandmarkVisible(a, minVisibility) ||
    !isLandmarkVisible(b, minVisibility) ||
    !isLandmarkVisible(c, minVisibility)
  ) {
    return Number.NaN;
  }

  return computeAngle(a, b, c);
}

function chooseSideAngle(landmarks, leftChain, rightChain, minVisibility) {
  const leftPoints = leftChain.map((index) => getLandmark(landmarks, index));
  const rightPoints = rightChain.map((index) => getLandmark(landmarks, index));
  const leftVisible = leftPoints.every((point) => isLandmarkVisible(point, minVisibility));
  const rightVisible = rightPoints.every((point) => isLandmarkVisible(point, minVisibility));

  if (!leftVisible && !rightVisible) {
    return Number.NaN;
  }

  if (leftVisible && !rightVisible) {
    return computeAngle(leftPoints[0], leftPoints[1], leftPoints[2]);
  }

  if (!leftVisible && rightVisible) {
    return computeAngle(rightPoints[0], rightPoints[1], rightPoints[2]);
  }

  const leftScore = leftPoints.reduce((sum, p) => sum + (p.visibility ?? 1), 0);
  const rightScore = rightPoints.reduce((sum, p) => sum + (p.visibility ?? 1), 0);
  if (leftScore >= rightScore) {
    return computeAngle(leftPoints[0], leftPoints[1], leftPoints[2]);
  }

  return computeAngle(rightPoints[0], rightPoints[1], rightPoints[2]);
}

function getPushupAnglesFromLandmarks(landmarks) {
  const minVisibility = VISIBILITY_THRESHOLDS.pushup;
  const leftElbow = computeChainAngle(
    landmarks,
    [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_ELBOW, LANDMARK.LEFT_WRIST],
    minVisibility
  );
  const rightElbow = computeChainAngle(
    landmarks,
    [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_ELBOW, LANDMARK.RIGHT_WRIST],
    minVisibility
  );

  let elbow = Number.NaN;
  if (isFiniteNumber(leftElbow) && isFiniteNumber(rightElbow)) {
    elbow = (leftElbow + rightElbow) / 2;
  } else if (isFiniteNumber(leftElbow)) {
    elbow = leftElbow;
  } else if (isFiniteNumber(rightElbow)) {
    elbow = rightElbow;
  }

  return {
    elbow,
    knee: Number.NaN,
    hip: Number.NaN
  };
}

function getSquatAnglesFromLandmarks(landmarks) {
  const minVisibility = VISIBILITY_THRESHOLDS.squat;
  const knee = chooseSideAngle(
    landmarks,
    [LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE, LANDMARK.LEFT_ANKLE],
    [LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE, LANDMARK.RIGHT_ANKLE],
    minVisibility
  );
  const hip = chooseSideAngle(
    landmarks,
    [LANDMARK.LEFT_SHOULDER, LANDMARK.LEFT_HIP, LANDMARK.LEFT_KNEE],
    [LANDMARK.RIGHT_SHOULDER, LANDMARK.RIGHT_HIP, LANDMARK.RIGHT_KNEE],
    minVisibility
  );
  return {
    elbow: Number.NaN,
    knee,
    hip
  };
}

function resetDownPhaseRange() {
  repCounterState.downPhaseMinElbow = Number.POSITIVE_INFINITY;
  repCounterState.downPhaseMaxElbow = Number.NEGATIVE_INFINITY;
}

function initDownPhaseRange(elbow) {
  resetDownPhaseRange();
  if (isFiniteNumber(elbow)) {
    repCounterState.downPhaseMinElbow = elbow;
    repCounterState.downPhaseMaxElbow = elbow;
  }
}

function updateDownPhaseRange(elbow) {
  if (!isFiniteNumber(elbow)) {
    return;
  }

  repCounterState.downPhaseMinElbow = Math.min(repCounterState.downPhaseMinElbow, elbow);
  repCounterState.downPhaseMaxElbow = Math.max(repCounterState.downPhaseMaxElbow, elbow);
}

function downPhaseAmplitude() {
  if (
    !isFiniteNumber(repCounterState.downPhaseMinElbow) ||
    !isFiniteNumber(repCounterState.downPhaseMaxElbow)
  ) {
    return 0;
  }

  return Math.max(0, repCounterState.downPhaseMaxElbow - repCounterState.downPhaseMinElbow);
}

function resetCycleMetrics(timestamp = 0) {
  repCounterState.cycleStartTimestamp = timestamp;
  repCounterState.cycleDownTimestamp = 0;
  repCounterState.minElbow = Number.POSITIVE_INFINITY;
  repCounterState.maxElbow = Number.NEGATIVE_INFINITY;
  repCounterState.minKnee = Number.POSITIVE_INFINITY;
  repCounterState.maxKnee = Number.NEGATIVE_INFINITY;
  repCounterState.minHip = Number.POSITIVE_INFINITY;
  repCounterState.maxHip = Number.NEGATIVE_INFINITY;
  repCounterState.elbowSamples.length = 0;
  repCounterState.kneeSamples.length = 0;
  repCounterState.hipSamples.length = 0;
  resetDownPhaseRange();
}

function updateCycleMetrics(angles) {
  if (isFiniteNumber(angles.elbow)) {
    repCounterState.minElbow = Math.min(repCounterState.minElbow, angles.elbow);
    repCounterState.maxElbow = Math.max(repCounterState.maxElbow, angles.elbow);
    repCounterState.elbowSamples.push(angles.elbow);
  }

  if (isFiniteNumber(angles.knee)) {
    repCounterState.minKnee = Math.min(repCounterState.minKnee, angles.knee);
    repCounterState.maxKnee = Math.max(repCounterState.maxKnee, angles.knee);
    repCounterState.kneeSamples.push(angles.knee);
  }

  if (isFiniteNumber(angles.hip)) {
    repCounterState.minHip = Math.min(repCounterState.minHip, angles.hip);
    repCounterState.maxHip = Math.max(repCounterState.maxHip, angles.hip);
    repCounterState.hipSamples.push(angles.hip);
  }
}

function toPhaseLabel(state) {
  if (state === REP_STATE.DOWN) {
    return "down";
  }
  if (state === REP_STATE.UP) {
    return "up";
  }
  return "idle";
}

function setRepState(nextState) {
  repCounterState.currentState = nextState;
  repCounterState.downFrames = 0;
  repCounterState.upFrames = 0;
  repCounterState.consecutiveAngleFrames = 0;
  setPhase(toPhaseLabel(nextState));
}

function setExerciseType(exerciseType) {
  const normalized = exerciseType === EXERCISE.SQUAT ? EXERCISE.SQUAT : EXERCISE.PUSHUP;
  if (repCounterState.exerciseType === normalized) {
    return;
  }

  repCounterState.exerciseType = normalized;
  resetRepCounter(normalized);
}

function buildOrientationAndAngles(landmarks) {
  if (repCounterState.exerciseType === EXERCISE.SQUAT) {
    const angles = getSquatAnglesFromLandmarks(landmarks);
    const orientationValid = isSquatOrientationValid(landmarks);
    return { angles, orientationValid };
  }

  const angles = getPushupAnglesFromLandmarks(landmarks);
  const orientationValid = isPushupOrientationValid(landmarks);
  return { angles, orientationValid };
}

function readLegacyAnglesObject(anglesLike) {
  const leftElbow = anglesLike.leftElbowAngle;
  const rightElbow = anglesLike.rightElbowAngle;
  let elbow = anglesLike.elbowAngle;

  if (isFiniteNumber(leftElbow) && isFiniteNumber(rightElbow)) {
    elbow = (leftElbow + rightElbow) / 2;
  } else if (isFiniteNumber(leftElbow)) {
    elbow = leftElbow;
  } else if (isFiniteNumber(rightElbow)) {
    elbow = rightElbow;
  }

  return {
    elbow,
    knee: anglesLike.kneeAngle,
    hip: anglesLike.hipAngle
  };
}

function isLandmarkFrame(input) {
  return Array.isArray(input) && input.length > LANDMARK.RIGHT_ANKLE;
}

function getDebounceRequirement() {
  return repCounterState.exerciseType === EXERCISE.SQUAT
    ? DEBOUNCE_FRAMES.squat
    : DEBOUNCE_FRAMES.pushup;
}

function checkDownCondition(angles) {
  if (repCounterState.exerciseType === EXERCISE.SQUAT) {
    return isFiniteNumber(angles.knee) &&
      isFiniteNumber(angles.hip) &&
      angles.knee < SQUAT_THRESHOLDS.downKnee &&
      angles.hip < SQUAT_THRESHOLDS.downHip;
  }

  if (!isFiniteNumber(angles.elbow)) {
    return false;
  }

  const threshold = repCounterState.currentState === REP_STATE.UP
    ? PUSHUP_THRESHOLDS.reenterDownFromUpElbow
    : PUSHUP_THRESHOLDS.downElbow;
  return angles.elbow < threshold;
}

function checkUpCondition(angles) {
  if (repCounterState.exerciseType === EXERCISE.SQUAT) {
    return isFiniteNumber(angles.knee) &&
      isFiniteNumber(angles.hip) &&
      angles.knee > SQUAT_THRESHOLDS.upKnee &&
      angles.hip > SQUAT_THRESHOLDS.upHip;
  }

  return isFiniteNumber(angles.elbow) && angles.elbow > PUSHUP_THRESHOLDS.upElbow;
}

function passesDebounce(condition, direction, requiredFrames) {
  if (direction === "down") {
    repCounterState.downFrames = condition ? repCounterState.downFrames + 1 : 0;
    repCounterState.consecutiveAngleFrames = repCounterState.downFrames;
    return repCounterState.downFrames >= requiredFrames;
  }

  repCounterState.upFrames = condition ? repCounterState.upFrames + 1 : 0;
  repCounterState.consecutiveAngleFrames = repCounterState.upFrames;
  return repCounterState.upFrames >= requiredFrames;
}

function intensityFromTempoMs(tempoMs) {
  if (!isFiniteNumber(tempoMs) || tempoMs <= 0) {
    return 0;
  }

  return clampScore((tempoMs / 3000) * 100);
}

function buildRepResult(timestamp, angles, orientationValid) {
  const previousUp = repCounterState.lastUpTimestamp || 0;
  const tempoMs = previousUp > 0 ? Math.max(0, timestamp - previousUp) : null;
  repCounterState.lastUpTimestamp = timestamp;
  const repNumber = incrementReps();
  repCounterState.lastRepCount = repNumber;

  const durationMs = Math.max(0, timestamp - repCounterState.cycleStartTimestamp);
  const descentMs = repCounterState.cycleDownTimestamp
    ? Math.max(0, repCounterState.cycleDownTimestamp - repCounterState.cycleStartTimestamp)
    : 0;
  const ascentMs = repCounterState.cycleDownTimestamp
    ? Math.max(0, timestamp - repCounterState.cycleDownTimestamp)
    : durationMs;

  const rangeOfMotion = repCounterState.exerciseType === EXERCISE.SQUAT
    ? Math.max(0, repCounterState.maxKnee - repCounterState.minKnee)
    : Math.max(0, repCounterState.maxElbow - repCounterState.minElbow);

  const repResult = {
    exercise: repCounterState.exerciseType,
    repNumber,
    tempoMs,
    angles: {
      elbow: isFiniteNumber(angles.elbow) ? angles.elbow : Number.NaN,
      knee: isFiniteNumber(angles.knee) ? angles.knee : Number.NaN,
      hip: isFiniteNumber(angles.hip) ? angles.hip : Number.NaN
    },
    orientationValid,
    startTime: repCounterState.cycleStartTimestamp,
    endTime: timestamp,
    durationMs,
    descentMs,
    ascentMs,
    intensityMs: tempoMs ?? 0,
    intensityScore: intensityFromTempoMs(tempoMs ?? 0),
    rangeOfMotion,
    kneeVariance: variance(repCounterState.kneeSamples),
    hipVariance: variance(repCounterState.hipSamples),
    elbowVariance: variance(repCounterState.elbowSamples)
  };

  addRep(repResult);
  return repResult;
}

function shouldRejectPushupForLowAmplitude() {
  if (repCounterState.exerciseType !== EXERCISE.PUSHUP) {
    return false;
  }

  return downPhaseAmplitude() < PUSHUP_THRESHOLDS.minMovementDelta;
}

function updateStateMachine(angles, timestamp, orientationValid) {
  const debounceFrames = getDebounceRequirement();
  const downCondition = checkDownCondition(angles);
  const upCondition = checkUpCondition(angles);

  if (repCounterState.currentState === REP_STATE.IDLE) {
    if (passesDebounce(upCondition, "up", debounceFrames)) {
      setRepState(REP_STATE.UP);
      resetCycleMetrics(timestamp);
      updateCycleMetrics(angles);
    } else if (passesDebounce(downCondition, "down", debounceFrames)) {
      setRepState(REP_STATE.DOWN);
      resetCycleMetrics(timestamp);
      repCounterState.cycleDownTimestamp = timestamp;
      initDownPhaseRange(angles.elbow);
      updateCycleMetrics(angles);
    }
    return null;
  }

  if (repCounterState.currentState === REP_STATE.UP) {
    updateCycleMetrics(angles);
    if (passesDebounce(downCondition, "down", debounceFrames)) {
      setRepState(REP_STATE.DOWN);
      repCounterState.cycleDownTimestamp = timestamp;
      initDownPhaseRange(angles.elbow);
    }
    return null;
  }

  updateCycleMetrics(angles);
  updateDownPhaseRange(angles.elbow);

  if (repCounterState.exerciseType === EXERCISE.PUSHUP) {
    if (!isFiniteNumber(angles.elbow) || angles.elbow <= PUSHUP_THRESHOLDS.canExitDownElbow) {
      repCounterState.upFrames = 0;
      repCounterState.consecutiveAngleFrames = 0;
      return null;
    }
  }

  if (!passesDebounce(upCondition, "up", debounceFrames)) {
    return null;
  }

  if (
    repCounterState.lastUpTimestamp > 0 &&
    timestamp - repCounterState.lastUpTimestamp < MIN_REP_INTERVAL_MS
  ) {
    setRepState(REP_STATE.UP);
    resetCycleMetrics(timestamp);
    updateCycleMetrics(angles);
    return null;
  }

  if (shouldRejectPushupForLowAmplitude()) {
    setRepState(REP_STATE.UP);
    resetCycleMetrics(timestamp);
    updateCycleMetrics(angles);
    return null;
  }

  setRepState(REP_STATE.UP);
  const repResult = buildRepResult(timestamp, angles, orientationValid);
  resetCycleMetrics(timestamp);
  updateCycleMetrics(angles);
  return repResult;
}

function updateFromLandmarks(landmarks, timestamp) {
  const { angles, orientationValid } = buildOrientationAndAngles(landmarks);
  repCounterState.orientationValid = orientationValid;
  if (!orientationValid) {
    return null;
  }

  const hasRequiredAngle = repCounterState.exerciseType === EXERCISE.SQUAT
    ? isFiniteNumber(angles.knee) && isFiniteNumber(angles.hip)
    : isFiniteNumber(angles.elbow);
  if (!hasRequiredAngle) {
    return null;
  }

  return updateStateMachine(angles, timestamp, orientationValid);
}

function updateFromLegacyAngles(anglesLike) {
  const timestamp = isFiniteNumber(anglesLike.timestamp) ? anglesLike.timestamp : 0;
  const angles = readLegacyAnglesObject(anglesLike);
  const orientationValid = typeof anglesLike.orientationValid === "boolean"
    ? anglesLike.orientationValid
    : true;

  repCounterState.orientationValid = orientationValid;
  if (!orientationValid) {
    return null;
  }

  return updateStateMachine(angles, timestamp, orientationValid);
}

export function enableRepCounting() {
  repCounterState.repCountingEnabled = true;
  return repCounterState.repCountingEnabled;
}

export function disableRepCounting() {
  repCounterState.repCountingEnabled = false;
  return repCounterState.repCountingEnabled;
}

export function isRepCountingEnabled() {
  return repCounterState.repCountingEnabled;
}

export function toggleMotionLines(forceValue) {
  if (typeof forceValue === "boolean") {
    repCounterState.motionLinesEnabled = forceValue;
  } else {
    repCounterState.motionLinesEnabled = !repCounterState.motionLinesEnabled;
  }
  return repCounterState.motionLinesEnabled;
}

export function areMotionLinesEnabled() {
  return repCounterState.motionLinesEnabled;
}

export function resetRepCounter(exercise = getState().currentExercise) {
  repCounterState.exerciseType = exercise === EXERCISE.SQUAT ? EXERCISE.SQUAT : EXERCISE.PUSHUP;
  repCounterState.currentState = REP_STATE.IDLE;
  repCounterState.lastUpTimestamp = 0;
  repCounterState.lastRepCount = getState().currentReps;
  repCounterState.consecutiveAngleFrames = 0;
  repCounterState.downFrames = 0;
  repCounterState.upFrames = 0;
  repCounterState.orientationValid = true;
  resetCycleMetrics(0);
  setPhase("idle");
}

export function setRepCounterExercise(exerciseType) {
  setExerciseType(exerciseType);
  return repCounterState.exerciseType;
}

export function getRepCounterState() {
  return { ...repCounterState };
}

export function updateRepCounter(input, timestampOrExercise, maybeExercise) {
  if (!repCounterState.repCountingEnabled || !input) {
    return null;
  }

  let exercise = repCounterState.exerciseType;
  if (typeof timestampOrExercise === "string") {
    exercise = timestampOrExercise;
  } else if (typeof maybeExercise === "string") {
    exercise = maybeExercise;
  }
  setExerciseType(exercise);

  if (isLandmarkFrame(input)) {
    const timestamp = isFiniteNumber(timestampOrExercise) ? timestampOrExercise : performance.now();
    return updateFromLandmarks(input, timestamp);
  }

  if (typeof input === "object") {
    return updateFromLegacyAngles(input);
  }

  return null;
}
