const MAX_HISTORY_DESKTOP = 60;
const MAX_HISTORY_MOBILE = 30;

const CHAIN_DEFINITIONS = [
  {
    key: "upperBodyChain",
    name: "Upper Body",
    jointIndices: [11, 12, 24, 23],
    color: "#7df9ff"
  },
  {
    key: "lowerBodyChain",
    name: "Lower Body",
    jointIndices: [23, 24, 26, 25],
    color: "#b7f8ff"
  },
  {
    key: "leftArmChain",
    name: "Left Arm",
    jointIndices: [11, 13, 15],
    color: "#46e1ff"
  },
  {
    key: "rightArmChain",
    name: "Right Arm",
    jointIndices: [12, 14, 16],
    color: "#a4edff"
  },
  {
    key: "leftLegChain",
    name: "Left Leg",
    jointIndices: [23, 25, 27],
    color: "#5fd7ff"
  },
  {
    key: "rightLegChain",
    name: "Right Leg",
    jointIndices: [24, 26, 28],
    color: "#d3f4ff"
  }
];

const ANGLE_DEFINITIONS = [
  { jointIndices: [11, 13, 15], color: "#d6f9ff" },
  { jointIndices: [12, 14, 16], color: "#d6f9ff" },
  { jointIndices: [23, 25, 27], color: "#d6f9ff" },
  { jointIndices: [24, 26, 28], color: "#d6f9ff" },
  { jointIndices: [11, 23, 25], color: "#f7fdff" },
  { jointIndices: [12, 24, 26], color: "#f7fdff" }
];

export const motionTracker = { enabled: true };

const tracker = {
  width: 1,
  height: 1,
  historyLimit: MAX_HISTORY_DESKTOP,
  isMobile: false,
  lastTimestamp: 0,
  hasFrame: false,
  latestLandmarks: null,
  chains: [],
  upperBodyChain: null,
  lowerBodyChain: null,
  leftArmChain: null,
  rightArmChain: null,
  leftLegChain: null,
  rightLegChain: null,
  metrics: {
    timestamp: 0,
    upperBodyChain: 0,
    lowerBodyChain: 0,
    leftArmChain: 0,
    rightArmChain: 0,
    leftLegChain: 0,
    rightLegChain: 0
  }
};

function createTrailBuffer() {
  return {
    x: new Float32Array(MAX_HISTORY_DESKTOP),
    y: new Float32Array(MAX_HISTORY_DESKTOP),
    head: 0,
    size: 0,
    lastX: Number.NaN,
    lastY: Number.NaN
  };
}

function createChain(definition) {
  const history = new Array(definition.jointIndices.length);
  for (let i = 0; i < history.length; i += 1) {
    history[i] = createTrailBuffer();
  }

  return {
    key: definition.key,
    name: definition.name,
    jointIndices: definition.jointIndices.slice(),
    color: definition.color,
    history,
    currentX: new Float32Array(definition.jointIndices.length),
    currentY: new Float32Array(definition.jointIndices.length),
    currentVisible: new Uint8Array(definition.jointIndices.length),
    speed: 0
  };
}

function initializeChains() {
  tracker.chains = new Array(CHAIN_DEFINITIONS.length);
  for (let i = 0; i < CHAIN_DEFINITIONS.length; i += 1) {
    const chain = createChain(CHAIN_DEFINITIONS[i]);
    tracker.chains[i] = chain;
    tracker[chain.key] = chain;
  }
}

function clearTrail(trail) {
  trail.head = 0;
  trail.size = 0;
  trail.lastX = Number.NaN;
  trail.lastY = Number.NaN;
}

function resetChain(chain) {
  for (let i = 0; i < chain.history.length; i += 1) {
    clearTrail(chain.history[i]);
  }
  chain.currentVisible.fill(0);
  chain.speed = 0;
  tracker.metrics[chain.key] = 0;
}

function updateHistoryLimit(isMobile) {
  tracker.isMobile = !!isMobile;
  tracker.historyLimit = tracker.isMobile ? MAX_HISTORY_MOBILE : MAX_HISTORY_DESKTOP;
}

export function initMotionTracker(canvasWidth, canvasHeight, isMobile = false) {
  tracker.width = Math.max(1, canvasWidth || 1);
  tracker.height = Math.max(1, canvasHeight || 1);
  updateHistoryLimit(isMobile);
  if (!tracker.chains.length) {
    initializeChains();
  }
  resetMotionTracker();
}

export function resetMotionTracker() {
  tracker.lastTimestamp = 0;
  tracker.hasFrame = false;
  tracker.latestLandmarks = null;
  tracker.metrics.timestamp = 0;
  for (let i = 0; i < tracker.chains.length; i += 1) {
    resetChain(tracker.chains[i]);
  }
}

function pushTrailPoint(trail, x, y) {
  let displacement = -1;
  if (Number.isFinite(trail.lastX) && Number.isFinite(trail.lastY)) {
    displacement = Math.hypot(x - trail.lastX, y - trail.lastY);
  }

  trail.lastX = x;
  trail.lastY = y;
  trail.x[trail.head] = x;
  trail.y[trail.head] = y;
  trail.head = (trail.head + 1) % MAX_HISTORY_DESKTOP;
  if (trail.size < MAX_HISTORY_DESKTOP) {
    trail.size += 1;
  }

  return displacement;
}

