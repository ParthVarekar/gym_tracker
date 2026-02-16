const CHAIN_DEFINITIONS = [
  {
    key: "upperBodyChain",
    jointIndices: [11, 12, 24, 23],
    color: "#7cf9ff"
  },
  {
    key: "leftArmChain",
    jointIndices: [11, 13, 15],
    color: "#9ffbff"
  },
  {
    key: "rightArmChain",
    jointIndices: [12, 14, 16],
    color: "#9ffbff"
  },
  {
    key: "leftLegChain",
    jointIndices: [23, 25, 27],
    color: "#7cf9ff"
  },
  {
    key: "rightLegChain",
    jointIndices: [24, 26, 28],
    color: "#7cf9ff"
  }
];

export const motionTracker = { enabled: true };

const tracker = {
  width: 1,
  height: 1,
  timestamp: 0,
  chains: [],
  metrics: {
    timestamp: 0,
    upperBodyChain: 0,
    leftArmChain: 0,
    rightArmChain: 0,
    leftLegChain: 0,
    rightLegChain: 0
  }
};

function createChain(definition) {
  const size = definition.jointIndices.length;
  return {
    key: definition.key,
    jointIndices: definition.jointIndices.slice(),
    color: definition.color,
    currentX: new Float32Array(size),
    currentY: new Float32Array(size),
    visible: new Uint8Array(size),
    speed: 0
  };
}

function initializeChains() {
  tracker.chains = CHAIN_DEFINITIONS.map((definition) => createChain(definition));
}

function resetChain(chain) {
  chain.visible.fill(0);
  chain.speed = 0;
  tracker.metrics[chain.key] = 0;
}

function clearCurrentFrame() {
  tracker.chains.forEach((chain) => resetChain(chain));
}

export function initMotionTracker(canvasWidth, canvasHeight) {
  tracker.width = Math.max(1, canvasWidth || 1);
  tracker.height = Math.max(1, canvasHeight || 1);
  if (!tracker.chains.length) {
    initializeChains();
  }
  clearCurrentFrame();
}

export function resetMotionTracker() {
  tracker.timestamp = 0;
  tracker.metrics.timestamp = 0;
  clearCurrentFrame();
}

function updateChain(chain, landmarks, deltaMs, width, height) {
  let displacement = 0;
  let count = 0;

  for (let i = 0; i < chain.jointIndices.length; i += 1) {
    const landmark = landmarks[chain.jointIndices[i]];
    if (!landmark) {
      chain.visible[i] = 0;
      continue;
    }

    const x = landmark.x * width;
    const y = landmark.y * height;

    if (chain.visible[i]) {
      displacement += Math.hypot(x - chain.currentX[i], y - chain.currentY[i]);
      count += 1;
    }

    chain.currentX[i] = x;
    chain.currentY[i] = y;
    chain.visible[i] = 1;
  }

  const seconds = Math.max(deltaMs / 1000, 0.001);
  chain.speed = count ? displacement / count / seconds : 0;
  tracker.metrics[chain.key] = chain.speed;
}

export function updateMotionTracker(landmarks, timestamp, canvasWidth, canvasHeight) {
  tracker.width = Math.max(1, canvasWidth || tracker.width);
  tracker.height = Math.max(1, canvasHeight || tracker.height);

  if (!landmarks?.length) {
    tracker.timestamp = timestamp || tracker.timestamp;
    tracker.metrics.timestamp = tracker.timestamp;
    clearCurrentFrame();
    return;
  }

  const deltaMs = tracker.timestamp ? Math.max(1, timestamp - tracker.timestamp) : 16.67;
  tracker.timestamp = timestamp;
  tracker.metrics.timestamp = timestamp;

  tracker.chains.forEach((chain) => {
    updateChain(chain, landmarks, deltaMs, tracker.width, tracker.height);
  });
}

function drawChain(ctx, chain) {
  ctx.strokeStyle = chain.color;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.92;

  for (let i = 1; i < chain.jointIndices.length; i += 1) {
    if (!chain.visible[i - 1] || !chain.visible[i]) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(chain.currentX[i - 1], chain.currentY[i - 1]);
    ctx.lineTo(chain.currentX[i], chain.currentY[i]);
    ctx.stroke();
  }
}

export function drawMotionOverlay(ctx) {
  if (!motionTracker.enabled || !tracker.chains.length) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  tracker.chains.forEach((chain) => drawChain(ctx, chain));
  ctx.restore();
}

export function getMotionMetrics() {
  return tracker.metrics;
}
