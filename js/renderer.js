// renderer.js
// Todo el dibujo en <canvas>: cámara (pan/zoom), rejilla, estelas, cuerpos,
// vectores de velocidad/fuerza y centro de masas. Los cuerpos son puntos
// matemáticos; el círculo que se dibuja es solo una referencia visual
// (radio ~ log de la masa en píxeles de pantalla), nunca entra en la física.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  class Camera {
    constructor() {
      this.x = 0; // centro de la vista, en coordenadas del mundo
      this.y = 0;
      this.scale = 1.4; // píxeles por unidad de mundo
    }

    worldToScreen(wx, wy, width, height) {
      return {
        x: (wx - this.x) * this.scale + width / 2,
        y: height / 2 - (wy - this.y) * this.scale, // +y del mundo apunta hacia arriba en pantalla
      };
    }

    screenToWorld(sx, sy, width, height) {
      return {
        x: (sx - width / 2) / this.scale + this.x,
        y: -(sy - height / 2) / this.scale + this.y,
      };
    }

    pan(dxScreen, dyScreen) {
      this.x -= dxScreen / this.scale;
      this.y += dyScreen / this.scale;
    }

    /** Zoom manteniendo fijo el punto del mundo bajo (sx, sy). */
    zoomAt(sx, sy, width, height, factor) {
      const before = this.screenToWorld(sx, sy, width, height);
      this.scale = clamp(this.scale * factor, 0.01, 500);
      const after = this.screenToWorld(sx, sy, width, height);
      this.x -= after.x - before.x;
      this.y -= after.y - before.y;
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  /** Radio de dibujo en píxeles (no físico), en escala logarítmica de la masa. */
  function bodyScreenRadius(mass) {
    return clamp(3 + 2.4 * Math.log10(Math.max(mass, 1e-6) + 1), 3, 34);
  }

  function drawArrow(ctx, x0, y0, x1, y1, color, width = 2) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const headLen = clamp(len * 0.25, 4, 10);
    const angle = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(
      x1 - headLen * Math.cos(angle - Math.PI / 6),
      y1 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x1 - headLen * Math.cos(angle + Math.PI / 6),
      y1 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  /** Formatea un valor de la rejilla evitando decimales espurios de coma flotante. */
  function formatTick(v, step) {
    if (Math.abs(v) < step * 1e-6) return "0";
    const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
    return Number(v.toFixed(Math.min(decimals, 6))).toString();
  }

  function drawGrid(ctx, camera, width, height) {
    // Elige un paso "bonito" (1,2,5 x potencia de 10) según el zoom actual.
    const targetPx = 90;
    const rawStep = targetPx / camera.scale;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const candidates = [1, 2, 5, 10];
    let step = pow10 * 10;
    for (const c of candidates) {
      if (rawStep <= pow10 * c) {
        step = pow10 * c;
        break;
      }
    }

    const topLeft = camera.screenToWorld(0, 0, width, height);
    const bottomRight = camera.screenToWorld(width, height, width, height);
    const origin = camera.worldToScreen(0, 0, width, height);

    // Líneas menores de la rejilla.
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const xStart = Math.floor(topLeft.x / step) * step;
    for (let wx = xStart; wx <= bottomRight.x; wx += step) {
      const { x: sx } = camera.worldToScreen(wx, 0, width, height);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    const yStart = Math.floor(bottomRight.y / step) * step;
    for (let wy = yStart; wy <= topLeft.y; wy += step) {
      const { y: sy } = camera.worldToScreen(0, wy, width, height);
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    // Ejes (x=0 e y=0), resaltados sobre la rejilla.
    ctx.strokeStyle = "rgba(203, 213, 225, 0.65)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();

    // Etiquetas numéricas de la rejilla, ancladas al eje correspondiente (o al
    // borde de la pantalla si el eje ha salido de la vista).
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(203, 213, 225, 0.75)";
    const labelX = clamp(origin.y + 14, 14, height - 6);
    for (let wx = xStart; wx <= bottomRight.x; wx += step) {
      if (Math.abs(wx) < step * 1e-6) continue; // el "0" se pinta una sola vez junto al origen
      const { x: sx } = camera.worldToScreen(wx, 0, width, height);
      ctx.textAlign = "center";
      ctx.fillText(formatTick(wx, step), sx, labelX);
    }
    const labelY = clamp(origin.x + 6, 6, width - 28);
    ctx.textAlign = "left";
    for (let wy = yStart; wy <= topLeft.y; wy += step) {
      if (Math.abs(wy) < step * 1e-6) continue;
      const { y: sy } = camera.worldToScreen(0, wy, width, height);
      ctx.fillText(formatTick(wy, step), labelY, sy - 3);
    }

    // Origen: marcador explícito + etiqueta "0", para anclar visualmente el mapa.
    ctx.fillStyle = "rgba(250, 204, 21, 0.9)";
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.textAlign = "left";
    ctx.fillText("0", clamp(origin.x + 6, 6, width - 14), clamp(origin.y + 14, 14, height - 6));
    ctx.restore();
  }

  /** Devuelve el cuerpo más cercano a (sx, sy) en píxeles de pantalla, o null. */
  function pickBody(bodies, camera, sx, sy, width, height) {
    let best = null;
    let bestDist = Infinity;
    for (const b of bodies) {
      const p = camera.worldToScreen(b.x, b.y, width, height);
      const r = bodyScreenRadius(b.mass);
      const d = Math.hypot(p.x - sx, p.y - sy);
      if (d <= r + 6 && d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    return best;
  }

  function draw(ctx, canvas, sim, camera, options = {}) {
    const {
      showGrid = true,
      showTrails = true,
      showVelocity = false,
      showForce = false,
      showCenterOfMass = false,
      showLabels = true,
      velocityScale = 6,
      forceScale = 40,
      selectedId = null,
      dragPreview = null, // { x0, y0, x1, y1 } en coords de mundo, para el modo "añadir cuerpo"
    } = options;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (showGrid) drawGrid(ctx, camera, width, height);

    // Estelas.
    if (showTrails) {
      for (const b of sim.bodies) {
        if (b.trail.length < 2) continue;
        ctx.beginPath();
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < b.trail.length; i++) {
          const p = camera.worldToScreen(b.trail[i].x, b.trail[i].y, width, height);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Centro de masas.
    if (showCenterOfMass && sim.bodies.length > 0) {
      const { centerOfMass } = sim.diagnostics();
      const p = camera.worldToScreen(centerOfMass.x, centerOfMass.y, width, height);
      ctx.strokeStyle = "#f8f8f8";
      ctx.lineWidth = 1.5;
      const s = 7;
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cuerpos + vectores.
    for (const b of sim.bodies) {
      const p = camera.worldToScreen(b.x, b.y, width, height);
      const r = bodyScreenRadius(b.mass);

      if (showVelocity) {
        const vEnd = camera.worldToScreen(b.x + b.vx * velocityScale, b.y + b.vy * velocityScale, width, height);
        drawArrow(ctx, p.x, p.y, vEnd.x, vEnd.y, "#5eead4", 2);
      }
      if (showForce) {
        const fEnd = camera.worldToScreen(
          b.x + b.ax * forceScale,
          b.y + b.ay * forceScale,
          width,
          height
        );
        drawArrow(ctx, p.x, p.y, fEnd.x, fEnd.y, "#f472b6", 2);
      }

      ctx.beginPath();
      ctx.fillStyle = b.color;
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (b.id === selectedId) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (showLabels) {
        ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(b.name, p.x + r + 4, p.y - r - 2);
      }
    }

    // Vista previa al arrastrar la velocidad inicial de un cuerpo nuevo.
    if (dragPreview) {
      const p0 = camera.worldToScreen(dragPreview.x0, dragPreview.y0, width, height);
      const p1 = camera.worldToScreen(dragPreview.x1, dragPreview.y1, width, height);
      drawArrow(ctx, p0.x, p0.y, p1.x, p1.y, "#facc15", 2);
    }
  }

  window.NB.Camera = Camera;
  window.NB.bodyScreenRadius = bodyScreenRadius;
  window.NB.pickBody = pickBody;
  window.NB.draw = draw;
})();