function updateChain(chain, landmarks, deltaMs, width, height) {
  let displacementSum = 0;
  let displacementCount = 0;
  chain.currentVisible.fill(0);

  for (let i = 0; i < chain.jointIndices.length; i += 1) {
    const landmark = landmarks[chain.jointIndices[i]];
    if (!landmark) {
      continue;
    }

    const x = landmark.x * width;
    const y = landmark.y * height;
    chain.currentVisible[i] = 1;
    chain.currentX[i] = x;
    chain.currentY[i] = y;

    const displacement = pushTrailPoint(chain.history[i], x, y);
    if (displacement >= 0) {
      displacementSum += displacement;
      displacementCount += 1;
    }
  }

  const seconds = Math.max(deltaMs / 1000, 0.001);
  chain.speed = displacementCount ? (displacementSum / displacementCount) / seconds : 0;
  tracker.metrics[chain.key] = chain.speed;
}

export function updateMotionTracker(
  landmarks,
  timestamp,
  canvasWidth,
  canvasHeight,
  isMobile = false
) {
  if (!landmarks?.length) {
    return;
  }

  updateHistoryLimit(isMobile);
  tracker.width = Math.max(1, canvasWidth || tracker.width);
  tracker.height = Math.max(1, canvasHeight || tracker.height);

  const deltaMs = tracker.hasFrame ? Math.max(1, timestamp - tracker.lastTimestamp) : 16.67;
  tracker.latestLandmarks = landmarks;
  tracker.lastTimestamp = timestamp;
  tracker.metrics.timestamp = timestamp;
  tracker.hasFrame = true;

  for (let i = 0; i < tracker.chains.length; i += 1) {
    updateChain(tracker.chains[i], landmarks, deltaMs, tracker.width, tracker.height);
  }
}

function trailIndex(trail, offset, available) {
  const start = trail.head - available;
  return (start + offset + MAX_HISTORY_DESKTOP) % MAX_HISTORY_DESKTOP;
}

function drawTrailsForChain(ctx, chain) {
  ctx.strokeStyle = chain.color;
  ctx.lineWidth = tracker.isMobile ? 1.35 : 1.7;

  for (let joint = 0; joint < chain.history.length; joint += 1) {
    const trail = chain.history[joint];
    const available = Math.min(trail.size, tracker.historyLimit);
    if (available < 2) {
      continue;
    }

    for (let step = 1; step < available; step += 1) {
      const indexA = trailIndex(trail, step - 1, available);
      const indexB = trailIndex(trail, step, available);
      ctx.globalAlpha = (step / available) * (tracker.isMobile ? 0.38 : 0.52);
      ctx.beginPath();
      ctx.moveTo(trail.x[indexA], trail.y[indexA]);
      ctx.lineTo(trail.x[indexB], trail.y[indexB]);
      ctx.stroke();
    }
  }
}

function drawSegmentsForChain(ctx, chain) {
  ctx.strokeStyle = "#7cf9ff";
  ctx.lineWidth = tracker.isMobile ? 2.1 : 2.6;
  ctx.globalAlpha = 0.94;

  for (let i = 1; i < chain.jointIndices.length; i += 1) {
    if (!chain.currentVisible[i - 1] || !chain.currentVisible[i]) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(chain.currentX[i - 1], chain.currentY[i - 1]);
    ctx.lineTo(chain.currentX[i], chain.currentY[i]);
    ctx.stroke();
  }
}

function calculateAngle(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const abz = (a.z || 0) - (b.z || 0);
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const cbz = (c.z || 0) - (b.z || 0);

  const dot = abx * cbx + aby * cby + abz * cbz;
  const magAB = Math.hypot(abx, aby, abz);
  const magCB = Math.hypot(cbx, cby, cbz);
  if (magAB === 0 || magCB === 0) {
    return Number.NaN;
  }

  const cosine = Math.max(-1, Math.min(1, dot / (magAB * magCB)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function drawSingleAngle(ctx, landmarks, definition) {
  const a = landmarks[definition.jointIndices[0]];
  const b = landmarks[definition.jointIndices[1]];
  const c = landmarks[definition.jointIndices[2]];
  if (!a || !b || !c) {
    return;
  }

  const angle = calculateAngle(a, b, c);
  if (!Number.isFinite(angle)) {
    return;
  }

  const x = b.x * tracker.width + 7;
  const y = b.y * tracker.height - 7;
  const text = `${Math.round(angle)} deg`;
  ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
  ctx.fillRect(x - 3, y - 11, 56, 14);
  ctx.fillStyle = definition.color;
  ctx.fillText(text, x, y);
}

function drawAngleLabels(ctx) {
  if (!tracker.latestLandmarks) {
    return;
  }

  ctx.font = tracker.isMobile ? "11px Segoe UI" : "12px Segoe UI";
  ctx.textBaseline = "middle";

  for (let i = 0; i < ANGLE_DEFINITIONS.length; i += 1) {
    drawSingleAngle(ctx, tracker.latestLandmarks, ANGLE_DEFINITIONS[i]);
  }
}

export function drawMotionOverlay(ctx) {
  if (!motionTracker.enabled || !tracker.chains.length) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i < tracker.chains.length; i += 1) {
    drawTrailsForChain(ctx, tracker.chains[i]);
  }

  for (let i = 0; i < tracker.chains.length; i += 1) {
    drawSegmentsForChain(ctx, tracker.chains[i]);
  }

  drawAngleLabels(ctx);
  ctx.restore();
}

export function getMotionMetrics() {
  return tracker.metrics;
}
