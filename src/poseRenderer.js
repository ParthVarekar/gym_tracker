import {
  DrawingUtils,
  HandLandmarker,
  PoseLandmarker
} from "./vendor/vision_bundle.mjs";
import { drawMotionOverlay } from "./motionTracker.js";

const CONNECTOR_STYLE = { color: "#31f381", lineWidth: 3.5 };
const LANDMARK_STYLE = { color: "#f8fbff", lineWidth: 1, radius: 2.8 };
const HAND_CONNECTOR_STYLE = { color: "#57ecff", lineWidth: 2.5 };
const HAND_LANDMARK_STYLE = { color: "#ffffff", lineWidth: 1, radius: 2.2 };

function getCanvasSize(ctx) {
  return {
    width: Math.max(1, ctx.canvas.clientWidth || window.innerWidth || 1),
    height: Math.max(1, ctx.canvas.clientHeight || window.innerHeight || 1)
  };
}

function getPoseLandmarks(results) {
  if (!results) {
    return [];
  }

  return results.poseLandmarks || results.landmarks || [];
}

function getHandLandmarks(results) {
  if (!results) {
    return [];
  }

  return results.handLandmarks || [];
}

function drawLandmarkSet(ctx, poseLandmarks) {
  const drawingUtils = new DrawingUtils(ctx);
  poseLandmarks.forEach((landmarks) => {
    drawingUtils.drawConnectors(
      landmarks,
      PoseLandmarker.POSE_CONNECTIONS,
      CONNECTOR_STYLE
    );
    drawingUtils.drawLandmarks(landmarks, LANDMARK_STYLE);
  });
}

function drawHandSet(ctx, handLandmarks) {
  const drawingUtils = new DrawingUtils(ctx);
  handLandmarks.forEach((landmarks) => {
    drawingUtils.drawConnectors(
      landmarks,
      HandLandmarker.HAND_CONNECTIONS,
      HAND_CONNECTOR_STYLE
    );
    drawingUtils.drawLandmarks(landmarks, HAND_LANDMARK_STYLE);
  });
}

function clearFrame(ctx, width, height) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.restore();
}

function applyMirrorTransform(ctx, width, mirrored) {
  ctx.save();
  if (!mirrored) {
    return;
  }

  ctx.translate(width, 0);
  ctx.scale(-1, 1);
}

export function drawPose(ctx, video, results, mirrored = false) {
  const { width, height } = getCanvasSize(ctx);
  clearFrame(ctx, width, height);
  applyMirrorTransform(ctx, width, mirrored);
  ctx.drawImage(video, 0, 0, width, height);

  const poseLandmarks = getPoseLandmarks(results);
  if (poseLandmarks.length) {
    drawLandmarkSet(ctx, poseLandmarks);
  }

  ctx.restore();
}

export function drawFullFrame(ctx, video, results, mirrored = false) {
  const { width, height } = getCanvasSize(ctx);
  clearFrame(ctx, width, height);
  applyMirrorTransform(ctx, width, mirrored);
  ctx.drawImage(video, 0, 0, width, height);

  const poseLandmarks = getPoseLandmarks(results);
  if (poseLandmarks.length) {
    drawLandmarkSet(ctx, poseLandmarks);
  }

  const handLandmarks = getHandLandmarks(results);
  if (handLandmarks.length) {
    drawHandSet(ctx, handLandmarks);
  }

  drawMotionOverlay(ctx);
  ctx.restore();
}
