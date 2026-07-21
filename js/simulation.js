// simulation.js
// Estado global de la simulación: cuerpos, parámetros (G, dt, integrador) y
// el bucle de avance. No toca el DOM (eso es cosa de ui.js/renderer.js):
// aquí solo vive la física y su estado.
//
// Script clásico (sin import/export): ver nota en body.js. Depende de que
// body.js, physics.js, diagnostics.js y presets.js se carguen antes en
// index.html (cada uno cuelga su API pública de window.NB).

(function () {
  window.NB = window.NB || {};
  const { Body } = window.NB;
  const { advance } = window.NB.Physics;
  const { computeDiagnostics } = window.NB.Diagnostics;
  const PRESETS = window.NB.PRESETS;

  const LOCAL_STORAGE_KEY = "orbitas-newton:escena";

  class Simulation {
    constructor() {
      this.bodies = [];
      this.G = 1;
      this.dt = 0.01;
      this.integrator = "verlet";
      this.running = false;
      this.elapsedTime = 0;
      this.stepsPerFrame = 1; // "velocidad" de la simulación: pasos dt por fotograma
      this.initialDiagnostics = null;
      this.lastSubsteps = 1; // último número de sub-pasos usados por advance() (diagnóstico)
    }

    // --- Gestión de cuerpos -------------------------------------------------

    addBody(config) {
      const cfg = { ...config };
      // El nombre por defecto usa el menor "Cuerpo N" libre en ESTA escena, no
      // el id interno global (que nunca se reinicia y haría que en una escena
      // vacía el primer cuerpo apareciera como "Cuerpo 3", "Cuerpo 7"...).
      if (!cfg.name) {
        const used = new Set(this.bodies.map((b) => b.name));
        let n = 1;
        while (used.has(`Cuerpo ${n}`)) n++;
        cfg.name = `Cuerpo ${n}`;
      }
      const b = new Body(cfg);
      this.bodies.push(b);
      this._recordInitialDiagnostics();
      return b;
    }

    removeBody(id) {
      this.bodies = this.bodies.filter((b) => b.id !== id);
      this._recordInitialDiagnostics();
    }

    clear() {
      this.bodies = [];
      this.elapsedTime = 0;
      this._recordInitialDiagnostics();
    }

    // --- Presets --------------------------------------------------------------

    loadPreset(key) {
      const preset = PRESETS[key];
      if (!preset) throw new Error(`Preset desconocido: ${key}`);
      this.G = preset.G;
      this.dt = preset.dt;
      this.integrator = preset.integrator;
      this.bodies = preset.bodies().map((cfg) => new Body(cfg));
      this.elapsedTime = 0;
      this._recordInitialDiagnostics();
    }

    // --- Ciclo de simulación -------------------------------------------------

    reset() {
      for (const b of this.bodies) b.reset();
      this.elapsedTime = 0;
      this._recordInitialDiagnostics();
    }

    /** Avanza un único paso dt (usado por "paso a paso" y por el bucle en marcha). */
    step() {
      if (this.bodies.length === 0) return;
      this.lastSubsteps = advance(this.bodies, this.dt, this.G, this.integrator);
      this.elapsedTime += this.dt;
      for (const b of this.bodies) b.pushTrail();
    }

    /** Llamado desde el bucle de animación cuando running=true. */
    tick() {
      if (!this.running) return;
      for (let i = 0; i < this.stepsPerFrame; i++) this.step();
    }

    _recordInitialDiagnostics() {
      this.initialDiagnostics =
        this.bodies.length > 0 ? computeDiagnostics(this.bodies, this.G) : null;
    }

    /**
     * Congela el estado actual de todos los cuerpos como su nueva condición
     * inicial (lo que "Reiniciar" restaurará) y recalcula la línea base de
     * energía/momento para el diagnóstico de deriva. Se llama tras editar un
     * cuerpo a mano en la tabla, o tras añadir/eliminar uno.
     */
    commitInitialConditions() {
      for (const b of this.bodies) b.recordInitial();
      this.elapsedTime = 0;
      this._recordInitialDiagnostics();
    }

    /**
     * Recalcula solo la línea base de energía/momento a partir del estado
     * *actual* (sin tocar posiciones, velocidades ni el tiempo transcurrido).
     * Se usa cuando cambia G, dt o el integrador a media simulación: así la
     * "deriva" mostrada refleja el comportamiento desde ese instante, no un
     * salto artificial causado por el cambio de parámetro en sí.
     */
    rebaseDiagnostics() {
      this._recordInitialDiagnostics();
    }

    diagnostics() {
      const current = computeDiagnostics(this.bodies, this.G);
      let energyDrift = 0;
      if (this.initialDiagnostics && Math.abs(this.initialDiagnostics.totalEnergy) > 1e-12) {
        energyDrift =
          (current.totalEnergy - this.initialDiagnostics.totalEnergy) /
          Math.abs(this.initialDiagnostics.totalEnergy);
      }
      return { ...current, energyDrift, elapsedTime: this.elapsedTime };
    }

    // --- Serialización --------------------------------------------------------

    toJSON() {
      return {
        G: this.G,
        dt: this.dt,
        integrator: this.integrator,
        bodies: this.bodies.map((b) => b.toJSON()),
      };
    }

    loadFromJSON(data) {
      this.G = data.G ?? 1;
      this.dt = data.dt ?? 0.01;
      this.integrator = data.integrator ?? "verlet";
      this.bodies = (data.bodies || []).map((cfg) => new Body(cfg));
      this.elapsedTime = 0;
      this._recordInitialDiagnostics();
    }

    saveToLocalStorage() {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.toJSON()));
        return true;
      } catch (e) {
        console.warn("No se pudo guardar la escena en localStorage:", e);
        return false;
      }
    }

    loadFromLocalStorage() {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!raw) return false;
        this.loadFromJSON(JSON.parse(raw));
        return true;
      } catch (e) {
        console.warn("No se pudo cargar la escena guardada:", e);
        return false;
      }
    }
  }

  window.NB.Simulation = Simulation;
})();
