import {
  addRep,
  getState,
  incrementReps,
  setPhase
} from "./state.js";

const EXERCISES = Object.freeze({
  pushup: "pushup",
  squat: "squat"
});

const PUSHUP_THRESHOLDS = Object.freeze({
  downElbow: 105,
  upElbow: 155,
  minElbowRom: 30,
  minHeadTravel: 0.08,
  minBodyStraightness: 145,
  maxTorsoInclination: 62,
  minDescentMs: 180,
  minAscentMs: 180
});

const SQUAT_THRESHOLDS = Object.freeze({
  downKnee: 90,
  upKnee: 165,
  minKneeRom: 45,
  minHeadTravel: 0.05,
  minStandingStraightness: 145,
  minStandingTorsoInclination: 60,
  minRepStraightness: 125,
  minHipAngle: 35,
  maxHipAngle: 110,
  minDescentMs: 150,
  minAscentMs: 150
});

const pushupTracker = {
  startTime: 0,
  downTime: 0,
  startHeadY: 0,
  minHeadY: Number.POSITIVE_INFINITY,
  maxHeadY: Number.NEGATIVE_INFINITY,
  torsoLengthSum: 0,
  torsoLengthCount: 0,
  minElbow: 180,
  maxElbow: 0,
  elbowSamples: [],
  straightnessSamples: [],
  hipSamples: []
};

const squatTracker = {
  startTime: 0,
  downTime: 0,
  bottomHipAngle: Number.NaN,
  startHeadY: 0,
  minHeadY: Number.POSITIVE_INFINITY,
  maxHeadY: Number.NEGATIVE_INFINITY,
  torsoLengthSum: 0,
  torsoLengthCount: 0,
  minKnee: 180,
  maxKnee: 0,
  kneeSamples: [],
  hipSamples: [],
  torsoInclinationSamples: [],
  straightnessSamples: []
};

function variance(values) {
  if (!values.length) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squared = values.map((value) => (value - mean) ** 2);
  return squared.reduce((sum, value) => sum + value, 0) / values.length;
}

