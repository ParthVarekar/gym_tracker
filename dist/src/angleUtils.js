function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isFinitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function midpoint(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) {
    return null;
  }

  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z || 0) + (b.z || 0)) / 2
  };
}

function distance2D(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) {
    return Number.NaN;
  }

  return Math.hypot(a.x - b.x, a.y - b.y);
}

function visibility(point) {
  return Number.isFinite(point?.visibility) ? point.visibility : 1;
}

function pickSide(landmarks, leftIndices, rightIndices) {
  const left = leftIndices.map((index) => landmarks[index]);
  const right = rightIndices.map((index) => landmarks[index]);
  const leftScore = left.reduce((sum, point) => sum + visibility(point), 0);
  const rightScore = right.reduce((sum, point) => sum + visibility(point), 0);
  return leftScore >= rightScore ? left : right;
}

export function calculateAngle(a, b, c) {
  if (!a || !b || !c) {
    return Number.NaN;
  }

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

  const cosTheta = clamp(dot / (magAB * magCB), -1, 1);
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

export function getKneeAngle(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const [hip, knee, ankle] = pickSide(landmarks, [23, 25, 27], [24, 26, 28]);
  return calculateAngle(hip, knee, ankle);
}

export function getHipAngle(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const [shoulder, hip, knee] = pickSide(landmarks, [11, 23, 25], [12, 24, 26]);
  return calculateAngle(shoulder, hip, knee);
}

export function getElbowAngle(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const [shoulder, elbow, wrist] = pickSide(landmarks, [11, 13, 15], [12, 14, 16]);
  return calculateAngle(shoulder, elbow, wrist);
}

export function getBodyStraightness(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  return calculateAngle(shoulder, hip, ankle);
}

export function getTorsoInclination(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  if (!isFinitePoint(shoulder) || !isFinitePoint(hip)) {
    return Number.NaN;
  }

  const dx = Math.abs(shoulder.x - hip.x);
  const dy = Math.abs(shoulder.y - hip.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function getHeadY(landmarks) {
  if (!landmarks?.length || !Number.isFinite(landmarks[0]?.y)) {
    return Number.NaN;
  }

  return landmarks[0].y;
}

export function getTorsoLength(landmarks) {
  if (!landmarks?.length) {
    return Number.NaN;
  }

  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  return distance2D(shoulder, hip);
}
