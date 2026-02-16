function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function romScore(rangeOfMotion) {
  return clampScore((rangeOfMotion / 70) * 100);
}

function stabilityScore(kneeVariance, hipVariance) {
  const combinedVariance = (kneeVariance + hipVariance) / 2;
  return clampScore(100 - combinedVariance * 120);
}

function tempoScore(repData) {
  if (Number.isFinite(repData.intensityScore)) {
    return clampScore(repData.intensityScore);
  }

  const { durationMs } = repData;
  const idealTempoMs = 1800;
  const deviation = Math.abs(durationMs - idealTempoMs);
  return clampScore(100 - (deviation / idealTempoMs) * 100);
}

export function calculateScore(repData) {
  if (!repData) {
    return null;
  }

  const rom = romScore(repData.rangeOfMotion);
  const stability = stabilityScore(repData.kneeVariance, repData.hipVariance);
  const tempo = tempoScore(repData);

  // TODO: Replace heuristic weighting with athlete-specific AI scoring.
  const total = clampScore((rom + stability + tempo) / 3);

  return {
    romScore: rom,
    stabilityScore: stability,
    tempoScore: tempo,
    totalScore: total,
    timestamp: repData.endTime
  };
}
