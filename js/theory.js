// theory.js
// Mejoras de lectura de la página de teoría:
//   - Barra de progreso de lectura fija en la parte superior.
//   - Índice flotante (TOC) lateral en pantallas anchas, con resaltado de la
//     sección activa a medida que se hace scroll.
// El scroll ocurre DENTRO de .theory-body (que tiene overflow-y:auto), no en
// la ventana: por eso todo se mide sobre ese contenedor.
//
// Script clásico (sin import/export): ver nota en body.js.

(function () {
  function init() {
    const scroller = document.querySelector(".theory-body");
    if (!scroller) return;

    const sections = Array.from(scroller.querySelectorAll("section[id]")).filter((s) =>
      s.querySelector("h2")
    );

    // --- Barra de progreso de lectura --------------------------------------
    const progress = document.createElement("div");
    progress.className = "reading-progress";
    document.body.appendChild(progress);

    function updateProgress() {
      const max = scroller.scrollHeight - scroller.clientHeight;
      const frac = max > 0 ? scroller.scrollTop / max : 0;
      progress.style.width = (frac * 100).toFixed(2) + "%";
    }

    // --- Índice flotante ----------------------------------------------------
    const toc = document.createElement("nav");
    toc.className = "toc-float";
    toc.setAttribute("aria-label", "Índice flotante");
    const heading = document.createElement("h3");
    heading.textContent = "Contenido";
    toc.appendChild(heading);
    const ol = document.createElement("ol");
    const linkById = new Map();
    for (const sec of sections) {
      const h2 = sec.querySelector("h2");
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + sec.id;
      a.textContent = h2.textContent.trim();
      a.addEventListener("click", (e) => {
        e.preventDefault();
        sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      li.appendChild(a);
      ol.appendChild(li);
      linkById.set(sec.id, a);
    }
    toc.appendChild(ol);
    document.body.appendChild(toc);

    // --- Sección activa -----------------------------------------------------
    function updateActive() {
      // La sección activa es la última cuyo borde superior ya ha pasado el
      // 30% superior del área visible del contenedor.
      const marker = scroller.scrollTop + scroller.clientHeight * 0.3;
      let activeId = sections.length ? sections[0].id : null;
      for (const sec of sections) {
        if (sec.offsetTop <= marker) activeId = sec.id;
      }
      for (const [id, a] of linkById) {
        a.classList.toggle("active", id === activeId);
      }
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateProgress();
        updateActive();
        ticking = false;
      });
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateProgress();
    updateActive();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
