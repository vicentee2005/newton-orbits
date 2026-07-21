// ui.js
// Conecta el DOM (controles, tabla de cuerpos, lienzo) con la Simulation y el
// Renderer. No contiene física: solo lee/escribe el estado de `simulation.js`
// y dibuja a través de `renderer.js`.
//
// Script clásico (sin import/export): ver nota en body.js. Depende de que
// simulation.js, renderer.js y presets.js se hayan cargado antes.

(function () {
  window.NB = window.NB || {};
  const { Simulation } = window.NB;
  const { Camera, draw, pickBody } = window.NB;
  const PRESETS = window.NB.PRESETS;

  const VELOCITY_ARROW_SCALE = 6; // mismo factor para dibujar y para el arrastre de velocidad inicial
  const FORCE_ARROW_SCALE = 40;

  function initApp() {
    const sim = new Simulation();
    const camera = new Camera();

    const canvas = document.getElementById("scene");
    const canvasWrap = canvas.parentElement;
    const ctx = canvas.getContext("2d");

    const el = (id) => document.getElementById(id);
    const playPauseBtn = el("playPauseBtn");
    const stepBtn = el("stepBtn");
    const resetBtn = el("resetBtn");
    const speedInput = el("speedInput");
    const speedValue = el("speedValue");
    const dtInput = el("dtInput");
    const dtValue = el("dtValue");
    const gInput = el("gInput");
    const gValue = el("gValue");
    const integratorSelect = el("integratorSelect");
    const showTrails = el("showTrails");
    const showGrid = el("showGrid");
    const showLabels = el("showLabels");
    const showVelocity = el("showVelocity");
    const showForce = el("showForce");
    const showCenterOfMass = el("showCenterOfMass");
    const addBodyBtn = el("addBodyBtn");
    const deleteSelectedBtn = el("deleteSelectedBtn");
    const newBodyMass = el("newBodyMass");
    const addModeHint = el("addModeHint");
    const bodyTableBody = el("bodyTableBody");
    const presetCards = el("presetCards");
    const presetDescription = el("presetDescription");
    const exportBtn = el("exportBtn");
    const importBtn = el("importBtn");
    const importFileInput = el("importFileInput");
    const saveLocalBtn = el("saveLocalBtn");
    const loadLocalBtn = el("loadLocalBtn");
    const zoomInBtn = el("zoomInBtn");
    const zoomOutBtn = el("zoomOutBtn");
    const zoomResetBtn = el("zoomResetBtn");
    const canvasHint = el("canvasHint");
    const onCanvasDiagnostics = el("onCanvasDiagnostics");
    const diagKE = el("diagKE");
    const diagPE = el("diagPE");
    const diagE = el("diagE");
    const diagDrift = el("diagDrift");
    const diagP = el("diagP");
    const diagL = el("diagL");
    const diagTime = el("diagTime");
    const diagSubsteps = el("diagSubsteps");

    const charts = new window.NB.Charts({
      phaseCanvas: el("phaseChart"),
      energyCanvas: el("energyChart"),
      statusList: el("phaseStatus"),
    });

    const options = {
      showGrid: true,
      showTrails: true,
      showLabels: true,
      showVelocity: false,
      showForce: false,
      showCenterOfMass: false,
      velocityScale: VELOCITY_ARROW_SCALE,
      forceScale: FORCE_ARROW_SCALE,
      selectedId: null,
      dragPreview: null,
    };

    let addMode = false;
    let dragState = null; // { type: 'new'|'move'|'pan', ... }
    let viewW = 0;
    let viewH = 0;
    const dpr = window.devicePixelRatio || 1;
    const rowRefs = new Map(); // bodyId -> { tr, mass, x, y, vx, vy }
    let hintTimeout = null;

    // --- Tamaño del lienzo -----------------------------------------------

    function resizeCanvas() {
      const rect = canvasWrap.getBoundingClientRect();
      viewW = rect.width;
      viewH = rect.height;
      canvas.width = Math.max(1, Math.round(viewW * dpr));
      canvas.height = Math.max(1, Math.round(viewH * dpr));
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // --- Ajuste automático de cámara a los cuerpos actuales -----------------

    function fitCameraToBodies() {
      if (sim.bodies.length === 0) {
        camera.x = 0;
        camera.y = 0;
        camera.scale = 1.4;
        return;
      }
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const b of sim.bodies) {
        minX = Math.min(minX, b.x);
        maxX = Math.max(maxX, b.x);
        minY = Math.min(minY, b.y);
        maxY = Math.max(maxY, b.y);
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rangeX = Math.max(maxX - minX, 1e-3) * 1.5;
      const rangeY = Math.max(maxY - minY, 1e-3) * 1.5;
      camera.x = cx;
      camera.y = cy;
      camera.scale = Math.max(0.02, Math.min(viewW / rangeX, viewH / rangeY, 500));
    }

    // --- Mensajes transitorios sobre el lienzo -------------------------------

    function showHint(text, persistent = false) {
      canvasHint.textContent = text;
      canvasHint.hidden = false;
      if (hintTimeout) clearTimeout(hintTimeout);
      if (!persistent) {
        hintTimeout = setTimeout(() => {
          if (!addMode) canvasHint.hidden = true;
          else canvasHint.textContent = ADD_MODE_TEXT;
        }, 1600);
      }
    }

    const ADD_MODE_TEXT =
      "Haz clic para colocar un cuerpo. Arrastra antes de soltar para fijar su velocidad inicial.";

    // --- Tabla de cuerpos -----------------------------------------------------

    function commitFieldEdit(body, resetTrail) {
      if (resetTrail) body.trail.length = 0;
      sim.commitInitialConditions();
      charts.reset(sim); // las condiciones iniciales cambiaron: las gráficas parten de cero
    }

    function buildRow(body) {
      const tr = document.createElement("tr");
      tr.dataset.id = String(body.id);

      const colorTd = document.createElement("td");
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = rgbToHex(body.color);
      colorInput.addEventListener("input", () => {
        body.color = colorInput.value;
      });
      colorTd.appendChild(colorInput);

      const nameTd = document.createElement("td");
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = body.name;
      nameInput.addEventListener("change", () => {
        body.name = nameInput.value || body.name;
      });
      nameTd.appendChild(nameInput);

      const massInput = numberField(body.mass, 0, (v) => {
        body.mass = v;
        commitFieldEdit(body, false);
      });
      const xInput = numberField(body.x, null, (v) => {
        body.x = v;
        commitFieldEdit(body, true);
      });
      const yInput = numberField(body.y, null, (v) => {
        body.y = v;
        commitFieldEdit(body, true);
      });
      const vxInput = numberField(body.vx, null, (v) => {
        body.vx = v;
        commitFieldEdit(body, false);
      });
      const vyInput = numberField(body.vy, null, (v) => {
        body.vy = v;
        commitFieldEdit(body, false);
      });

      const massTd = wrapTd(massInput);
      const xTd = wrapTd(xInput);
      const yTd = wrapTd(yInput);
      const vxTd = wrapTd(vxInput);
      const vyTd = wrapTd(vyInput);

      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "row-delete-btn";
      delBtn.textContent = "✕";
      delBtn.title = "Eliminar cuerpo";
      delBtn.addEventListener("click", () => {
        sim.removeBody(body.id);
        if (options.selectedId === body.id) options.selectedId = null;
        rebuildBodyTable();
      });
      delTd.appendChild(delBtn);

      tr.append(colorTd, nameTd, massTd, xTd, yTd, vxTd, vyTd, delTd);
      tr.addEventListener("click", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
        options.selectedId = body.id;
        highlightSelectedRow();
      });

      return { tr, mass: massInput, x: xInput, y: yInput, vx: vxInput, vy: vyInput };
    }

    function numberField(value, min, onCommit) {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      if (min !== null) input.min = String(min);
      input.value = formatNumber(value);
      input.addEventListener("change", () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v) && (min === null || v >= min)) onCommit(v);
      });
      return input;
    }

    function wrapTd(input) {
      const td = document.createElement("td");
      td.appendChild(input);
      return td;
    }

    function rebuildBodyTable() {
      bodyTableBody.innerHTML = "";
      rowRefs.clear();
      for (const b of sim.bodies) {
        const refs = buildRow(b);
        bodyTableBody.appendChild(refs.tr);
        rowRefs.set(b.id, refs);
      }
      highlightSelectedRow();
    }

    function highlightSelectedRow() {
      for (const [id, refs] of rowRefs) {
        refs.tr.classList.toggle("selected", id === options.selectedId);
      }
    }

    function updateBodyTableValues() {
      const active = document.activeElement;
      for (const b of sim.bodies) {
        const refs = rowRefs.get(b.id);
        if (!refs) continue;
        if (refs.x !== active) refs.x.value = formatNumber(b.x);
        if (refs.y !== active) refs.y.value = formatNumber(b.y);
        if (refs.vx !== active) refs.vx.value = formatNumber(b.vx);
        if (refs.vy !== active) refs.vy.value = formatNumber(b.vy);
      }
    }

    function formatNumber(n) {
      if (!Number.isFinite(n)) return "0";
      const abs = Math.abs(n);
      if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return n.toExponential(3);
      return Number(n.toFixed(4)).toString();
    }

    function rgbToHex(color) {
      // Los colores de los presets/creación aleatoria son hsl(...); los <input color>
      // necesitan hex. Usamos un canvas 1x1 como conversor universal de color CSS -> hex.
      const probe = rgbToHex._probe || (rgbToHex._probe = document.createElement("canvas").getContext("2d"));
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
    }

    // --- Diagnósticos ---------------------------------------------------------

    function driftClass(drift) {
      const a = Math.abs(drift);
      if (a < 0.001) return "drift-ok";
      if (a < 0.05) return "drift-warn";
      return "drift-bad";
    }

    function fmtSci(n) {
      if (!Number.isFinite(n)) return "—";
      if (n === 0) return "0";
      const abs = Math.abs(n);
      if (abs < 1e-3 || abs >= 1e6) return n.toExponential(3);
      return n.toFixed(3);
    }

    function updateDiagnostics() {
      if (sim.bodies.length === 0) {
        diagKE.textContent = diagPE.textContent = diagE.textContent = "—";
        diagDrift.textContent = diagP.textContent = diagL.textContent = "—";
        diagTime.textContent = sim.elapsedTime.toFixed(2);
        diagSubsteps.textContent = "—";
        onCanvasDiagnostics.textContent = "";
        return;
      }
      const d = sim.diagnostics();
      diagKE.textContent = fmtSci(d.kineticEnergy);
      diagPE.textContent = fmtSci(d.potentialEnergy);
      diagE.textContent = fmtSci(d.totalEnergy);
      diagDrift.textContent = (d.energyDrift * 100).toFixed(3) + "%";
      diagDrift.className = driftClass(d.energyDrift);
      diagP.textContent = fmtSci(Math.hypot(d.momentum.x, d.momentum.y));
      diagL.textContent = fmtSci(d.angularMomentum);
      diagTime.textContent = d.elapsedTime.toFixed(2);
      diagSubsteps.textContent = String(sim.lastSubsteps);

      onCanvasDiagnostics.textContent =
        `t = ${d.elapsedTime.toFixed(2)}\n` +
        `E total = ${fmtSci(d.totalEnergy)}\n` +
        `ΔE/E₀ = ${(d.energyDrift * 100).toFixed(3)}%`;
    }

    // --- Controles de reproducción ---------------------------------------

    function setRunning(running) {
      sim.running = running;
      playPauseBtn.textContent = running ? "⏸ Pausar" : "▶ Reproducir";
    }

    playPauseBtn.addEventListener("click", () => setRunning(!sim.running));
    stepBtn.addEventListener("click", () => {
      setRunning(false);
      sim.step();
    });
    resetBtn.addEventListener("click", () => {
      setRunning(false);
      sim.reset();
    });

    speedInput.addEventListener("input", () => {
      sim.stepsPerFrame = parseInt(speedInput.value, 10);
      speedValue.textContent = speedInput.value;
    });
    dtInput.addEventListener("input", () => {
      sim.dt = parseFloat(dtInput.value);
      dtValue.textContent = sim.dt.toString();
      sim.rebaseDiagnostics();
    });
    gInput.addEventListener("input", () => {
      sim.G = parseFloat(gInput.value);
      gValue.textContent = sim.G.toString();
      sim.rebaseDiagnostics();
    });
    integratorSelect.addEventListener("change", () => {
      sim.integrator = integratorSelect.value;
      sim.rebaseDiagnostics();
    });

    // --- Capas visuales -----------------------------------------------------

    showTrails.addEventListener("change", () => (options.showTrails = showTrails.checked));
    showGrid.addEventListener("change", () => (options.showGrid = showGrid.checked));
    showLabels.addEventListener("change", () => (options.showLabels = showLabels.checked));
    showVelocity.addEventListener("change", () => (options.showVelocity = showVelocity.checked));
    showForce.addEventListener("change", () => (options.showForce = showForce.checked));
    showCenterOfMass.addEventListener(
      "change",
      () => (options.showCenterOfMass = showCenterOfMass.checked)
    );

    // --- Modo "añadir cuerpo" e interacción con el lienzo --------------------

    function deleteSelectedBody() {
      if (options.selectedId == null) return;
      sim.removeBody(options.selectedId);
      options.selectedId = null;
      rebuildBodyTable();
    }

    deleteSelectedBtn.addEventListener("click", deleteSelectedBody);
    window.addEventListener("keydown", (e) => {
      // Supr elimina el cuerpo seleccionado, salvo que se esté escribiendo en un campo.
      if (e.key !== "Delete") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      deleteSelectedBody();
    });

    addBodyBtn.addEventListener("click", () => {
      addMode = !addMode;
      addBodyBtn.textContent = addMode ? "✕ Cancelar" : "+ Añadir cuerpo";
      addModeHint.hidden = !addMode;
      canvasWrap.style.cursor = addMode ? "copy" : "";
      if (addMode) showHint(ADD_MODE_TEXT, true);
      else canvasHint.hidden = true;
    });

    function pointerWorldPos(e) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return { sx, sy, world: camera.screenToWorld(sx, sy, viewW, viewH) };
    }

    canvas.addEventListener("pointerdown", (e) => {
      const { sx, sy, world } = pointerWorldPos(e);
      canvas.setPointerCapture(e.pointerId);

      if (addMode) {
        dragState = { type: "new", x0: world.x, y0: world.y, x1: world.x, y1: world.y };
        return;
      }

      const hit = pickBody(sim.bodies, camera, sx, sy, viewW, viewH);
      if (hit) {
        options.selectedId = hit.id;
        highlightSelectedRow();
        setRunning(false);
        dragState = { type: "move", body: hit, offX: hit.x - world.x, offY: hit.y - world.y };
      } else {
        dragState = { type: "pan", lastX: sx, lastY: sy };
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!dragState) return;
      const { sx, sy, world } = pointerWorldPos(e);

      if (dragState.type === "new") {
        dragState.x1 = world.x;
        dragState.y1 = world.y;
        options.dragPreview = { x0: dragState.x0, y0: dragState.y0, x1: dragState.x1, y1: dragState.y1 };
      } else if (dragState.type === "move") {
        dragState.body.x = world.x + dragState.offX;
        dragState.body.y = world.y + dragState.offY;
        dragState.body.trail.length = 0;
      } else if (dragState.type === "pan") {
        camera.pan(sx - dragState.lastX, sy - dragState.lastY);
        dragState.lastX = sx;
        dragState.lastY = sy;
      }
    });

    function endDrag() {
      if (!dragState) return;
      if (dragState.type === "new") {
        const vx = (dragState.x1 - dragState.x0) / options.velocityScale;
        const vy = (dragState.y1 - dragState.y0) / options.velocityScale;
        const mass = parseFloat(newBodyMass.value);
        sim.addBody({
          mass: Number.isFinite(mass) && mass > 0 ? mass : 1,
          x: dragState.x0,
          y: dragState.y0,
          vx,
          vy,
        });
        rebuildBodyTable();
        options.dragPreview = null;
      } else if (dragState.type === "move") {
        sim.commitInitialConditions();
        charts.reset(sim);
      }
      dragState = null;
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      camera.zoomAt(sx, sy, viewW, viewH, factor);
    }, { passive: false });

    zoomInBtn.addEventListener("click", () => camera.zoomAt(viewW / 2, viewH / 2, viewW, viewH, 1.25));
    zoomOutBtn.addEventListener("click", () => camera.zoomAt(viewW / 2, viewH / 2, viewW, viewH, 1 / 1.25));
    zoomResetBtn.addEventListener("click", fitCameraToBodies);

    // --- Presets (tarjetas) ---------------------------------------------------

    let selectedPresetKey = null;
    const presetCardRefs = new Map(); // key -> botón de la tarjeta

    for (const [key, preset] of Object.entries(PRESETS)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "preset-card";
      card.dataset.key = key;

      const icon = document.createElement("span");
      icon.className = "preset-card-icon";
      icon.textContent = preset.icon || "•";

      const label = document.createElement("span");
      label.className = "preset-card-label";
      label.textContent = preset.label;

      card.append(icon, label);
      card.title = preset.description || preset.label;
      card.addEventListener("click", () => {
        sim.loadPreset(key);
        selectedPresetKey = key;
        highlightSelectedPreset();
        updatePresetDescription();
        applyLoadedState();
        setRunning(true);
      });
      presetCards.appendChild(card);
      presetCardRefs.set(key, card);
    }

    function highlightSelectedPreset() {
      for (const [key, card] of presetCardRefs) {
        card.classList.toggle("selected", key === selectedPresetKey);
      }
    }

    function updatePresetDescription() {
      presetDescription.textContent =
        (selectedPresetKey && PRESETS[selectedPresetKey]?.description) || "";
    }

    function applyLoadedState() {
      dtInput.value = sim.dt;
      dtValue.textContent = sim.dt.toString();
      gInput.value = sim.G;
      gValue.textContent = sim.G.toString();
      integratorSelect.value = sim.integrator;
      setRunning(false);
      options.selectedId = null;
      rebuildBodyTable();
      fitCameraToBodies();
      charts.reset(sim);
      highlightSelectedPreset();
      updatePresetDescription();
    }

    // --- Guardar / exportar ---------------------------------------------------

    exportBtn.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(sim.toJSON(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "escena-orbitas-newton.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    importBtn.addEventListener("click", () => importFileInput.click());
    importFileInput.addEventListener("change", () => {
      const file = importFileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          sim.loadFromJSON(JSON.parse(reader.result));
          selectedPresetKey = null;
          applyLoadedState();
          showHint("Escena importada.");
        } catch (err) {
          console.error(err);
          showHint("El archivo no es una escena válida.");
        }
      };
      reader.readAsText(file);
      importFileInput.value = "";
    });

    saveLocalBtn.addEventListener("click", () => {
      showHint(sim.saveToLocalStorage() ? "Escena guardada en este navegador." : "No se pudo guardar.");
    });
    loadLocalBtn.addEventListener("click", () => {
      if (sim.loadFromLocalStorage()) {
        selectedPresetKey = null;
        applyLoadedState();
        showHint("Escena cargada.");
      } else {
        showHint("No hay ninguna escena guardada en este navegador.");
      }
    });

    // --- Modal de bienvenida (solo la primera visita) ------------------------

    const WELCOME_KEY = "orbitas-newton:bienvenida-vista";
    const welcomeOverlay = el("welcomeOverlay");
    const welcomeStartBtn = el("welcomeStartBtn");
    function closeWelcome() {
      if (welcomeOverlay) welcomeOverlay.hidden = true;
      try {
        localStorage.setItem(WELCOME_KEY, "1");
      } catch (e) {
        /* sin persistencia: se volverá a mostrar, no es grave */
      }
    }
    if (welcomeOverlay && welcomeStartBtn) {
      let seen = false;
      try {
        seen = localStorage.getItem(WELCOME_KEY) === "1";
      } catch (e) {
        seen = false;
      }
      if (!seen) welcomeOverlay.hidden = false;
      welcomeStartBtn.addEventListener("click", closeWelcome);
      welcomeOverlay.addEventListener("click", (e) => {
        if (e.target === welcomeOverlay) closeWelcome();
      });
      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !welcomeOverlay.hidden) closeWelcome();
      });
    }

    // --- Preset inicial + bucle de animación ---------------------------------

    const initialPresetKey = new URLSearchParams(location.search).get("preset");
    selectedPresetKey = initialPresetKey && PRESETS[initialPresetKey] ? initialPresetKey : "kepler2";
    sim.loadPreset(selectedPresetKey);
    applyLoadedState();
    setRunning(true);

    function frame() {
      sim.tick();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, { width: viewW, height: viewH }, sim, camera, options);
      charts.sample(sim);
      charts.draw(sim);
      updateBodyTableValues();
      updateDiagnostics();
      deleteSelectedBtn.disabled = options.selectedId == null;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  window.NB.initApp = initApp;
})();
