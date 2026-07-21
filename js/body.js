// body.js
// Representa un cuerpo puntual: masa + estado cinemático (posición, velocidad,
// aceleración). Los cuerpos son puntos matemáticos sin radio físico real; el
// "radio" que se dibuja en pantalla es solo una representación visual
// proporcional a la masa (ver renderer.js), nunca se usa en la física.
//
// Script clásico (sin import/export) para que la página funcione abierta con
// doble clic (file://): los navegadores bloquean los módulos ES en ese
// protocolo. Todo lo público cuelga de window.NB.

(function () {
  window.NB = window.NB || {};

  let nextId = 1;

  class Body {
    constructor({ mass, x, y, vx = 0, vy = 0, color, name } = {}) {
      this.id = nextId++;
      this.mass = mass;
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.ax = 0;
      this.ay = 0;
      this.color = color || Body.randomColor();
      this.name = name || `Cuerpo ${this.id}`;

      // Estela de posiciones recientes, para dibujar la trayectoria.
      this.trail = [];
      this.maxTrailLength = 800;

      // Condición inicial guardada, para poder "reiniciar" sin recrear el objeto.
      this.initial = { mass, x, y, vx, vy };
    }

    static randomColor() {
      const hue = Math.floor(Math.random() * 360);
      return `hsl(${hue}, 75%, 62%)`;
    }

    recordInitial() {
      this.initial = { mass: this.mass, x: this.x, y: this.y, vx: this.vx, vy: this.vy };
    }

    reset() {
      this.mass = this.initial.mass;
      this.x = this.initial.x;
      this.y = this.initial.y;
      this.vx = this.initial.vx;
      this.vy = this.initial.vy;
      this.ax = 0;
      this.ay = 0;
      this.trail.length = 0;
    }

    pushTrail() {
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > this.maxTrailLength) {
        this.trail.shift();
      }
    }

    clone() {
      const b = new Body({
        mass: this.mass,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        color: this.color,
        name: this.name,
      });
      b.initial = { ...this.initial };
      return b;
    }

    toJSON() {
      return {
        mass: this.mass,
        x: this.x,
        y: this.y,
        vx: this.vx,
        vy: this.vy,
        color: this.color,
        name: this.name,
      };
    }
  }

  window.NB.Body = Body;
})();
