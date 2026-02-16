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
    toggleMotion: document.getElementById("toggle-motion"),
    toggleCamera: document.getElementById("toggle-camera"),
    metricsPanel: document.getElementById("metrics-panel"),
    metricsToggle: document.getElementById("metrics-toggle"),
    metricsContent: document.getElementById("metrics-content")
  };
}

const ui = getUiElements();
const ctx = ui.canvas.getContext("2d", { alpha: true, desynchronized: true });
let appRuntime = null;
let currentFacingMode = "user";
let lastFrameTime = 0;
let metricsExpanded = false;

function isMobileViewport() {
  return window.matchMedia("(max-width: 600px)").matches;
}

function isTabletViewport() {
  return window.matchMedia("(max-width: 1024px)").matches;
}

function bindPress(element, handler) {
  if (!element) {
    return;
  }

  let touched = false;
  element.addEventListener("touchend", (event) => {
    touched = true;
    event.preventDefault();
    handler();
  }, { passive: false });

  element.addEventListener("click", () => {
    if (touched) {
      touched = false;
      return;
    }
    handler();
  });
}

function setMetricsExpanded(expanded, force = false) {
  if (!ui.metricsToggle || !ui.metricsContent || !ui.metricsPanel) {
    return;
  }

  if (!force && expanded === metricsExpanded) {
    return;
  }

  metricsExpanded = expanded;
  ui.metricsContent.hidden = !expanded;
  ui.metricsPanel.dataset.collapsed = String(!expanded);
  ui.metricsToggle.setAttribute("aria-expanded", String(expanded));
  ui.metricsToggle.textContent = expanded
    ? "Hide Detailed Scores"
    : "Show Detailed Scores";
}

function syncTrackingUiState() {
  const isTracking = ui.statusValue.textContent === "Tracking";
  const compactMode = isMobileViewport() && isTracking;
  document.body.classList.toggle("tracking-active", compactMode);
  if (compactMode) {
    setMetricsExpanded(false, true);
  }
}

function setStatus(message, isError = false) {
  ui.statusValue.textContent = message;
  ui.statusValue.classList.toggle("error", isError);
  syncTrackingUiState();
}

function resizeCanvas(video) {
  if (!video?.videoWidth || !video?.videoHeight) {
    return;
  }

  const width = Math.max(1, ui.canvas.clientWidth || window.innerWidth || 1);
  const height = Math.max(1, ui.canvas.clientHeight || window.innerHeight || 1);
  ui.canvas.width = width;
  ui.canvas.height = height;
  initMotionTracker(width, height, isMobileViewport());
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
    const currentIndex = options.indexOf(ui.exerciseSelect.value);
    const direction = event.deltaY > 0 ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + direction));
    if (nextIndex === currentIndex) {
      return;
    }

    ui.exerciseSelect.value = options[nextIndex];
    applyExerciseChange(options[nextIndex]);
  }, { passive: false });
}

function bindBottomNav() {
  const navButtons = document.querySelectorAll(".nav-item");
  navButtons.forEach((button) => {
    bindPress(button, () => {
      navButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

async function switchCamera() {
  if (!ui.toggleCamera) {
    return;
  }

  const previousMode = currentFacingMode;
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  ui.toggleCamera.disabled = true;
  setStatus("Switching camera...");

  try {
    const video = await initCamera({ videoId: "video", facingMode: currentFacingMode });
    currentFacingMode = video.dataset.facingMode || currentFacingMode;
    if (appRuntime) {
      appRuntime.video = video;
      appRuntime.mirrored = currentFacingMode === "user";
    }
    resizeCanvas(video);
    setStatus("Tracking");
  } catch (error) {
    currentFacingMode = previousMode;
    const message = error instanceof Error ? error.message : "Unable to switch camera.";
    setStatus(message, true);
  } finally {
    ui.toggleCamera.disabled = false;
  }
}

function bindControls() {
  if (ui.toggleMotion) {
    updateToggleButton();
    bindPress(ui.toggleMotion, () => {
      motionTracker.enabled = !motionTracker.enabled;
      if (!motionTracker.enabled) {
        resetMotionTracker();
      }
      updateToggleButton();
    });
  }

  if (ui.toggleCamera) {
    bindPress(ui.toggleCamera, () => {
      void switchCamera();
    });
  }

  if (ui.metricsToggle) {
    bindPress(ui.metricsToggle, () => {
      setMetricsExpanded(!metricsExpanded, true);
    });
  }

  bindExerciseSelector();
  bindBottomNav();
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
  if (timestamp - lastFrameTime < 33) {
    requestAnimationFrame((nextTimestamp) => runFrame(runtime, nextTimestamp));
    return;
  }
  lastFrameTime = timestamp;

  const results = detectFrame(runtime.video, timestamp);
  const landmarks = extractLandmarks(results);
  if (landmarks) {
    const width = Math.max(1, ui.canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, ui.canvas.clientHeight || window.innerHeight || 1);
    updateMotionTracker(landmarks, timestamp, width, height, isMobileViewport());
  }

  drawFullFrame(ctx, runtime.video, results, runtime.mirrored);

  const angles = extractAngles(landmarks, timestamp);
  const repData = updateRepCounter(angles, getState().currentExercise);
  if (repData) {
    runtime.latestScore = processRep(repData);
  }

  updateDashboard(runtime.latestScore);
  requestAnimationFrame((nextTimestamp) => runFrame(runtime, nextTimestamp));
}

function handleViewportChange() {
  if (!appRuntime?.video) {
    return;
  }

  resizeCanvas(appRuntime.video);
  if (isTabletViewport()) {
    setMetricsExpanded(false, true);
  } else {
    setMetricsExpanded(true, true);
  }
  syncTrackingUiState();
}

async function startApp() {
  try {
    bindControls();
    setMetricsExpanded(!isTabletViewport(), true);

    setStatus("Initializing camera...");
    const video = await initCamera({ videoId: "video", facingMode: currentFacingMode });
    currentFacingMode = video.dataset.facingMode || currentFacingMode;
    resizeCanvas(video);

    setStatus("Loading pose model...");
    await initPose();

    setStatus("Tracking");
    const runtime = {
      video,
      latestScore: null,
      mirrored: currentFacingMode === "user"
    };
    appRuntime = runtime;
    lastFrameTime = 0;

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", () => {
      setTimeout(handleViewportChange, 120);
    });

    requestAnimationFrame((frameTimestamp) => runFrame(runtime, frameTimestamp));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start tracker.";
    setStatus(message, true);
  }
}

startApp();
