let activeStream = null;
let currentFacingMode = "user";

function isMobileDevice() {
  return /Mobi|Android|iPhone/i.test(navigator.userAgent);
}

function buildVideoConstraints(facingMode) {
  const mobile = isMobileDevice();
  return {
    width: { ideal: mobile ? 640 : 1280 },
    height: { ideal: mobile ? 480 : 720 },
    facingMode: { ideal: facingMode }
  };
}

function stopActiveStream() {
  if (!activeStream) {
    return;
  }

  activeStream.getTracks().forEach((track) => track.stop());
  activeStream = null;
}

async function waitForMetadata(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

async function requestStream(facingMode) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: buildVideoConstraints(facingMode)
  });
}

function fallbackFacingMode(mode) {
  return mode === "user" ? "environment" : "user";
}

function getCameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera access denied. Allow permission and reload.";
  }

  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "No compatible camera found for this mode.";
  }

  return "Unable to start camera stream.";
}

function getVideoElement(videoId = "video") {
  const video = document.getElementById(videoId);
  if (!video) {
    throw new Error(`Missing video element: #${videoId}`);
  }

  return video;
}

async function attachStreamToVideo(video, stream, facingMode) {
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await waitForMetadata(video);
  await video.play();

  activeStream = stream;
  currentFacingMode = facingMode;
  video.dataset.facingMode = facingMode;
  return video;
}

export async function initCamera(options = {}) {
  const videoId = options.videoId || "video";
  const preferredMode = options.facingMode || currentFacingMode;
  const video = getVideoElement(videoId);

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is not supported in this browser.");
  }

  stopActiveStream();

  try {
    const stream = await requestStream(preferredMode);
    return attachStreamToVideo(video, stream, preferredMode);
  } catch (primaryError) {
    const fallbackMode = fallbackFacingMode(preferredMode);
    try {
      const stream = await requestStream(fallbackMode);
      return attachStreamToVideo(video, stream, fallbackMode);
    } catch {
      throw new Error(getCameraError(primaryError));
    }
  }
}

export async function switchCamera(videoId = "video") {
  const nextMode = currentFacingMode === "user" ? "environment" : "user";
  return initCamera({ videoId, facingMode: nextMode });
}

export function getCurrentFacingMode() {
  return currentFacingMode;
}
