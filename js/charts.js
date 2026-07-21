// charts.js
// Gráficas del panel: proyección (x, vx) del espacio fásico y energías frente
// al tiempo. También clasifica cada trayectoria como cerrada (periódica),
// abierta (escape) o indeterminada, mediante dos criterios independientes:
//
//  - CERRADA: el cuerpo vuelve muy cerca de su punto inicial del espacio
//    fásico (posición Y velocidad a la vez) después de haberse alejado de él.
//    Es la definición operativa de órbita periódica: pasar dos veces por el
//    mismo estado implica repetir la trayectoria para siempre (determinismo).
//  - ABIERTA: el cuerpo está lejos del centro de masas (varias veces el tamaño
//    inicial del sistema) y sigue alejándose de forma sostenida.
//  - Mientras no se cumpla ninguna de las dos, se muestra "indeterminada":
//    puede ser una órbita acotada pero no periódica (caso caótico típico del
//    problema de tres cuerpos) o simplemente no haber pasado tiempo suficiente.
//
// El buffer de muestras se decima progresivamente (cuando se llena, se
// descarta una de cada dos y se duplica el intervalo de muestreo): así la
// gráfica puede abarcar una órbita completa por larga que sea con memoria
// acotada. Para trayectorias abiertas, la ventana de escala usa solo los
// puntos recientes del cuerpo que escapa — una trayectoria infinita no debe
// definir la escala de toda la gráfica.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  const MAX_SAMPLES = 900;
  const ESCAPE_RADIUS_FACTOR = 3; // r > 3·(radio inicial del sistema) para empezar a contar escape
  const ESCAPE_SUSTAINED_FRAMES = 60; // fotogramas seguidos alejándose para declarar "abierta"
  const OPEN_TAIL_POINTS = 200; // puntos recientes usados para escalar cuerpos que escapan

  class Charts {
    constructor({ phaseCanvas, energyCanvas, statusList }) {
      this.phaseCanvas = phaseCanvas;
      this.energyCanvas = energyCanvas;
      this.statusList = statusList;
      this.samples = [];
      this.meta = new Map(); // bodyId -> estado de clasificación
      this.signature = "";
      this.lastT = -Infinity;
      this.minGap = 0; // intervalo mínimo (tiempo simulado) entre muestras; crece al decimar
      this.systemRadius0 = 1;
      this._statusKey = "";
      this._resizeCanvases();
      window.addEventListener("resize", () => this._resizeCanvases());
    }

    _resizeCanvases() {
      for (const c of [this.phaseCanvas, this.energyCanvas]) {
        const w = Math.max(100, Math.round(c.getBoundingClientRect().width) || c.width);
        if (c.width !== w) c.width = w;
      }
    }

    reset(sim) {
      this.samples = [];
      this.minGap = 0;
      this.meta = new Map();
      for (const b of sim.bodies) {
        this.meta.set(b.id, {
          p0: { x: b.x, y: b.y, vx: b.vx, vy: b.vy },
          maxDevPos: 0,
          maxDevVel: 0,
          hasLeft: false, // ya se alejó apreciablemente de su estado inicial
          status: null, // null | 'cerrada' | 'abierta'
          escapeCount: 0,
          frames: 0,
        });
      }
      const com = window.NB.Diagnostics.centerOfMass(sim.bodies);
      let r0 = 0;
      for (const b of sim.bodies) r0 = Math.max(r0, Math.hypot(b.x - com.x, b.y - com.y));
      this.systemRadius0 = Math.max(r0, 1e-6);
      this.signature = sim.bodies.map((b) => b.id).join(",");
      this.lastT = sim.elapsedTime;
    }

    /** Llamar una vez por fotograma: reinicia si hace falta, clasifica y muestrea. */
    sample(sim) {
      const sig = sim.bodies.map((b) => b.id).join(",");
      if (sig !== this.signature || sim.elapsedTime < this.lastT) this.reset(sim);
      if (sim.bodies.length === 0) {
        this.lastT = sim.elapsedTime;
        return;
      }

      const advanced = sim.elapsedTime > this.lastT || this.samples.length === 0;
      this.lastT = sim.elapsedTime;
      if (advanced) this._classify(sim);

      if (!advanced) return;
      const last = this.samples[this.samples.length - 1];
      if (last && sim.elapsedTime - last.t < this.minGap) return;

      const energies = window.NB.Diagnostics.perBodyEnergies(sim.bodies, sim.G);
      this.samples.push({
        t: sim.elapsedTime,
        per: sim.bodies.map((b, i) => ({ x: b.x, vx: b.vx, E: energies[i] })),
        totalE: energies.reduce((a, v) => a + v, 0),
      });
      if (this.samples.length > MAX_SAMPLES) {
        // Decimación: mitad de resolución temporal, el doble de alcance.
        this.samples = this.samples.filter((_, i) => i % 2 === 0);
        const span = this.samples[this.samples.length - 1].t - this.samples[0].t;
        this.minGap = Math.max(this.minGap * 2, (2 * span) / this.samples.length);
      }
    }

    _classify(sim) {
      const com = window.NB.Diagnostics.centerOfMass(sim.bodies);
      for (const b of sim.bodies) {
        const m = this.meta.get(b.id);
        if (!m) continue;
        m.frames++;

        const dPos = Math.hypot(b.x - m.p0.x, b.y - m.p0.y);
        const dVel = Math.hypot(b.vx - m.p0.vx, b.vy - m.p0.vy);
        m.maxDevPos = Math.max(m.maxDevPos, dPos);
        m.maxDevVel = Math.max(m.maxDevVel, dVel);
        if (m.maxDevPos > 1e-9 && dPos > 0.5 * m.maxDevPos) m.hasLeft = true;

        // Cierre: se alejó y ha vuelto muy cerca de su estado fásico inicial.
        if (
          m.status !== "abierta" &&
          m.hasLeft &&
          m.frames > 20 &&
          dPos < 0.06 * m.maxDevPos &&
          dVel < 0.08 * Math.max(m.maxDevVel, 1e-12)
        ) {
          m.status = "cerrada";
        }

        // Caso degenerado: un cuerpo que permanece (casi) inmóvil en su sitio
        // (p. ej. el central de Euler) es un punto fijo: trayectoria cerrada.
        if (m.status === null && m.frames > 60 && m.maxDevPos < 1e-3 * this.systemRadius0) {
          m.status = "cerrada";
        }

        // Escape: lejos del sistema y alejándose de forma sostenida.
        const rx = b.x - com.x;
        const ry = b.y - com.y;
        const r = Math.hypot(rx, ry);
        const vr = (rx * (b.vx - com.vx) + ry * (b.vy - com.vy)) / (r || 1);
        if (r > ESCAPE_RADIUS_FACTOR * this.systemRadius0 && vr > 0) m.escapeCount++;
        else m.escapeCount = 0;
        if (m.escapeCount > ESCAPE_SUSTAINED_FRAMES) m.status = "abierta";
      }
    }

    draw(sim) {
      this._drawPhase(sim);
      this._drawEnergy(sim);
      this._updateStatusList(sim);
    }

    // --- Espacio fásico (x, vx) --------------------------------------------

    _drawPhase(sim) {
      const canvas = this.phaseCanvas;
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      this._drawFrameLabels(ctx, width, height, "x", "vₓ");
      if (this.samples.length < 2 || sim.bodies.length === 0) return;

      // Escala: historial completo de los cuerpos acotados; de los que escapan,
      // solo su cola reciente (su trayectoria completa es infinita).
      let minX = Infinity, maxX = -Infinity, minV = Infinity, maxV = -Infinity;
      sim.bodies.forEach((b, bi) => {
        const open = this.meta.get(b.id)?.status === "abierta";
        const from = open ? Math.max(0, this.samples.length - OPEN_TAIL_POINTS) : 0;
        for (let s = from; s < this.samples.length; s++) {
          const p = this.samples[s].per[bi];
          if (!p) continue;
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minV = Math.min(minV, p.vx); maxV = Math.max(maxV, p.vx);
        }
      });
      if (!Number.isFinite(minX)) return;
      const padX = Math.max((maxX - minX) * 0.08, 1e-9);
      const padV = Math.max((maxV - minV) * 0.08, 1e-9);
      minX -= padX; maxX += padX; minV -= padV; maxV += padV;

      const mapX = (x) => ((x - minX) / (maxX - minX)) * (width - 12) + 6;
      const mapY = (v) => height - 8 - ((v - minV) / (maxV - minV)) * (height - 16);

      this._drawZeroAxes(ctx, width, height, minX, maxX, minV, maxV, mapX, mapY);

      sim.bodies.forEach((b, bi) => {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        let started = false;
        for (const s of this.samples) {
          const p = s.per[bi];
          if (!p) continue;
          const sx = mapX(p.x);
          const sy = mapY(p.vx);
          if (!started) { ctx.moveTo(sx, sy); started = true; }
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Punto actual.
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(mapX(b.x), mapY(b.vx), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // --- Energías frente al tiempo -----------------------------------------

    _drawEnergy(sim) {
      const canvas = this.energyCanvas;
      const ctx = canvas.getContext("2d");
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      this._drawFrameLabels(ctx, width, height, "t", "E");
      if (this.samples.length < 2 || sim.bodies.length === 0) return;

      const t0 = this.samples[0].t;
      const t1 = this.samples[this.samples.length - 1].t;
      if (t1 - t0 < 1e-12) return;

      // Escala robusta por percentiles: un pico de energía potencial en un
      // encuentro cercano no debe aplastar el resto de la gráfica.
      const values = [];
      for (const s of this.samples) {
        for (const p of s.per) values.push(p.E);
        values.push(s.totalE);
      }
      values.sort((a, c) => a - c);
      let minE = values[Math.floor(values.length * 0.01)];
      let maxE = values[Math.min(values.length - 1, Math.ceil(values.length * 0.99))];
      const padE = Math.max((maxE - minE) * 0.12, Math.abs(maxE) * 0.02, 1e-9);
      minE -= padE; maxE += padE;

      const mapX = (t) => ((t - t0) / (t1 - t0)) * (width - 12) + 6;
      const mapY = (E) => height - 8 - ((E - minE) / (maxE - minE)) * (height - 16);

      // Línea E=0 de referencia.
      if (minE < 0 && maxE > 0) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, mapY(0));
        ctx.lineTo(width, mapY(0));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const drawSeries = (getter, color, lineWidth) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        let started = false;
        for (const s of this.samples) {
          const v = getter(s);
          if (v === undefined) continue;
          const sx = mapX(s.t);
          const sy = Math.max(-20, Math.min(height + 20, mapY(v)));
          if (!started) { ctx.moveTo(sx, sy); started = true; }
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      };

      sim.bodies.forEach((b, bi) => {
        ctx.globalAlpha = 0.85;
        drawSeries((s) => s.per[bi]?.E, b.color, 1.2);
        ctx.globalAlpha = 1;
      });
      drawSeries((s) => s.totalE, "#e2e8f0", 2.2);
    }

    // --- Elementos comunes ---------------------------------------------------

    _drawFrameLabels(ctx, width, height, xLabel, yLabel) {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
      ctx.textAlign = "right";
      ctx.fillText(xLabel, width - 6, height - 6);
      ctx.textAlign = "left";
      ctx.fillText(yLabel, 6, 14);
    }

    _drawZeroAxes(ctx, width, height, minX, maxX, minY, maxY, mapX, mapY) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      if (minX < 0 && maxX > 0) {
        ctx.beginPath();
        ctx.moveTo(mapX(0), 0);
        ctx.lineTo(mapX(0), height);
        ctx.stroke();
      }
      if (minY < 0 && maxY > 0) {
        ctx.beginPath();
        ctx.moveTo(0, mapY(0));
        ctx.lineTo(width, mapY(0));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    _updateStatusList(sim) {
      const key = sim.bodies
        .map((b) => `${b.id}:${b.name}:${b.color}:${this.meta.get(b.id)?.status ?? "?"}`)
        .join("|");
      if (key === this._statusKey) return;
      this._statusKey = key;

      this.statusList.innerHTML = "";
      for (const b of sim.bodies) {
        const status = this.meta.get(b.id)?.status ?? null;
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = b.color;
        const text = document.createElement("span");
        if (status === "cerrada") {
          text.className = "estado-cerrada";
          text.textContent = `${b.name}: cerrada (periódica) ✓`;
        } else if (status === "abierta") {
          text.className = "estado-abierta";
          text.textContent = `${b.name}: abierta (escape) ↗`;
        } else {
          text.textContent = `${b.name}: indeterminada (acotada o aún sin cerrar)`;
        }
        li.append(dot, text);
        this.statusList.appendChild(li);
      }
    }
  }

  window.NB.Charts = Charts;
})();
