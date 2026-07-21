// physics.js
// Motor de gravitación newtoniana para N cuerpos puntuales en 2D.
//
//   a_i = Σ_{j≠i}  G · m_j · (r_j - r_i) / |r_j - r_i|³
//
// No se aplica "softening" (suavizado) al denominador: los cuerpos son
// puntuales de verdad y la ley se evalúa tal cual. El precio de esto es que,
// si dos cuerpos pasan muy cerca, la aceleración crece mucho y un paso de
// tiempo fijo puede dar un resultado muy inexacto (o "explotar"
// numéricamente). En vez de inventar una fuerza que no existe, se usa un
// PASO DE TIEMPO ADAPTATIVO (ver `advance`): cuando dos cuerpos se acercan,
// el motor subdivide automáticamente el paso solicitado en sub-pasos más
// pequeños, basado en el criterio de Aarseth, estándar en simulaciones de
// N cuerpos:
//
//   τ_ij = η · sqrt( r_ij³ / (G·(m_i + m_j)) )     (escala de tiempo local del par i,j)
//
// El paso efectivo nunca supera τ = min_ij(τ_ij), lo que mantiene la
// integración fiel a la física exacta en encuentros cercanos.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  const ETA = 0.002; // factor de seguridad del criterio de Aarseth (más pequeño = más preciso y más caro)
  const MAX_SUBSTEPS = 100000; // cota de SEGURIDAD (solo corta un bucle patológico; nunca fuerza el paso a crecer)

  /** Calcula y escribe body.ax, body.ay para cada cuerpo (suma de todos los demás). */
  function computeAccelerations(bodies, G) {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      bodies[i].ax = 0;
      bodies[i].ay = 0;
    }
    for (let i = 0; i < n; i++) {
      const bi = bodies[i];
      for (let j = i + 1; j < n; j++) {
        const bj = bodies[j];
        const dx = bj.x - bi.x;
        const dy = bj.y - bi.y;
        const r2 = dx * dx + dy * dy;
        const r = Math.sqrt(r2);
        const invR3 = 1 / (r2 * r); // r³ en el denominador (ley exacta, sin softening)
        // a_i += G*mj*(rj-ri)/r^3 ; a_j += G*mi*(ri-rj)/r^3  (tercera ley de Newton)
        const fi = G * bj.mass * invR3;
        const fj = G * bi.mass * invR3;
        bi.ax += fi * dx;
        bi.ay += fi * dy;
        bj.ax -= fj * dx;
        bj.ay -= fj * dy;
      }
    }
  }

  /** Distancia mínima entre cualquier par de cuerpos (para diagnóstico/zoom). */
  function minPairDistance(bodies) {
    let min = Infinity;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        min = Math.min(min, Math.hypot(dx, dy));
      }
    }
    return min;
  }

  /**
   * Escala de tiempo segura para el conjunto actual de cuerpos: el mínimo, sobre
   * todos los pares, de dos criterios de Aarseth combinados:
   *   - tiempo de caída libre:  sqrt(r³ / (G·(mᵢ+mⱼ)))
   *   - tiempo de cruce:        r / |v_rel|
   * El primero controla los pares lentos y muy próximos (órbitas ligadas
   * estrechas); el segundo es indispensable en encuentros rápidos tipo
   * hipérbola, donde la separación cambia mucho más deprisa de lo que sugiere
   * el tiempo de caída libre por sí solo (un par que pasa muy rápido cerca uno
   * del otro, sin estar "cayendo" el uno hacia el otro desde el reposo).
   */
  function safeTimescale(bodies, G) {
    let tauMin = Infinity;
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const r = Math.hypot(dx, dy);
        const mSum = bodies[i].mass + bodies[j].mass;
        if (r < 1e-9 || mSum <= 0) continue;
        const freeFall = Math.sqrt((r * r * r) / (G * mSum));
        const dvx = bodies[j].vx - bodies[i].vx;
        const dvy = bodies[j].vy - bodies[i].vy;
        const vRel = Math.hypot(dvx, dvy);
        const crossing = vRel > 1e-9 ? r / vRel : Infinity;
        const tau = ETA * Math.min(freeFall, crossing);
        if (tau < tauMin) tauMin = tau;
      }
    }
    return tauMin;
  }

  // ---------------------------------------------------------------------------
  // Integradores. Todos tienen la misma firma: (bodies, dt, G) -> void
  // y avanzan el sistema completo un paso dt.
  // ---------------------------------------------------------------------------

  /** Euler explícito (hacia adelante). Muy inestable: solo con fines didácticos. */
  function stepEuler(bodies, dt, G) {
    computeAccelerations(bodies, G);
    for (const b of bodies) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vx += b.ax * dt;
      b.vy += b.ay * dt;
    }
  }

  /**
   * Velocity Verlet (salto de rana cinemático). Simpléctico: la energía no
   * presenta deriva secular, solo oscila acotada, incluso en tiempos largos.
   * Es el integrador por defecto del simulador.
   */
  function stepVerlet(bodies, dt, G) {
    // Asegura que ax,ay reflejan la posición actual antes de empezar.
    computeAccelerations(bodies, G);
    const oldAx = bodies.map((b) => b.ax);
    const oldAy = bodies.map((b) => b.ay);

    for (const b of bodies) {
      b.x += b.vx * dt + 0.5 * b.ax * dt * dt;
      b.y += b.vy * dt + 0.5 * b.ay * dt * dt;
    }

    computeAccelerations(bodies, G); // aceleración en la nueva posición

    bodies.forEach((b, i) => {
      b.vx += 0.5 * (oldAx[i] + b.ax) * dt;
      b.vy += 0.5 * (oldAy[i] + b.ay) * dt;
    });
  }

  /** Runge-Kutta de 4º orden para el sistema completo (posiciones + velocidades). */
  function stepRK4(bodies, dt, G) {
    const n = bodies.length;
    const m = bodies.map((b) => b.mass);
    const x0 = bodies.map((b) => b.x);
    const y0 = bodies.map((b) => b.y);
    const vx0 = bodies.map((b) => b.vx);
    const vy0 = bodies.map((b) => b.vy);

    // Deriva el sistema (dx/dt, dy/dt, dvx/dt, dvy/dt) para un estado dado.
    function derive(x, y, vx, vy) {
      const ax = new Array(n).fill(0);
      const ay = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = x[j] - x[i];
          const dy = y[j] - y[i];
          const r2 = dx * dx + dy * dy;
          const r = Math.sqrt(r2);
          const invR3 = 1 / (r2 * r);
          const fi = G * m[j] * invR3;
          const fj = G * m[i] * invR3;
          ax[i] += fi * dx;
          ay[i] += fi * dy;
          ax[j] -= fj * dx;
          ay[j] -= fj * dy;
        }
      }
      return { dx: vx.slice(), dy: vy.slice(), dvx: ax, dvy: ay };
    }

    function addScaled(base, delta, s) {
      return base.map((v, i) => v + delta[i] * s);
    }

    const k1 = derive(x0, y0, vx0, vy0);
    const x1 = addScaled(x0, k1.dx, dt / 2);
    const y1 = addScaled(y0, k1.dy, dt / 2);
    const vx1 = addScaled(vx0, k1.dvx, dt / 2);
    const vy1 = addScaled(vy0, k1.dvy, dt / 2);

    const k2 = derive(x1, y1, vx1, vy1);
    const x2 = addScaled(x0, k2.dx, dt / 2);
    const y2 = addScaled(y0, k2.dy, dt / 2);
    const vx2 = addScaled(vx0, k2.dvx, dt / 2);
    const vy2 = addScaled(vy0, k2.dvy, dt / 2);

    const k3 = derive(x2, y2, vx2, vy2);
    const x3 = addScaled(x0, k3.dx, dt);
    const y3 = addScaled(y0, k3.dy, dt);
    const vx3 = addScaled(vx0, k3.dvx, dt);
    const vy3 = addScaled(vy0, k3.dvy, dt);

    const k4 = derive(x3, y3, vx3, vy3);

    for (let i = 0; i < n; i++) {
      bodies[i].x = x0[i] + (dt / 6) * (k1.dx[i] + 2 * k2.dx[i] + 2 * k3.dx[i] + k4.dx[i]);
      bodies[i].y = y0[i] + (dt / 6) * (k1.dy[i] + 2 * k2.dy[i] + 2 * k3.dy[i] + k4.dy[i]);
      bodies[i].vx = vx0[i] + (dt / 6) * (k1.dvx[i] + 2 * k2.dvx[i] + 2 * k3.dvx[i] + k4.dvx[i]);
      bodies[i].vy = vy0[i] + (dt / 6) * (k1.dvy[i] + 2 * k2.dvy[i] + 2 * k3.dvy[i] + k4.dvy[i]);
    }
    computeAccelerations(bodies, G); // deja ax,ay consistentes para diagnósticos/dibujo
  }

  const INTEGRATORS = {
    verlet: { label: "Velocity Verlet (simpléctico, recomendado)", step: stepVerlet },
    rk4: { label: "Runge-Kutta 4 (más preciso a corto plazo)", step: stepRK4 },
    euler: { label: "Euler explícito (inestable — solo demostrativo)", step: stepEuler },
  };

  /**
   * Avanza la simulación un intervalo `dt` (el paso "de usuario"), subdividiendo
   * internamente en sub-pasos más pequeños si algún par de cuerpos está en un
   * encuentro cercano, según el criterio de Aarseth. Con un único cuerpo, o
   * cuerpos lejanos entre sí, generalmente no hace falta subdividir (1 sub-paso).
   *
   * Importante: el criterio se reevalúa DESPUÉS de cada micro-paso, no una sola
   * vez al principio. Dos cuerpos pueden estar lejos al empezar el intervalo
   * `dt` y acercarse mucho *durante* ese mismo intervalo; si el número de
   * sub-pasos se fijara de antemano con la separación inicial, el paso efectivo
   * quedaría demasiado grosero justo en el instante crítico y la energía
   * dejaría de conservarse.
   *
   * MAX_SUBSTEPS es solo una cota de SEGURIDAD para no congelar la pestaña en
   * un caso patológico (p. ej. una colisión frontal casi exacta, el único caso
   * en que dos puntos podrían acercarse indefinidamente). Si se alcanza, el
   * paso se corta ahí (el resto de `dt` queda sin integrar ese fotograma) en
   * vez de forzar un paso más grande: un ensayo anterior hacía justo eso
   * — repartir el "presupuesto" de sub-pasos restante — y en un encuentro
   * cercano real eso obligaba a un paso demasiado grande justo en el punto de
   * mayor curvatura de la órbita, dando saltos de energía de varios órdenes de
   * magnitud. Es preferible perder una fracción de tiempo simulado en un
   * fotograma extremo que falsear la física.
   *
   * Devuelve el número de sub-pasos realmente ejecutados (útil para diagnóstico).
   */
  function advance(bodies, dt, G, integratorKey = "verlet") {
    const integrator = (INTEGRATORS[integratorKey] || INTEGRATORS.verlet).step;
    if (bodies.length < 2) {
      integrator(bodies, dt, G);
      return 1;
    }

    const sign = dt < 0 ? -1 : 1;
    let remaining = Math.abs(dt);
    let count = 0;

    while (remaining > 1e-15 && count < MAX_SUBSTEPS) {
      const tau = safeTimescale(bodies, G);
      const h = Number.isFinite(tau) && tau > 0 ? Math.min(tau, remaining) : remaining;
      integrator(bodies, sign * h, G);
      remaining -= h;
      count++;
    }
    return count;
  }

  window.NB.Physics = {
    computeAccelerations,
    minPairDistance,
    stepEuler,
    stepVerlet,
    stepRK4,
    INTEGRATORS,
    advance,
  };
})();
