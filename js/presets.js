// presets.js
// Escenarios predefinidos. Cada preset define G, un dt de partida, el
// integrador recomendado, y la lista de cuerpos con sus condiciones
// iniciales exactas. Sirven tanto de demo como de "test de validación": si el
// motor físico es correcto, la órbita de dos cuerpos debe cerrarse y la
// figura-8 debe reproducir su trayectoria característica sin desviarse.
//
// Salvo que se indique lo contrario, todos usan un sistema de unidades
// adimensional/escalado (G elegido por conveniencia didáctica), no unidades
// SI. Ver theory.html § "Unidades" para cómo reescalar a unidades reales.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  window.NB = window.NB || {};

  function circularTwoBody({ m1, m2, separation, G }) {
    // Problema de dos cuerpos exacto: ambos orbitan su centro de masas común,
    // que se sitúa en el origen y permanece en reposo.
    const mTotal = m1 + m2;
    const x1 = (m2 / mTotal) * separation;
    const x2 = (m1 / mTotal) * separation;
    const vRel = Math.sqrt((G * mTotal) / separation);
    const v1 = (m2 / mTotal) * vRel;
    const v2 = (m1 / mTotal) * vRel;
    return {
      body1: { x: -x1, y: 0, vx: 0, vy: -v1 },
      body2: { x: x2, y: 0, vx: 0, vy: v2 },
    };
  }

  /**
   * Configuración central de Lagrange (1772): tres masas cualesquiera en los
   * vértices de un triángulo equilátero de lado `side`, girando rígidamente
   * alrededor de su centro de masas común con velocidad angular
   *   ω² = G·(m1+m2+m3) / side³
   * — válida para masas arbitrarias, no solo iguales. Cada cuerpo describe un
   * círculo perfecto alrededor del baricentro, con radio proporcional a su
   * distancia de éste (que depende de las masas, no es el centroide geométrico
   * salvo que las tres masas sean iguales).
   */
  function lagrangeTriangle({ m1, m2, m3, side, G }) {
    const circumradius = side / Math.sqrt(3);
    const angles = [90, 210, 330].map((deg) => (deg * Math.PI) / 180);
    const verts = angles.map((a) => ({ x: circumradius * Math.cos(a), y: circumradius * Math.sin(a) }));
    const masses = [m1, m2, m3];
    const mTotal = m1 + m2 + m3;
    const bary = {
      x: (m1 * verts[0].x + m2 * verts[1].x + m3 * verts[2].x) / mTotal,
      y: (m1 * verts[0].y + m2 * verts[1].y + m3 * verts[2].y) / mTotal,
    };
    const omega = Math.sqrt((G * mTotal) / (side * side * side));
    return verts.map((v, i) => {
      const dx = v.x - bary.x;
      const dy = v.y - bary.y;
      return { mass: masses[i], x: dx, y: dy, vx: -omega * dy, vy: omega * dx };
    });
  }

  /**
   * Configuración colineal de Euler (1767), caso de masas iguales: dos cuerpos
   * a distancia `d` de un tercero central, los tres siempre alineados. El
   * cuerpo central queda exactamente en reposo en el centro de masas (las
   * fuerzas de los otros dos se cancelan) y los dos exteriores orbitan ese
   * punto en un círculo de radio `d`, con
   *   ω² = (5/4)·G·m / d³
   * (resultado válido para el caso simétrico de masas iguales).
   */
  function eulerCollinear({ m, d, G }) {
    const omega = Math.sqrt((1.25 * G * m) / (d * d * d));
    const v = omega * d;
    return [
      { mass: m, x: -d, y: 0, vx: 0, vy: -v },
      { mass: m, x: 0, y: 0, vx: 0, vy: 0 },
      { mass: m, x: d, y: 0, vx: 0, vy: v },
    ];
  }

  const PRESETS = {
    empty: {
      label: "Escena vacía",
      description: "Sin cuerpos: añade los tuyos manualmente.",
      G: 1,
      dt: 0.01,
      integrator: "verlet",
      bodies: () => [],
    },

    kepler2: {
      label: "Órbita de Kepler (2 cuerpos)",
      description:
        "Estrella y planeta orbitando su centro de masas común en una elipse/círculo cerrado. Caso de validación básico: la órbita debe cerrarse y la energía total mantenerse casi constante.",
      G: 1,
      dt: 0.02,
      integrator: "verlet",
      bodies: () => {
        const { body1, body2 } = circularTwoBody({ m1: 1000, m2: 1, separation: 200, G: 1 });
        return [
          { mass: 1000, ...body1, color: "#ffd166", name: "Estrella" },
          { mass: 1, ...body2, color: "#5eb1ff", name: "Planeta" },
        ];
      },
    },

    binaryPlanet: {
      label: "Binaria + planeta lejano",
      description:
        "Dos estrellas de masa comparable orbitándose entre sí, con un planeta ligero orbitando el conjunto desde lejos.",
      G: 1,
      dt: 0.02,
      integrator: "verlet",
      bodies: () => {
        const { body1, body2 } = circularTwoBody({ m1: 50, m2: 50, separation: 60, G: 1 });
        return [
          { mass: 50, ...body1, color: "#ff6b6b", name: "Estrella A" },
          { mass: 50, ...body2, color: "#ffa94d", name: "Estrella B" },
          {
            mass: 0.001,
            x: 0,
            y: 300,
            vx: -Math.sqrt((1 * 100) / 300),
            vy: 0,
            color: "#69db7c",
            name: "Planeta",
          },
        ];
      },
    },

    figureEight: {
      label: "Figura-8 de tres cuerpos",
      description:
        "Solución periódica de Chenciner–Montgomery: tres masas iguales persiguiéndose en una única curva en forma de 8. Muy sensible a errores numéricos: buen test de precisión del integrador.",
      G: 1,
      dt: 0.001,
      integrator: "rk4",
      bodies: () => [
        {
          mass: 1,
          x: 0.97000436,
          y: -0.24308753,
          vx: 0.46620369,
          vy: 0.43236573,
          color: "#ff6b6b",
          name: "Cuerpo 1",
        },
        {
          mass: 1,
          x: -0.97000436,
          y: 0.24308753,
          vx: 0.46620369,
          vy: 0.43236573,
          color: "#5eb1ff",
          name: "Cuerpo 2",
        },
        {
          mass: 1,
          x: 0,
          y: 0,
          vx: -0.93240737,
          vy: -0.86473146,
          color: "#ffd166",
          name: "Cuerpo 3",
        },
      ],
    },

    lagrangeEqual: {
      label: "Triángulo de Lagrange, masas iguales (inestable)",
      description:
        "Solución exacta de Lagrange (1772): tres masas iguales en los vértices de un triángulo equilátero, girando rígidamente en torno a su centro de masas. Es una órbita cerrada exacta, pero linealmente INESTABLE para masas iguales (criterio de Routh): se mantiene cerrada mucho tiempo, pero cualquier perturbación diminuta —incluido el error numérico— acaba creciendo y rompiendo la simetría tras muchos periodos.",
      G: 1,
      dt: 0.05,
      integrator: "verlet",
      bodies: () => {
        const bodies = lagrangeTriangle({ m1: 1, m2: 1, m3: 1, side: 100, G: 1 });
        const meta = [
          { color: "#ff6b6b", name: "Cuerpo 1" },
          { color: "#5eb1ff", name: "Cuerpo 2" },
          { color: "#ffd166", name: "Cuerpo 3" },
        ];
        return bodies.map((b, i) => ({ ...b, ...meta[i] }));
      },
    },

    lagrangeTrojan: {
      label: "Troyanos de Lagrange (estable)",
      description:
        "La misma configuración triangular de Lagrange, pero con una masa mucho mayor que las otras dos: satisface el criterio de estabilidad de Routh y es genuinamente estable frente a perturbaciones. Es el mecanismo real detrás de los asteroides troyanos, atrapados 60° por delante y por detrás de Júpiter en su órbita alrededor del Sol.",
      G: 1,
      dt: 0.05,
      integrator: "verlet",
      bodies: () => {
        const bodies = lagrangeTriangle({ m1: 100, m2: 1, m3: 1, side: 100, G: 1 });
        const meta = [
          { color: "#ffd166", name: "Estrella" },
          { color: "#69db7c", name: "Troyano A" },
          { color: "#5eb1ff", name: "Troyano B" },
        ];
        return bodies.map((b, i) => ({ ...b, ...meta[i] }));
      },
    },

    eulerCollinear: {
      label: "Configuración colineal de Euler (inestable)",
      description:
        "Solución exacta de Euler (1767): tres masas iguales siempre alineadas. La central queda fija en el centro de masas (las fuerzas de los otros dos se cancelan) mientras los dos exteriores orbitan describiendo círculos opuestos. También es una órbita cerrada exacta pero linealmente inestable, como el triángulo de Lagrange de masas iguales.",
      G: 1,
      dt: 0.05,
      integrator: "verlet",
      bodies: () => {
        const bodies = eulerCollinear({ m: 1, d: 50, G: 1 });
        const meta = [
          { color: "#ff6b6b", name: "Cuerpo A" },
          { color: "#ffd166", name: "Cuerpo central" },
          { color: "#5eb1ff", name: "Cuerpo B" },
        ];
        return bodies.map((b, i) => ({ ...b, ...meta[i] }));
      },
    },

    solarSystem: {
      label: "Sistema tipo solar (simplificado)",
      description:
        "Una estrella central y varios planetas de masa despreciable en órbitas circulares aproximadamente independientes.",
      G: 1,
      dt: 0.01,
      integrator: "verlet",
      bodies: () => {
        const Ms = 1000;
        const G = 1;
        const planets = [
          { r: 80, angleDeg: 0, color: "#c0c0c0", name: "Mercurio" },
          { r: 140, angleDeg: 60, color: "#e0c097", name: "Venus" },
          { r: 200, angleDeg: 180, color: "#5eb1ff", name: "Tierra" },
          { r: 260, angleDeg: 300, color: "#ff8787", name: "Marte" },
        ];
        const bodies = [{ mass: Ms, x: 0, y: 0, vx: 0, vy: 0, color: "#ffd166", name: "Sol" }];
        for (const p of planets) {
          const theta = (p.angleDeg * Math.PI) / 180;
          const v = Math.sqrt((G * Ms) / p.r);
          bodies.push({
            mass: 0.01,
            x: p.r * Math.cos(theta),
            y: p.r * Math.sin(theta),
            vx: -v * Math.sin(theta),
            vy: v * Math.cos(theta),
            color: p.color,
            name: p.name,
          });
        }
        return bodies;
      },
    },
  };

  window.NB.PRESETS = PRESETS;
})();
