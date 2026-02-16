import { initCamera } from "./camera.js";
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

function getUiElements() {
  return {
    canvas: document.getElementById("canvas"),
    repValue: document.getElementById("rep-value"),
    phaseValue: document.getElementById("phase-value"),
    romValue: document.getElementById("rom-value"),
    stabilityValue: document.getElementById("stability-value"),
    tempoValue: document.getElementById("tempo-value"),
    totalValue: document.getElementById("total-value"),
    statusValue: document.getElementById("status-value"),
    exerciseSelect: document.getElementById("exercise-select"),
    toggleMotion: document.getElementById("toggle-motion")
  };
}

const ui = getUiElements();
const ctx = ui.canvas.getContext("2d");
let appRuntime = null;

function setStatus(message, isError = false) {
  ui.statusValue.textContent = message;
  ui.statusValue.classList.toggle("error", isError);
}

function resizeCanvas(video) {
  if (!video?.videoWidth || !video?.videoHeight) return;

  const dpr = window.devicePixelRatio || 1;

  ui.canvas.width = video.videoWidth * dpr;
  ui.canvas.height = video.videoHeight * dpr;

  ui.canvas.style.width = `${video.videoWidth}px`;
  ui.canvas.style.height = `${video.videoHeight}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  initMotionTracker(video.videoWidth, video.videoHeight);
}

function updateToggleButton() {
  if (!ui.toggleMotion) {
    return;
  }

  ui.toggleMotion.textContent = motionTracker.enabled
    ? "Motion Lines: ON"
    : "Motion Lines: OFF";
}

function clearScoreDisplay() {
  ui.romValue.textContent = "--";
  ui.stabilityValue.textContent = "--";
  ui.tempoValue.textContent = "--";
  ui.totalValue.textContent = "--";
}

function applyExerciseChange(exercise) {
  setExercise(exercise);
  resetTrackingState();
  resetRepCounter(exercise);
  if (appRuntime) {
    appRuntime.latestScore = null;
  }
  clearScoreDisplay();
  updateDashboard(null);
}

function bindExerciseSelector() {
  if (!ui.exerciseSelect) {
    return;
  }

  ui.exerciseSelect.value = getState().currentExercise;
  ui.exerciseSelect.addEventListener("change", () => {
    applyExerciseChange(ui.exerciseSelect.value);
  });

  ui.exerciseSelect.addEventListener("wheel", (event) => {
    event.preventDefault();
    const options = Array.from(ui.exerciseSelect.options).map((option) => option.value);
    const current = options.indexOf(ui.exerciseSelect.value);
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = Math.max(0, Math.min(options.length - 1, current + direction));
    if (next === current) {
      return;
    }
    ui.exerciseSelect.value = options[next];
    applyExerciseChange(options[next]);
  }, { passive: false });
}

function bindControls() {
  if (ui.toggleMotion) {
    updateToggleButton();
    ui.toggleMotion.addEventListener("click", () => {
      motionTracker.enabled = !motionTracker.enabled;
      if (!motionTracker.enabled) {
        resetMotionTracker();
      }
      updateToggleButton();
    });
  }

  bindExerciseSelector();
}

function updateDashboard(latestScore) {
  const state = getState();
  ui.repValue.textContent = String(state.currentReps);
  ui.phaseValue.textContent = state.currentPhase;

  if (!latestScore) {
    return;
  }

  ui.romValue.textContent = String(latestScore.romScore);
  ui.stabilityValue.textContent = String(latestScore.stabilityScore);
  ui.tempoValue.textContent = String(latestScore.tempoScore);
  ui.totalValue.textContent = String(latestScore.totalScore);
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

function runFrame(runtime, timestamp) {
  const results = detectFrame(runtime.video, timestamp);
  const landmarks = extractLandmarks(results);
  if (landmarks) {
    const overlayWidth = ui.canvas.clientWidth || runtime.video.videoWidth || 1;
    const overlayHeight = ui.canvas.clientHeight || runtime.video.videoHeight || 1;
    updateMotionTracker(
      landmarks,
      timestamp,
      overlayWidth,
      overlayHeight
    );
  }

  drawFullFrame(ctx, runtime.video, results);
  const angles = extractAngles(landmarks, timestamp);
  const repData = updateRepCounter(angles, getState().currentExercise);
  if (repData) {
    runtime.latestScore = processRep(repData);
  }

  updateDashboard(runtime.latestScore);
  requestAnimationFrame((nextTimestamp) => runFrame(runtime, nextTimestamp));
}

async function startApp() {
  try {
    bindControls();

    setStatus("Initializing camera...");
    const video = await initCamera("video");
    resizeCanvas(video);
    initMotionTracker(ui.canvas.width, ui.canvas.height);
    window.addEventListener("resize", () => resizeCanvas(video));

    setStatus("Loading pose model...");
    await initPose();

    setStatus("Tracking");
    const runtime = { video, latestScore: null };
    appRuntime = runtime;
    requestAnimationFrame((timestamp) => runFrame(runtime, timestamp));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start tracker.";
    setStatus(message, true);
  }
}

startApp();
