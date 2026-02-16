let activeStream = null;

function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildConstraints(facingMode) {
  const mobile = isMobileDevice();
  return {
    audio: false,
    video: {
      width: { ideal: mobile ? 480 : 1280 },
      height: { ideal: mobile ? 360 : 720 },
      facingMode: { ideal: facingMode }
    }
  };
}

function stopStream(stream) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => track.stop());
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

async function requestStream(facingMode) {
  const constraints = buildConstraints(facingMode);
  return navigator.mediaDevices.getUserMedia(constraints);
}

function getFallbackMode(facingMode) {
  return facingMode === "user" ? "environment" : "user";
}

function toErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera access denied. Allow permission and reload.";
  }

  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "No compatible camera found on this device.";
  }

  return "Unable to start camera stream.";
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

  stopStream(activeStream);

  let stream;
  let resolvedFacingMode = facingMode;
  try {
    stream = await requestStream(facingMode);
  } catch (primaryError) {
    const fallbackMode = getFallbackMode(facingMode);
    resolvedFacingMode = fallbackMode;
    try {
      stream = await requestStream(fallbackMode);
    } catch {
      throw new Error(toErrorMessage(primaryError));
    }
  }

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await waitForMetadata(video);
  await video.play();

  activeStream = stream;
  video.dataset.facingMode = resolvedFacingMode;
  return video;
}
