// diagnostics.js
// Cantidades físicamente conservadas en un sistema aislado de N cuerpos bajo
// gravedad newtoniana: energía total, momento lineal y momento angular. No se
// conservan individualmente por cuerpo, sino para el sistema completo; sirven
// como el mejor "test de honestidad" de un integrador numérico (ver theory.html).
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  /** Energía cinética total: Σ (1/2) m v². */
  function kineticEnergy(bodies) {
    let ke = 0;
    for (const b of bodies) {
      ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy);
    }
    return ke;
  }

  /** Energía potencial gravitatoria total: -Σ_{i<j} G mi mj / rij. */
  function potentialEnergy(bodies, G) {
    let pe = 0;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const r = Math.hypot(dx, dy);
        if (r > 1e-12) {
          pe -= (G * bodies[i].mass * bodies[j].mass) / r;
        }
      }
    }
    return pe;
  }

  function totalEnergy(bodies, G) {
    return kineticEnergy(bodies) + potentialEnergy(bodies, G);
  }

  /** Momento lineal total del sistema: Σ m v (vector). */
  function totalMomentum(bodies) {
    let px = 0;
    let py = 0;
    for (const b of bodies) {
      px += b.mass * b.vx;
      py += b.mass * b.vy;
    }
    return { x: px, y: py };
  }

  /** Momento angular total respecto al origen (componente z en 2D): Σ m (x vy - y vx). */
  function totalAngularMomentum(bodies) {
    let L = 0;
    for (const b of bodies) {
      L += b.mass * (b.x * b.vy - b.y * b.vx);
    }
    return L;
  }

  /** Centro de masas: posición y velocidad. */
  function centerOfMass(bodies) {
    let mTotal = 0;
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    for (const b of bodies) {
      mTotal += b.mass;
      x += b.mass * b.x;
      y += b.mass * b.y;
      vx += b.mass * b.vx;
      vy += b.mass * b.vy;
    }
    if (mTotal <= 0) return { x: 0, y: 0, vx: 0, vy: 0, mass: 0 };
    return { x: x / mTotal, y: y / mTotal, vx: vx / mTotal, vy: vy / mTotal, mass: mTotal };
  }

  /**
   * Energía "de cada cuerpo": su energía cinética más LA MITAD de cada energía
   * potencial de par en la que participa. La energía potencial gravitatoria
   * pertenece al par, no a un cuerpo concreto; el reparto al 50% es un
   * convenio (el más habitual) que hace que la suma de las E_i coincida
   * exactamente con la energía total del sistema — que es la cantidad
   * físicamente conservada. Las E_i individuales NO se conservan: los cuerpos
   * se intercambian energía continuamente a través de la gravedad.
   */
  function perBodyEnergies(bodies, G) {
    const energies = bodies.map((b) => 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy));
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const dx = bodies[j].x - bodies[i].x;
        const dy = bodies[j].y - bodies[i].y;
        const r = Math.hypot(dx, dy);
        if (r > 1e-12) {
          const U = -(G * bodies[i].mass * bodies[j].mass) / r;
          energies[i] += U / 2;
          energies[j] += U / 2;
        }
      }
    }
    return energies;
  }

  /**
   * Calcula el paquete completo de diagnósticos de una vez (evita recorrer
   * bodies varias veces desde la UI en cada fotograma).
   */
  function computeDiagnostics(bodies, G) {
    const ke = kineticEnergy(bodies);
    const pe = potentialEnergy(bodies, G);
    const momentum = totalMomentum(bodies);
    const angularMomentum = totalAngularMomentum(bodies);
    const com = centerOfMass(bodies);
    return {
      kineticEnergy: ke,
      potentialEnergy: pe,
      totalEnergy: ke + pe,
      momentum,
      angularMomentum,
      centerOfMass: com,
    };
  }

  window.NB.Diagnostics = {
    kineticEnergy,
    potentialEnergy,
    totalEnergy,
    totalMomentum,
    totalAngularMomentum,
    centerOfMass,
    perBodyEnergies,
    computeDiagnostics,
  };
})();
