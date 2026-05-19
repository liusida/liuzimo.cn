(function () {
  if (!document.body) return;

  const style = document.createElement('style');
  style.textContent = `
    .back-to-top-btn {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 40;
      border: 1px solid rgba(120, 140, 180, 0.25);
      background: rgba(7, 8, 13, 0.78);
      color: #e4e7ed;
      font: 500 0.72rem/1 "Inter", "Helvetica Neue", Arial, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      border-radius: 999px;
      padding: 0.55rem 0.85rem;
      cursor: pointer;
      opacity: 0;
      transform: translateY(12px) scale(0.98);
      pointer-events: none;
      transition: opacity 0.22s ease, transform 0.22s ease, border-color 0.2s ease, background 0.2s ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .back-to-top-btn.is-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .back-to-top-btn:hover {
      border-color: rgba(244, 242, 237, 0.45);
      background: rgba(244, 242, 237, 0.12);
    }

    .back-to-top-btn:focus-visible {
      outline: 2px solid rgba(140, 170, 255, 0.45);
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'back-to-top-btn';
  button.setAttribute('aria-label', 'Back to top');
  button.textContent = 'Top';
  document.body.appendChild(button);

  const toggle = function () {
    if (window.scrollY > 280) {
      button.classList.add('is-visible');
    } else {
      button.classList.remove('is-visible');
    }
  };

  button.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', toggle, { passive: true });
  window.addEventListener('resize', toggle);
  toggle();
})();
