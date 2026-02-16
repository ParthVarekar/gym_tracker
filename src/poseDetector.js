import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker
} from "./vendor/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let poseLandmarker = null;
let handLandmarker = null;

export async function initPose() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.2,
    minPosePresenceConfidence: 0.2,
    minTrackingConfidence: 0.2
  });

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.2,
    minHandPresenceConfidence: 0.2,
    minTrackingConfidence: 0.2
  });

  return poseLandmarker;
}

export function detectFrame(video, timestamp) {
  if (!poseLandmarker) {
    throw new Error("Pose landmarker is not initialized.");
  }

  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return null;
  }

  const poseResults = poseLandmarker.detectForVideo(video, timestamp);
  const handResults = handLandmarker?.detectForVideo(video, timestamp);

  if (!handResults) {
    return poseResults;
  }

  poseResults.handLandmarks = handResults.landmarks || handResults.handLandmarks || [];
  poseResults.handWorldLandmarks = handResults.worldLandmarks || handResults.handWorldLandmarks || [];
  poseResults.handedness = handResults.handedness || handResults.handednesses || [];
  return poseResults;
}
