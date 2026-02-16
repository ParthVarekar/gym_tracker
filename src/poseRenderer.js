import {
  DrawingUtils,
  PoseLandmarker
} from "./vendor/vision_bundle.mjs";
import { drawMotionOverlay } from "./motionTracker.js";

const SKELETON_STYLE = {
  color: "#35ee86",
  lineWidth: 2.4
};

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

function clearFrame(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

function applyMirrorTransform(ctx, width, mirrored) {
  ctx.save();
  if (!mirrored) {
    return;
  }

  ctx.translate(width, 0);
  ctx.scale(-1, 1);
}

function drawSkeleton(ctx, poseLandmarks) {
  const drawingUtils = new DrawingUtils(ctx);
  poseLandmarks.forEach((landmarks) => {
    drawingUtils.drawConnectors(
      landmarks,
      PoseLandmarker.POSE_CONNECTIONS,
      SKELETON_STYLE
    );
  });
}

export function drawFullFrame(ctx, video, results, options = {}) {
  const mirrored = !!options.mirrored;
  const showMotionLines = options.showMotionLines !== false;
  const { width, height } = getCanvasSize(ctx);

  clearFrame(ctx, width, height);
  applyMirrorTransform(ctx, width, mirrored);
  ctx.drawImage(video, 0, 0, width, height);

  const poseLandmarks = getPoseLandmarks(results);
  if (poseLandmarks.length) {
    drawSkeleton(ctx, poseLandmarks);
  }

  if (showMotionLines) {
    drawMotionOverlay(ctx);
  }

  ctx.restore();
}
