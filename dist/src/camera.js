async function waitForMetadata(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
}

function applyVideoResolution(video) {
  video.width = video.videoWidth;
  video.height = video.videoHeight;
}

export async function initCamera(videoId = "video") {
  const video = document.getElementById(videoId);
  if (!video) {
    throw new Error(`Missing video element: #${videoId}`);
  }

  const constraints = {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user"
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await waitForMetadata(video);
  await video.play();
  applyVideoResolution(video);
  return video;
}