function average(values) {
  if (!values.length) {
    return Number.NaN;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function intensityFromDuration(durationMs) {
  const normalized = (durationMs / 3000) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizedHeadTravel(minHeadY, maxHeadY, torsoLengthSum, torsoLengthCount) {
  if (!Number.isFinite(minHeadY) || !Number.isFinite(maxHeadY)) {
    return 0;
  }

  const meanTorso = torsoLengthCount ? torsoLengthSum / torsoLengthCount : Number.NaN;
  if (!Number.isFinite(meanTorso) || meanTorso <= 0) {
    return 0;
  }

  return Math.abs(maxHeadY - minHeadY) / meanTorso;
}

function resetPushupTracker(timestamp) {
  pushupTracker.startTime = timestamp;
  pushupTracker.downTime = 0;
  pushupTracker.startHeadY = 0;
  pushupTracker.minHeadY = Number.POSITIVE_INFINITY;
  pushupTracker.maxHeadY = Number.NEGATIVE_INFINITY;
  pushupTracker.torsoLengthSum = 0;
  pushupTracker.torsoLengthCount = 0;
  pushupTracker.minElbow = 180;
  pushupTracker.maxElbow = 0;
  pushupTracker.elbowSamples.length = 0;
  pushupTracker.straightnessSamples.length = 0;
  pushupTracker.hipSamples.length = 0;
}

function samplePushupAngles(angles) {
  pushupTracker.minElbow = Math.min(pushupTracker.minElbow, angles.elbowAngle);
  pushupTracker.maxElbow = Math.max(pushupTracker.maxElbow, angles.elbowAngle);
  pushupTracker.minHeadY = Math.min(pushupTracker.minHeadY, angles.headY);
  pushupTracker.maxHeadY = Math.max(pushupTracker.maxHeadY, angles.headY);
  pushupTracker.elbowSamples.push(angles.elbowAngle);

  if (Number.isFinite(angles.bodyStraightness)) {
    pushupTracker.straightnessSamples.push(angles.bodyStraightness);
  }

  if (Number.isFinite(angles.hipAngle)) {
    pushupTracker.hipSamples.push(angles.hipAngle);
  }

  if (Number.isFinite(angles.torsoLength) && angles.torsoLength > 0) {
    pushupTracker.torsoLengthSum += angles.torsoLength;
    pushupTracker.torsoLengthCount += 1;
  }
}

function isPushupPosture(angles) {
  if (!Number.isFinite(angles.bodyStraightness)) {
    return false;
  }

  if (!Number.isFinite(angles.torsoInclination)) {
    return false;
  }

  return (
    angles.bodyStraightness >= PUSHUP_THRESHOLDS.minBodyStraightness &&
    angles.torsoInclination <= PUSHUP_THRESHOLDS.maxTorsoInclination
  );
}

function beginPushupCycle(timestamp, headY) {
  resetPushupTracker(timestamp);
  pushupTracker.startHeadY = headY;
  pushupTracker.minHeadY = headY;
  pushupTracker.maxHeadY = headY;
  setPhase("up");
}

function buildPushupRepData(endTime) {
  const descentMs = Math.max(0, pushupTracker.downTime - pushupTracker.startTime);
  const ascentMs = Math.max(0, endTime - pushupTracker.downTime);
  const elbowVariance = variance(pushupTracker.elbowSamples);
  const hipVariance = variance(pushupTracker.hipSamples);
  return {
    exercise: EXERCISES.pushup,
    startTime: pushupTracker.startTime,
    endTime,
    durationMs: Math.max(0, endTime - pushupTracker.startTime),
    minElbowAngle: pushupTracker.minElbow,
    maxElbowAngle: pushupTracker.maxElbow,
    rangeOfMotion: pushupTracker.maxElbow - pushupTracker.minElbow,
    descentMs,
    ascentMs,
    intensityMs: descentMs,
    intensityScore: intensityFromDuration(descentMs),
    elbowVariance,
    bodyStraightness: average(pushupTracker.straightnessSamples),
    headTravel: normalizedHeadTravel(
      pushupTracker.minHeadY,
      pushupTracker.maxHeadY,
      pushupTracker.torsoLengthSum,
      pushupTracker.torsoLengthCount
    ),
    kneeVariance: elbowVariance,
    hipVariance
  };
}

function isValidPushupRep(repData) {
  if (!pushupTracker.downTime) {
    return false;
  }

  if (repData.rangeOfMotion < PUSHUP_THRESHOLDS.minElbowRom) {
    return false;
  }

  if (repData.descentMs < PUSHUP_THRESHOLDS.minDescentMs) {
    return false;
  }

  if (repData.ascentMs < PUSHUP_THRESHOLDS.minAscentMs) {
    return false;
  }

  if (repData.headTravel < PUSHUP_THRESHOLDS.minHeadTravel) {
    return false;
  }

  return repData.bodyStraightness >= PUSHUP_THRESHOLDS.minBodyStraightness;
}

function finalizePushupRep(timestamp, headY) {
  const repData = buildPushupRepData(timestamp);
  if (!isValidPushupRep(repData)) {
    beginPushupCycle(timestamp, headY);
    return null;
  }

  incrementReps();
  addRep(repData);
  beginPushupCycle(timestamp, headY);
  return repData;
}

function updatePushupRepCounter(angles) {
  if (!angles || !Number.isFinite(angles.elbowAngle)) {
    return null;
  }

  const state = getState();
  const { elbowAngle, timestamp, headY } = angles;
  const postureValid = isPushupPosture(angles);
  if (state.currentPhase === "idle") {
    if (postureValid && elbowAngle >= PUSHUP_THRESHOLDS.upElbow) {
      beginPushupCycle(timestamp, headY);
    }
    return null;
  }

  if (!postureValid) {
    setPhase("idle");
    return null;
  }

  samplePushupAngles(angles);

  if (state.currentPhase === "up" && elbowAngle <= PUSHUP_THRESHOLDS.downElbow) {
    pushupTracker.downTime = timestamp;
    setPhase("down");
    return null;
  }

  if (state.currentPhase === "down" && elbowAngle >= PUSHUP_THRESHOLDS.upElbow) {
    return finalizePushupRep(timestamp, headY);
  }

  return null;
}

function resetSquatTracker(timestamp) {
  squatTracker.startTime = timestamp;
  squatTracker.downTime = 0;
  squatTracker.bottomHipAngle = Number.NaN;
  squatTracker.startHeadY = 0;
  squatTracker.minHeadY = Number.POSITIVE_INFINITY;
  squatTracker.maxHeadY = Number.NEGATIVE_INFINITY;
  squatTracker.torsoLengthSum = 0;
  squatTracker.torsoLengthCount = 0;
  squatTracker.minKnee = 180;
  squatTracker.maxKnee = 0;
  squatTracker.kneeSamples.length = 0;
  squatTracker.hipSamples.length = 0;
  squatTracker.torsoInclinationSamples.length = 0;
  squatTracker.straightnessSamples.length = 0;
}

function sampleSquatAngles(angles) {
  squatTracker.minKnee = Math.min(squatTracker.minKnee, angles.kneeAngle);
  squatTracker.maxKnee = Math.max(squatTracker.maxKnee, angles.kneeAngle);
  squatTracker.minHeadY = Math.min(squatTracker.minHeadY, angles.headY);
  squatTracker.maxHeadY = Math.max(squatTracker.maxHeadY, angles.headY);
  squatTracker.kneeSamples.push(angles.kneeAngle);

  if (Number.isFinite(angles.hipAngle)) {
    squatTracker.hipSamples.push(angles.hipAngle);
  }

  if (Number.isFinite(angles.torsoInclination)) {
    squatTracker.torsoInclinationSamples.push(angles.torsoInclination);
  }

  if (Number.isFinite(angles.bodyStraightness)) {
    squatTracker.straightnessSamples.push(angles.bodyStraightness);
  }

  if (Number.isFinite(angles.torsoLength) && angles.torsoLength > 0) {
    squatTracker.torsoLengthSum += angles.torsoLength;
    squatTracker.torsoLengthCount += 1;
  }
}

function isStandingUpright(angles) {
  if (!Number.isFinite(angles.kneeAngle)) {
    return false;
  }

  if (!Number.isFinite(angles.bodyStraightness)) {
    return false;
  }

  if (!Number.isFinite(angles.torsoInclination)) {
    return false;
  }

  return (
    angles.kneeAngle >= SQUAT_THRESHOLDS.upKnee &&
    angles.bodyStraightness >= SQUAT_THRESHOLDS.minStandingStraightness &&
    angles.torsoInclination >= SQUAT_THRESHOLDS.minStandingTorsoInclination
  );
}

function isSquatBottom(angles) {
  if (!Number.isFinite(angles.kneeAngle) || !Number.isFinite(angles.hipAngle)) {
    return false;
  }

  return (
    angles.kneeAngle < SQUAT_THRESHOLDS.downKnee &&
    angles.hipAngle >= SQUAT_THRESHOLDS.minHipAngle &&
    angles.hipAngle <= SQUAT_THRESHOLDS.maxHipAngle
  );
}

function beginSquatCycle(timestamp, headY) {
  resetSquatTracker(timestamp);
  squatTracker.startHeadY = headY;
  squatTracker.minHeadY = headY;
  squatTracker.maxHeadY = headY;
  setPhase("up");
}

function buildSquatRepData(endTime) {
  const descentMs = Math.max(0, squatTracker.downTime - squatTracker.startTime);
  const ascentMs = Math.max(0, endTime - squatTracker.downTime);
  const torsoVariance = variance(squatTracker.torsoInclinationSamples);
  const hipVariance = variance(squatTracker.hipSamples);
  return {
    exercise: EXERCISES.squat,
    startTime: squatTracker.startTime,
    endTime,
    durationMs: Math.max(0, endTime - squatTracker.startTime),
    minKneeAngle: squatTracker.minKnee,
    maxKneeAngle: squatTracker.maxKnee,
    rangeOfMotion: squatTracker.maxKnee - squatTracker.minKnee,
    descentMs,
    ascentMs,
    intensityMs: descentMs,
    intensityScore: intensityFromDuration(descentMs),
    kneeVariance: variance(squatTracker.kneeSamples),
    hipVariance,
    torsoVariance,
    bottomHipAngle: squatTracker.bottomHipAngle,
    bodyStraightness: average(squatTracker.straightnessSamples),
    torsoInclination: average(squatTracker.torsoInclinationSamples),
    headTravel: normalizedHeadTravel(
      squatTracker.minHeadY,
      squatTracker.maxHeadY,
      squatTracker.torsoLengthSum,
      squatTracker.torsoLengthCount
    )
  };
}

function isValidSquatRep(repData) {
  if (!squatTracker.downTime) {
    return false;
  }

  if (repData.minKneeAngle >= SQUAT_THRESHOLDS.downKnee) {
    return false;
  }

  if (repData.maxKneeAngle < SQUAT_THRESHOLDS.upKnee) {
    return false;
  }

  if (repData.rangeOfMotion < SQUAT_THRESHOLDS.minKneeRom) {
    return false;
  }

  if (repData.descentMs < SQUAT_THRESHOLDS.minDescentMs) {
    return false;
  }

  if (repData.ascentMs < SQUAT_THRESHOLDS.minAscentMs) {
    return false;
  }

  if (repData.headTravel < SQUAT_THRESHOLDS.minHeadTravel) {
    return false;
  }

  if (!Number.isFinite(repData.bottomHipAngle)) {
    return false;
  }

  if (repData.bottomHipAngle < SQUAT_THRESHOLDS.minHipAngle) {
    return false;
  }

  if (repData.bottomHipAngle > SQUAT_THRESHOLDS.maxHipAngle) {
    return false;
  }

  return repData.bodyStraightness >= SQUAT_THRESHOLDS.minRepStraightness;
}

function finalizeSquatRep(timestamp, headY) {
  const repData = buildSquatRepData(timestamp);
  if (!isValidSquatRep(repData)) {
    beginSquatCycle(timestamp, headY);
    return null;
  }

  incrementReps();
  addRep(repData);
  beginSquatCycle(timestamp, headY);
  return repData;
}

function updateSquatRepCounter(angles) {
  if (!angles || !Number.isFinite(angles.kneeAngle)) {
    return null;
  }

  const state = getState();
  const { timestamp, headY } = angles;
  if (state.currentPhase === "idle") {
    if (isStandingUpright(angles)) {
      beginSquatCycle(timestamp, headY);
    }
    return null;
  }

  sampleSquatAngles(angles);

  if (state.currentPhase === "up" && isSquatBottom(angles)) {
    squatTracker.downTime = timestamp;
    squatTracker.bottomHipAngle = angles.hipAngle;
    setPhase("down");
    return null;
  }

  if (state.currentPhase === "down" && isStandingUpright(angles)) {
    return finalizeSquatRep(timestamp, headY);
  }

  return null;
}

export function resetRepCounter(exercise = getState().currentExercise) {
  setPhase("idle");
  if (exercise === EXERCISES.squat) {
    resetSquatTracker(0);
    return;
  }

  resetPushupTracker(0);
}

export function updateRepCounter(angles, exercise = getState().currentExercise) {
  if (exercise === EXERCISES.squat) {
    return updateSquatRepCounter(angles);
  }

  return updatePushupRepCounter(angles);
}
