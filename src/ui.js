function bindTap(element, handler) {
  if (!element) {
    return;
  }

  let touched = false;
  element.addEventListener("touchend", (event) => {
    touched = true;
    event.preventDefault();
    handler();
  }, { passive: false });

  element.addEventListener("click", () => {
    if (touched) {
      touched = false;
      return;
    }
    handler();
  });
}

function formatRepEntry(repData) {
  const exercise = repData.exercise || "rep";
  const duration = Number.isFinite(repData.durationMs)
    ? `${Math.round(repData.durationMs)}ms`
    : "--";

  if (!Number.isFinite(repData.endTime)) {
    return `${exercise} • ${duration}`;
  }

  const timestamp = new Date(repData.endTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return `${exercise} • ${duration} • ${timestamp}`;
}

export function createUI() {
  const elements = {
    canvas: document.getElementById("canvas"),
    menuButton: document.getElementById("menu-button"),
    menuBackdrop: document.getElementById("menu-backdrop"),
    sideMenu: document.getElementById("side-menu"),
    panelHandle: document.getElementById("panel-handle"),
    bottomPanel: document.getElementById("bottom-panel"),
    toggleStats: document.getElementById("toggle-stats"),
    toggleMotion: document.getElementById("toggle-motion"),
    toggleCamera: document.getElementById("toggle-camera"),
    exerciseSelect: document.getElementById("exercise-select"),
    repValue: document.getElementById("rep-value"),
    phaseValue: document.getElementById("phase-value"),
    statusValue: document.getElementById("status-value"),
    statsAccordion: document.getElementById("stats-accordion"),
    romValue: document.getElementById("rom-value"),
    stabilityValue: document.getElementById("stability-value"),
    tempoValue: document.getElementById("tempo-value"),
    totalValue: document.getElementById("total-value"),
    historyList: document.getElementById("history-list")
  };

  const callbacks = {
    exerciseChange: null,
    motionToggle: null,
    cameraToggle: null,
    menuToggle: null,
    statsToggle: null
  };

  const state = {
    currentExercise: "pushup",
    reps: 0,
    phase: "idle",
    motionLinesEnabled: true,
    statsExpanded: false,
    menuOpen: false,
    cameraFacingMode: "user"
  };

  function setStatsExpanded(expanded) {
    state.statsExpanded = !!expanded;
    elements.statsAccordion.hidden = !state.statsExpanded;
    elements.bottomPanel.classList.toggle("expanded", state.statsExpanded);
    elements.toggleStats.setAttribute("aria-expanded", String(state.statsExpanded));
    elements.toggleStats.textContent = state.statsExpanded ? "Hide Stats" : "Show Stats";
    callbacks.statsToggle?.(state.statsExpanded);
  }

  function setMenuOpen(open) {
    state.menuOpen = !!open;
    elements.sideMenu.classList.toggle("open", state.menuOpen);
    elements.menuBackdrop.classList.toggle("open", state.menuOpen);
    elements.sideMenu.setAttribute("aria-hidden", String(!state.menuOpen));
    callbacks.menuToggle?.(state.menuOpen);
  }

  function setMotionLinesEnabled(enabled) {
    state.motionLinesEnabled = !!enabled;
    elements.toggleMotion.textContent = state.motionLinesEnabled
      ? "Motion Lines: ON"
      : "Motion Lines: OFF";
  }

  function setCameraFacingMode(mode) {
    state.cameraFacingMode = mode || "user";
  }

  function setCameraBusy(busy) {
    elements.toggleCamera.disabled = !!busy;
  }

  function setStatus(message, isError = false) {
    elements.statusValue.textContent = message;
    elements.statusValue.classList.toggle("error", isError);
  }

  function setHeader(reps, phase, exercise) {
    state.reps = reps;
    state.phase = phase;
    state.currentExercise = exercise;

    elements.repValue.textContent = String(reps);
    elements.phaseValue.textContent = phase;
    elements.exerciseSelect.value = exercise;
  }

  function setScores(scoreData) {
    if (!scoreData) {
      elements.romValue.textContent = "--";
      elements.stabilityValue.textContent = "--";
      elements.tempoValue.textContent = "--";
      elements.totalValue.textContent = "--";
      return;
    }

    elements.romValue.textContent = String(scoreData.romScore);
    elements.stabilityValue.textContent = String(scoreData.stabilityScore);
    elements.tempoValue.textContent = String(scoreData.tempoScore);
    elements.totalValue.textContent = String(scoreData.totalScore);
  }

  function setHistory(repHistory) {
    const latest = (repHistory || []).slice(-5).reverse();
    if (!latest.length) {
      elements.historyList.innerHTML = '<li class="history-empty">No reps yet</li>';
      return;
    }

    elements.historyList.innerHTML = latest
      .map((repData) => `<li>${formatRepEntry(repData)}</li>`)
      .join("");
  }

  function getCanvasSize() {
    return {
      width: Math.max(1, elements.canvas.clientWidth || window.innerWidth || 1),
      height: Math.max(1, elements.canvas.clientHeight || window.innerHeight || 1)
    };
  }

  function onExerciseChange(handler) {
    callbacks.exerciseChange = handler;
  }

  function onMotionToggle(handler) {
    callbacks.motionToggle = handler;
  }

  function onCameraToggle(handler) {
    callbacks.cameraToggle = handler;
  }

  function onMenuToggle(handler) {
    callbacks.menuToggle = handler;
  }

  function onStatsToggle(handler) {
    callbacks.statsToggle = handler;
  }

  function bindEvents() {
    elements.exerciseSelect.addEventListener("change", () => {
      state.currentExercise = elements.exerciseSelect.value;
      callbacks.exerciseChange?.(state.currentExercise);
    });

    bindTap(elements.toggleMotion, () => callbacks.motionToggle?.());
    bindTap(elements.toggleCamera, () => callbacks.cameraToggle?.());
    bindTap(elements.toggleStats, () => setStatsExpanded(!state.statsExpanded));

    bindTap(elements.menuButton, () => setMenuOpen(!state.menuOpen));
    bindTap(elements.menuBackdrop, () => setMenuOpen(false));

    let startY = 0;
    elements.panelHandle.addEventListener("touchstart", (event) => {
      startY = event.changedTouches[0].clientY;
    }, { passive: true });

    elements.panelHandle.addEventListener("touchend", (event) => {
      const deltaY = event.changedTouches[0].clientY - startY;
      if (deltaY < -20) {
        setStatsExpanded(true);
      } else if (deltaY > 20) {
        setStatsExpanded(false);
      } else {
        setStatsExpanded(!state.statsExpanded);
      }
    }, { passive: true });

    elements.bottomPanel.addEventListener("wheel", (event) => {
      if (event.deltaY < 0 && !state.statsExpanded) {
        setStatsExpanded(true);
      }
      if (event.deltaY > 0 && state.statsExpanded && elements.statsAccordion.scrollTop === 0) {
        setStatsExpanded(false);
      }
    }, { passive: true });
  }

  bindEvents();
  setStatsExpanded(false);

  return {
    state,
    getCanvas: () => elements.canvas,
    getCanvasSize,
    setStatsExpanded,
    setMenuOpen,
    setMotionLinesEnabled,
    setCameraFacingMode,
    setCameraBusy,
    setStatus,
    setHeader,
    setScores,
    setHistory,
    onExerciseChange,
    onMotionToggle,
    onCameraToggle,
    onMenuToggle,
    onStatsToggle
  };
}
