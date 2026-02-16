let activeStream = null;

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildConstraints(facingMode) {
  const mobile = isMobileDevice();
  return {
    audio: false,
    video: {
      width: { ideal: mobile ? 640 : 1280 },
      height: { ideal: mobile ? 480 : 720 },
      facingMode: { ideal: facingMode }
    }
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

function normalizeOptions(options = {}) {
  if (typeof options === "string") {
    return { videoId: options, facingMode: "user" };
  }

  return {
    videoId: options.videoId || "video",
    facingMode: options.facingMode || "user"
  };
}

function fallbackFacingMode(mode) {
  return mode === "user" ? "environment" : "user";
}

function mapCameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera access denied. Allow permission and reload.";
  }

  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "No compatible camera found for this mode.";
  }

  return "Unable to start camera stream.";
}

async function getStreamForFacingMode(facingMode) {
  const constraints = buildConstraints(facingMode);
  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function initCamera(options = {}) {
  const { videoId, facingMode } = normalizeOptions(options);
  const video = document.getElementById(videoId);
  if (!video) {
    throw new Error(`Missing video element: #${videoId}`);
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API is not supported in this browser.");
  }

  stopActiveStream();

  let stream;
  let resolvedMode = facingMode;
  try {
    stream = await getStreamForFacingMode(facingMode);
  } catch (primaryError) {
    resolvedMode = fallbackFacingMode(facingMode);
    try {
      stream = await getStreamForFacingMode(resolvedMode);
    } catch {
      throw new Error(mapCameraError(primaryError));
    }
  }

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await waitForMetadata(video);
  await video.play();

  activeStream = stream;
  video.dataset.facingMode = resolvedMode;
  return video;
}
