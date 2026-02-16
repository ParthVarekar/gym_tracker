import {
  getCurrentFacingMode,
  initCamera,
  switchCamera
} from "./camera.js";
import { initPose, detectFrame } from "./poseDetector.js";
import { drawFullFrame } from "./poseRenderer.js";
import {
  getBodyStraightness,
  getElbowAngle,
  getHeadY,
  getHipAngle,
  getKneeAngle,
  getTorsoInclination,
  getTorsoLength
} from "./angleUtils.js";
import { resetRepCounter, updateRepCounter } from "./repCounter.js";
import { calculateScore } from "./scoringEngine.js";
import {
  addScore,
  getState,
  resetTrackingState,
  setExercise
} from "./state.js";
import {
  initMotionTracker,
  motionTracker,
  resetMotionTracker,
  updateMotionTracker
} from "./motionTracker.js";
import { createUI } from "./ui.js";

const ui = createUI();
const canvas = ui.getCanvas();
const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

const appState = {
  currentExercise: getState().currentExercise,
  reps: 0,
  phase: "idle",
  motionLinesEnabled: true,
  statsExpanded: false,
  menuOpen: false,
  cameraFacingMode: "user"
};

const runtime = {
  video: null,
  latestScore: null,
  mirrored: true
};

let lastFrameTime = 0;
let resizeDebounce = null;

function resizeCanvas(video) {
  if (!video?.videoWidth || !video?.videoHeight) {
    return;
  }

  const size = ui.getCanvasSize();
  canvas.width = size.width;
  canvas.height = size.height;
  resetMotionTracker();
  initMotionTracker(size.width, size.height);
}

function updateHeaderFromTracking() {
  const tracking = getState();
  appState.reps = tracking.currentReps;
  appState.phase = tracking.currentPhase;
  ui.setHeader(appState.reps, appState.phase, appState.currentExercise);
}

function clearScorePanel() {
  runtime.latestScore = null;
  ui.setScores(null);
  ui.setHistory([]);
}

function applyExerciseChange(exercise) {
  appState.currentExercise = exercise;
  setExercise(exercise);
  resetTrackingState();
  resetRepCounter(exercise);
  clearScorePanel();
  updateHeaderFromTracking();
}

function extractLandmarks(results) {
  const poseLandmarks = results?.poseLandmarks || results?.landmarks;
  return poseLandmarks?.[0] ?? null;
}

function extractAngles(landmarks, timestamp) {
  if (!landmarks) {
    return null;
  }

  const elbowAngle = getElbowAngle(landmarks);
  const kneeAngle = getKneeAngle(landmarks);
  const hipAngle = getHipAngle(landmarks);
  const bodyStraightness = getBodyStraightness(landmarks);
  const torsoInclination = getTorsoInclination(landmarks);
  const headY = getHeadY(landmarks);
  const torsoLength = getTorsoLength(landmarks);
  if (!Number.isFinite(headY)) {
    return null;
  }

  return {
    elbowAngle,
    kneeAngle,
    hipAngle,
    bodyStraightness,
    torsoInclination,
    headY,
    torsoLength,
    timestamp
  };
}

function processRep(repData) {
  const score = calculateScore(repData);
  if (!score) {
    return null;
  }

  addScore(score);
  return score;
}

function updatePanels() {
  const tracking = getState();
  ui.setHistory(tracking.repHistory);
  ui.setScores(runtime.latestScore);
}

function runFrame(timestamp) {
  if (!runtime.video) {
    return;
  }

  if (timestamp - lastFrameTime < 30) {
    requestAnimationFrame(runFrame);
    return;
  }
  lastFrameTime = timestamp;

  const results = detectFrame(runtime.video, timestamp);
  const landmarks = extractLandmarks(results);
  const size = ui.getCanvasSize();

  updateMotionTracker(landmarks, timestamp, size.width, size.height);

  drawFullFrame(ctx, runtime.video, results, {
    mirrored: runtime.mirrored,
    showMotionLines: appState.motionLinesEnabled
  });

  const angles = extractAngles(landmarks, timestamp);
  const repData = updateRepCounter(angles, appState.currentExercise);
  if (repData) {
    runtime.latestScore = processRep(repData);
  }

  updateHeaderFromTracking();
  updatePanels();
  requestAnimationFrame(runFrame);
}

async function handleSwitchCamera() {
  ui.setCameraBusy(true);
  ui.setStatus("Switching camera...");

  try {
    runtime.video = await switchCamera("video");
    appState.cameraFacingMode = getCurrentFacingMode();
    runtime.mirrored = appState.cameraFacingMode === "user";
    ui.setCameraFacingMode(appState.cameraFacingMode);
    resizeCanvas(runtime.video);
    ui.setStatus("Tracking");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to switch camera.";
    ui.setStatus(message, true);
  } finally {
    ui.setCameraBusy(false);
  }
}

function bindUiEvents() {
  ui.onExerciseChange((exercise) => {
    applyExerciseChange(exercise);
  });

  ui.onMotionToggle(() => {
    appState.motionLinesEnabled = !appState.motionLinesEnabled;
    motionTracker.enabled = appState.motionLinesEnabled;
    ui.setMotionLinesEnabled(appState.motionLinesEnabled);
  });

  ui.onCameraToggle(() => {
    void handleSwitchCamera();
  });

  ui.onMenuToggle((open) => {
    appState.menuOpen = open;
  });

  ui.onStatsToggle((expanded) => {
    appState.statsExpanded = expanded;
  });
}

function handleResize() {
  if (resizeDebounce) {
    clearTimeout(resizeDebounce);
  }

  resizeDebounce = setTimeout(() => {
    if (!runtime.video) {
      return;
    }

    resizeCanvas(runtime.video);
  }, 120);
}

async function startApp() {
  try {
    bindUiEvents();
    ui.setMotionLinesEnabled(appState.motionLinesEnabled);
    ui.setHeader(appState.reps, appState.phase, appState.currentExercise);
    clearScorePanel();

    ui.setStatus("Initializing camera...");
    runtime.video = await initCamera({ videoId: "video", facingMode: appState.cameraFacingMode });
    appState.cameraFacingMode = getCurrentFacingMode();
    runtime.mirrored = appState.cameraFacingMode === "user";
    ui.setCameraFacingMode(appState.cameraFacingMode);
    resizeCanvas(runtime.video);

    ui.setStatus("Loading pose model...");
    await initPose();

    ui.setStatus("Tracking");
    lastFrameTime = 0;

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    requestAnimationFrame(runFrame);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start tracker.";
    ui.setStatus(message, true);
  }
}

startApp();
