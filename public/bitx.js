/* MCG IT Grid - small shared effects: number count-up, button ripple, Esc closes side panel */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var t0page = performance.now();

  // numbers in stat cards count up (only during the first seconds after the page opens)
  if (!reduce && 'MutationObserver' in window) {
    new MutationObserver(function () {
      if (performance.now() - t0page > 5000) return;
      document.querySelectorAll('.stat b:not([data-c]),.mstat b:not([data-c])').forEach(function (b) {
        b.dataset.c = 1;
        var m = /^(\d+)(%?)$/.exec(b.textContent.trim()); if (!m) return;
        var to = +m[1], suf = m[2], s = performance.now();
        (function step(t) {
          var k = Math.min(1, (t - s) / 800);
          b.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + suf;
          if (k < 1) requestAnimationFrame(step);
        })(s);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ripple on buttons
  document.addEventListener('pointerdown', function (e) {
    if (reduce) return;
    var b = e.target.closest && e.target.closest('.btn:not(:disabled), .seg button, .addq button');
    if (!b) return;
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
    sp.className = 'rip';
    sp.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
    b.appendChild(sp); setTimeout(function () { sp.remove(); }, 650);
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.body.classList.remove('side-open'); });
})();
