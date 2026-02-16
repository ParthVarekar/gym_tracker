import {
  DrawingUtils,
  HandLandmarker,
  PoseLandmarker
} from "./vendor/vision_bundle.mjs";
import { drawMotionOverlay } from "./motionTracker.js";

const CONNECTOR_STYLE = { color: "#30d158", lineWidth: 4 };
const LANDMARK_STYLE = { color: "#f8fafc", lineWidth: 1, radius: 3 };
const HAND_CONNECTOR_STYLE = { color: "#00e5ff", lineWidth: 3 };
const HAND_LANDMARK_STYLE = { color: "#ffffff", lineWidth: 1, radius: 2.5 };

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
  const drawWidth = ctx.canvas.width || video.videoWidth || ctx.canvas.clientWidth;
  const drawHeight = ctx.canvas.height || video.videoHeight || ctx.canvas.clientHeight;
  clearFrame(ctx, drawWidth, drawHeight);
  applyMirrorTransform(ctx, drawWidth, mirrored);
  ctx.drawImage(video, 0, 0, drawWidth, drawHeight);

  const poseLandmarks = getPoseLandmarks(results);
  if (!poseLandmarks.length) {
    ctx.restore();
    return;
  }

  drawLandmarkSet(ctx, poseLandmarks);
  ctx.restore();
}

export function drawFullFrame(ctx, video, results, mirrored = false) {
  const drawWidth = ctx.canvas.width || video.videoWidth || ctx.canvas.clientWidth;
  const drawHeight = ctx.canvas.height || video.videoHeight || ctx.canvas.clientHeight;

  clearFrame(ctx, drawWidth, drawHeight);
  applyMirrorTransform(ctx, drawWidth, mirrored);
  ctx.drawImage(video, 0, 0, drawWidth, drawHeight);

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
