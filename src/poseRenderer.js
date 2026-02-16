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

export function drawPose(ctx, video, results) {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const poseLandmarks = getPoseLandmarks(results);
  if (!poseLandmarks.length) {
    return;
  }

  drawLandmarkSet(ctx, poseLandmarks);
}

export function drawFullFrame(ctx, video, results) {
  const canvas = ctx.canvas;
  const logicalWidth = canvas.clientWidth || video.videoWidth || canvas.width;
  const logicalHeight = canvas.clientHeight || video.videoHeight || canvas.height;

  ctx.clearRect(0, 0, logicalWidth, logicalHeight);

  ctx.drawImage(video, 0, 0, logicalWidth, logicalHeight);

  const poseLandmarks = getPoseLandmarks(results);
  if (poseLandmarks.length) {
    drawLandmarkSet(ctx, poseLandmarks);
  }

  const handLandmarks = getHandLandmarks(results);
  if (handLandmarks.length) {
    drawHandSet(ctx, handLandmarks);
  }

  drawMotionOverlay(ctx);
}
