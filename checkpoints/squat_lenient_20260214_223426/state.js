const state = {
  currentExercise: "pushup",
  currentReps: 0,
  currentPhase: "idle",
  repHistory: [],
  scoreHistory: []
};

export function getState() {
  return state;
}

export function setPhase(phase) {
  state.currentPhase = phase;
}

export function setExercise(exercise) {
  state.currentExercise = exercise;
}

export function incrementReps() {
  state.currentReps += 1;
  return state.currentReps;
}

export function addRep(repData) {
  state.repHistory.push(repData);
}

export function addScore(scoreData) {
  state.scoreHistory.push(scoreData);
}

export function resetTrackingState() {
  state.currentReps = 0;
  state.currentPhase = "idle";
  state.repHistory = [];
  state.scoreHistory = [];
}
