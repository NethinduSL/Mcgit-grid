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


/* MCG ICT Grid - Floating AI Student Helper (Auto-Language + Rich Highlights) */
(function () {
  function mountMcgAiHelper() {
    if (document.getElementById('mcg-ai-helper')) return;
    if (location.pathname.endsWith('/ai.html')) return;

    var st = document.createElement('style');
    st.textContent = [
      '#mcg-ai-helper{position:fixed;right:18px;bottom:18px;z-index:75;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:"Poppins","Noto Sans Sinhala",system-ui,sans-serif;}',
      '#mcg-ai-box{display:none;width:356px;max-width:calc(100vw - 32px);height:465px;max-height:calc(100vh - 96px);background:var(--card,#fff);color:var(--tx,#121214);border:1px solid var(--line,#e2e2dc);border-radius:var(--r,14px);box-shadow:var(--sh2,0 12px 30px rgba(0,0,0,.18));flex-direction:column;overflow:hidden;animation:pop .22s ease both;}',
      '#mcg-ai-box.open{display:flex;}',
      '.mcg-ai-head{padding:12px 14px;background:var(--y,#ffc900);color:#111;display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.mcg-ai-id{display:flex;align-items:center;gap:9px;min-width:0;}',
      '.mcg-ai-crest{width:30px;height:30px;border-radius:50%;background:#fff;object-fit:contain;padding:2px;flex:none;}',
      '.mcg-ai-ttl{font-weight:700;font-size:13.5px;line-height:1.2;}',
      '.mcg-ai-sub{font-size:11px;opacity:.78;font-weight:600;}',
      '.mcg-ai-acts{display:flex;align-items:center;gap:5px;flex:none;}',
      '.mcg-ai-hbtn{background:rgba(17,17,17,.12);border:0;color:#111;height:28px;padding:0 8px;border-radius:8px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;}',
      '.mcg-ai-hbtn:hover{background:rgba(17,17,17,.22);}',
      '.mcg-ai-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--bg,#f5f5f2);}',
      '.mcg-ai-msg{max-width:88%;padding:10px 13px;border-radius:12px;font-size:13px;line-height:1.55;word-break:break-word;}',
      '.mcg-ai-msg.bot{align-self:flex-start;background:var(--card,#fff);color:var(--tx,#121214);border:1px solid var(--line,#e2e2dc);}',
      '.mcg-ai-msg.usr{align-self:flex-end;background:var(--y,#ffc900);color:#111;font-weight:500;}',
      '.mcg-ai-hl{background:var(--yt,rgba(255,201,0,.18));color:#92400e;font-weight:700;padding:1px 5px;border-radius:5px;}',
      ':root[data-theme=dark] .mcg-ai-hl{color:var(--y,#ffc900);}',
      '.mcg-ai-code{font-family:"JetBrains Mono",monospace;font-size:11.5px;background:var(--bg2,#ecece7);border:1px solid var(--line,#e2e2dc);padding:1px 5px;border-radius:5px;}',
      '.mcg-ai-chips{padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;background:var(--card,#fff);border-top:1px solid var(--line,#e2e2dc);}',
      '.mcg-ai-chip{font:inherit;font-size:11.5px;padding:5px 10px;border-radius:9px;border:1px solid var(--line,#e2e2dc);background:var(--bg2,#ecece7);color:var(--tx,#121214);cursor:pointer;text-align:left;}',
      '.mcg-ai-chip:hover{border-color:var(--yl,rgba(255,201,0,.4));background:var(--yt,rgba(255,201,0,.14));}',
      '.mcg-ai-form{display:flex;gap:6px;padding:10px;border-top:1px solid var(--line,#e2e2dc);background:var(--card,#fff);}',
      '.mcg-ai-inp{flex:1;padding:9px 12px;border:1px solid var(--line,#e2e2dc);border-radius:10px;font:inherit;font-size:13px;background:var(--field,#fff);color:var(--tx,#121214);}',
      '.mcg-ai-inp:focus{outline:none;border-color:var(--y,#ffc900);}',
      '#mcg-ai-fab{border-radius:14px;box-shadow:var(--sh2,0 8px 24px rgba(0,0,0,.18));}'
    ].join('');
    document.head.appendChild(st);

    function renderRich(el, raw) {
      while (el.firstChild) el.removeChild(el.firstChild);
      var lines = String(raw || '').split('\n');
      var re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      lines.forEach(function (line, i) {
        if (i > 0) el.appendChild(document.createElement('br'));
        line.replace(/^\s*[-*]\s+/, '• ').split(re).forEach(function (p) {
          if (p.indexOf('**') === 0 && p.lastIndexOf('**') === p.length - 2 && p.length > 4) {
            var s = document.createElement('strong');
            s.className = 'mcg-ai-hl';
            s.textContent = p.slice(2, -2);
            el.appendChild(s);
          } else if (p.indexOf('`') === 0 && p.lastIndexOf('`') === p.length - 1 && p.length > 2) {
            var c = document.createElement('code');
            c.className = 'mcg-ai-code';
            c.textContent = p.slice(1, -1);
            el.appendChild(c);
          } else if (p) {
            el.appendChild(document.createTextNode(p));
          }
        });
      });
    }

    var wrap = document.createElement('div');
    wrap.id = 'mcg-ai-helper';
    var box = document.createElement('div');
    box.id = 'mcg-ai-box';

    var head = document.createElement('div');
    head.className = 'mcg-ai-head';
    var idBox = document.createElement('div');
    idBox.className = 'mcg-ai-id';
    var img = document.createElement('img');
    img.className = 'mcg-ai-crest';
    img.src = 'logos/favicon.svg';
    img.alt = '';
    img.onerror = function () { img.remove(); };
    var titleWrap = document.createElement('div');
    var ttl = document.createElement('div');
    ttl.className = 'mcg-ai-ttl';
    ttl.textContent = 'Grid Helper';
    var sub = document.createElement('div');
    sub.className = 'mcg-ai-sub';
    sub.textContent = 'සිංහල & English';
    titleWrap.appendChild(ttl);
    titleWrap.appendChild(sub);
    idBox.appendChild(img);
    idBox.appendChild(titleWrap);

    var acts = document.createElement('div');
    acts.className = 'mcg-ai-acts';
    var fullLink = document.createElement('a');
    fullLink.href = 'ai.html';
    fullLink.className = 'mcg-ai-hbtn';
    fullLink.title = 'Open full chat page';
    var fullIcon = document.createElement('i');
    fullIcon.className = 'fa-solid fa-up-right-from-square';
    fullLink.appendChild(fullIcon);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mcg-ai-hbtn';
    closeBtn.setAttribute('aria-label', 'Close');
    var closeIcon = document.createElement('i');
    closeIcon.className = 'fa-solid fa-xmark';
    closeBtn.appendChild(closeIcon);

    acts.appendChild(fullLink);
    acts.appendChild(closeBtn);
    head.appendChild(idBox);
    head.appendChild(acts);

    var msgs = document.createElement('div');
    msgs.className = 'mcg-ai-msgs';
    var chips = document.createElement('div');
    chips.className = 'mcg-ai-chips';

    var form = document.createElement('form');
    form.className = 'mcg-ai-form';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'mcg-ai-inp';
    inp.placeholder = 'සිංහලෙන් හෝ English වලින් අසන්න...';
    var sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'btn sm';
    sendBtn.setAttribute('aria-label', 'Send');
    var sendIcon = document.createElement('i');
    sendIcon.className = 'fa-solid fa-paper-plane';
    sendBtn.appendChild(sendIcon);
    form.appendChild(inp);
    form.appendChild(sendBtn);

    box.appendChild(head);
    box.appendChild(msgs);
    box.appendChild(chips);
    box.appendChild(form);

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'mcg-ai-fab';
    fab.className = 'btn';
    var fabIcon = document.createElement('i');
    fabIcon.className = 'fa-solid fa-robot';
    var fabText = document.createElement('span');
    fabText.textContent = 'AI Helper';
    fab.appendChild(fabIcon);
    fab.appendChild(fabText);

    wrap.appendChild(box);
    wrap.appendChild(fab);
    document.body.appendChild(wrap);

    var history = [];

    function addBubble(role, text) {
      var b = document.createElement('div');
      b.className = 'mcg-ai-msg ' + (role === 'user' ? 'usr' : 'bot');
      if (role === 'assistant') renderRich(b, text);
      else b.textContent = text;
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
      return b;
    }

    addBubble('assistant', 'ආයුබෝවන්! මම **MCG ICT Grid** AI සහායක. Homework, Quizzes හෝ ඕනෑම විෂය කරුණක් **සිංහලෙන් හෝ English වලින්** අසන්න!');

    [
      'Homework එකට photo දාන්නේ කොහොමද?',
      'Where do I see my quiz marks?',
      'Input devices මොනවාද?'
    ].forEach(function (q) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mcg-ai-chip';
      chip.textContent = q;
      chip.onclick = function () { ask(q); };
      chips.appendChild(chip);
    });

    async function ask(raw) {
      var q = String(raw || '').trim();
      if (!q || sendBtn.disabled) return;
      chips.style.display = 'none';
      history.push({ role: 'user', text: q });
      addBubble('user', q);
      inp.value = '';
      sendBtn.disabled = true;
      var wait = addBubble('assistant', 'පිළිතුර සකසමින්...');

      try {
        var r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'chat', messages: history })
        });
        var j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Error');
        renderRich(wait, j.reply);
        history.push({ role: 'assistant', text: j.reply });
      } catch (e) {
        wait.textContent = e.message || 'Connection error';
      } finally {
        sendBtn.disabled = false;
        msgs.scrollTop = msgs.scrollHeight;
      }
    }

    fab.onclick = function () { box.classList.toggle('open'); };
    closeBtn.onclick = function () { box.classList.remove('open'); };
    form.onsubmit = function (e) { e.preventDefault(); ask(inp.value); };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountMcgAiHelper);
  } else {
    mountMcgAiHelper();
  }
})();
