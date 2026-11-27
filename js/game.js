/* =====================================================================
 * 코알라 퀴즈 캐치 - 게임 엔진
 * 문제 데이터는 js/content.js 에 있습니다.
 * ===================================================================== */
(() => {
  "use strict";

  const CONTENT = window.KOALA_CONTENT;
  const SUBJECTS = CONTENT.subjects.slice();
  const LEARN_SUBJECTS = SUBJECTS.filter((s) => s.id !== "bell");
  const BUILTIN_MODE_IDS = LEARN_SUBJECTS.flatMap((s) => s.modes.map((m) => m.id));

  // ---------- 선생님이 직접 만드는 문제 ----------
  const SAMPLE_CUSTOM = [
    "태양계에서 가장 큰 행성은? | 목성 | 토성, 화성, 지구",
    "7 × 8 = ? | 56 | 54, 48, 63",
    "apple 의 뜻은? | 사과 | 바나나, 포도, 딸기",
    "우리나라의 수도는? | 서울 | 부산, 대전, 광주",
    "물이 얼면? | 얼음 | 수증기, 구름",
  ].join("\n");
  // 한 줄: 문제 | 정답 | 오답1, 오답2 ...  (엑셀에서 복사한 탭 구분도 가능)
  function parseCustom(text) {
    const items = [], errors = [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim() || line.trim().startsWith("#")) return;
      const cols = line.split(/\s*[|\t]\s*/).map((c) => c.trim()).filter((c, k) => c || k < 2);
      if (cols.length < 2 || !cols[0] || !cols[1]) { errors.push(i + 1); return; }
      const wrongs = cols.slice(2).flatMap((c) => c.split(/\s*,\s*/)).map((w) => w.trim()).filter((w) => w && w !== cols[1]);
      items.push({ q: cols[0], a: cols[1], w: wrongs });
    });
    return { items, errors };
  }
  const customGen = () => {
    const items = (save.custom && save.custom.items) || [];
    const it = items[Math.floor(Math.random() * items.length)];
    const answers = items.map((x) => x.a).filter((a) => a !== it.a);
    const num = /^-?\d+$/.test(it.a) ? Number(it.a) : it.a;
    const shuffled = answers.sort(() => Math.random() - 0.5);
    return { text: it.q, answer: num, wrongs: [...it.w, ...shuffled], fill: true, priority: it.w.length };
  };
  SUBJECTS.push({ id: "custom", name: "내 문제", emoji: "✏️", color: "#00897b", modes: [{ id: "custom", name: "내가 만든 퀴즈", emoji: "📝", grade: "직접 만들기", gen: customGen }] });
  const MODE_MAP = {};
  SUBJECTS.forEach((s) => s.modes.forEach((m) => (MODE_MAP[m.id] = { ...m, subject: s })));

  // ---------- 설정 ----------
  const CFG = {
    hearts: 3, maxHearts: 5,
    timeAttack: 60, timePenalty: 3, timeBonus: 5,
    correctPerLevel: 5, bonusEvery: 10,
    slowTime: 6, doubleTime: 8, stunTime: 1.2,
  };
  const GAME_TYPES = { normal: "❤️ 기본", time: "⏱ 타임어택", practice: "🐢 연습" };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const stage = $("stage");
  const el = {
    score: $("score"), level: $("level"), life: $("life"), combo: $("combo"),
    problem: $("problem"), problemText: $("problemText"), problemArt: $("problemArt"),
    timebar: $("timebar"), timebarFill: $("timebarFill"), toast: $("toast"),
    start: $("startScreen"), editor: $("editorScreen"), help: $("helpScreen"), book: $("bookScreen"), pause: $("pauseScreen"), end: $("endScreen"),
  };

  // ---------- 저장 데이터 ----------
  const SAVE_KEY = "koala-quiz-catch-v2";
  const defaultSave = () => ({ best: {}, stickers: {}, played: {}, totalCorrect: 0, games: 0, sound: true, custom: { title: "", items: [] }, last: { subject: "math", mode: "add", type: "normal" } });
  let save = (() => {
    try { return Object.assign(defaultSave(), JSON.parse(localStorage.getItem(SAVE_KEY) || "{}")); }
    catch (e) { return defaultSave(); }
  })();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ } };

  // ---------- 상태 ----------
  let subjectId = MODE_MAP[save.last.mode] ? MODE_MAP[save.last.mode].subject.id : "math";
  let modeId = MODE_MAP[save.last.mode] ? save.last.mode : "add";
  let gameType = GAME_TYPES[save.last.type] ? save.last.type : "normal";

  let W = 0, H = 0, DPR = 1;
  let state = "menu"; // menu | play | pause | end
  let S = null; // 한 판의 상태
  let rafId = 0, lastTime = 0;
  const keys = { left: false, right: false };
  let pointerX = null;

  // ---------- 유틸 ----------
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  // 숫자 정답 주변의 헷갈리는 오답
  function nearNumbers(answer, n, exclude) {
    const set = new Set(), spread = Math.max(3, Math.ceil(Math.abs(answer) * 0.3));
    let guard = 0;
    while (set.size < n && guard++ < 300) {
      const r = Math.random();
      let w;
      if (r < 0.45) w = answer + pick([-1, 1, -2, 2]);
      else if (r < 0.7 && answer >= 10) w = answer + pick([-10, 10]);
      else w = answer + rand(-spread, spread);
      if (w !== answer && w >= 0 && !exclude.has(String(w))) set.add(w);
    }
    for (let k = 1; set.size < n; k++) if (!exclude.has(String(answer + k))) set.add(answer + k);
    return [...set];
  }

  // ---------- 사운드 (Web Audio로 직접 합성) ----------
  let actx = null;
  function tone(freqs, dur = 0.12, type = "sine", vol = 0.14, gap = 0.8) {
    if (!save.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      let t = actx.currentTime;
      freqs.forEach((f) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur * gap;
      });
    } catch (e) { /* 소리 미지원 */ }
  }
  const sfx = {
    good: (c) => tone([523 + Math.min(c, 12) * 30, 784 + Math.min(c, 12) * 40], 0.09, "triangle"),
    bad: () => tone([233, 175], 0.17, "square", 0.06),
    level: () => tone([523, 659, 784, 1047], 0.09, "triangle"),
    item: () => tone([880, 1175, 1568], 0.07, "sine", 0.12),
    bee: () => tone([140, 120, 140, 120], 0.06, "sawtooth", 0.05, 1),
    bonus: () => tone([784, 988, 1175, 1568, 1976], 0.07, "triangle", 0.12),
    over: () => tone([523, 392, 330, 262], 0.22, "sine"),
    tick: () => tone([1200], 0.04, "square", 0.04),
    start: () => tone([392, 523, 659], 0.1, "triangle"),
  };

  // ---------- 화면 크기 ----------
  function resize() {
    const r = stage.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S) {
      S.koala.r = koalaRadius();
      S.koala.y = groundY() - S.koala.r * 0.95;
      S.koala.x = clamp(S.koala.x, S.koala.r, W - S.koala.r);
    }
    if (state !== "play") drawScene(performance.now());
  }
  const koalaRadius = () => clamp(Math.min(W, H) * 0.075, 26, 46);
  const groundY = () => H - 20;
  window.addEventListener("resize", resize);

  /* =================================================================
   * 메뉴
   * ================================================================= */
  function buildTabs() {
    const box = $("subjectTabs");
    box.innerHTML = SUBJECTS.map((s) =>
      `<button class="tab ${s.id === subjectId ? "selected" : ""}" role="tab" data-subject="${s.id}" style="--c:${s.color}">${s.emoji} ${s.name}</button>`).join("");
  }
  function buildModes() {
    const subj = SUBJECTS.find((s) => s.id === subjectId);
    document.documentElement.style.setProperty("--subject", subj.color);
    if (subj.id === "custom") {
      const n = save.custom.items.length, best = save.best["custom|normal"] || 0;
      $("modes").innerHTML = `<button class="mode selected" data-mode="custom"><span class="medal">${best ? "🏅" : ""}</span><span class="emo">📝</span>
          <span class="nm">${esc(save.custom.title || "내가 만든 퀴즈")}</span><small>${n ? n + "문제" : "아직 문제가 없어요"}</small></button>
        <button class="mode edit" id="editCustomBtn"><span class="emo">✏️</span><span class="nm">문제 만들기</span><small>고치기 · 공유하기</small></button>`;
      $("editCustomBtn").onclick = openEditor;
      updateBestLine();
      return;
    }
    $("modes").innerHTML = subj.modes.map((m) => {
      const best = Math.max(save.best[`${m.id}|normal`] || 0, save.best[`${m.id}|time`] || 0);
      const medal = best >= 500 ? "🥇" : best >= 200 ? "🥈" : best > 0 ? "🥉" : "";
      return `<button class="mode ${m.id === modeId ? "selected" : ""}" data-mode="${m.id}">
        <span class="medal">${medal}</span><span class="emo">${m.emoji}</span><span class="nm">${m.name}</span><small>${m.grade}</small></button>`;
    }).join("");
    updateBestLine();
  }
  function updateBestLine() {
    const m = MODE_MAP[modeId];
    const best = save.best[`${modeId}|${gameType}`] || 0;
    $("bestLine").textContent = `${m.emoji} ${m.name} · ${GAME_TYPES[gameType]}  —  🏆 최고 ${best}점`;
    document.querySelectorAll("#gameTypes .type").forEach((b) => b.classList.toggle("selected", b.dataset.type === gameType));
  }
  function rememberChoice() { save.last = { subject: subjectId, mode: modeId, type: gameType }; persist(); }

  $("subjectTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-subject]"); if (!b) return;
    subjectId = b.dataset.subject;
    const subj = SUBJECTS.find((s) => s.id === subjectId);
    if (!subj.modes.some((m) => m.id === modeId)) modeId = subj.modes[0].id;
    buildTabs(); buildModes(); rememberChoice(); tone([660], 0.05, "triangle", 0.08);
  });
  $("modes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    modeId = b.dataset.mode;
    document.querySelectorAll("#modes .mode").forEach((x) => x.classList.toggle("selected", x === b));
    updateBestLine(); rememberChoice(); tone([784], 0.05, "triangle", 0.08);
  });
  $("gameTypes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    gameType = b.dataset.type; updateBestLine(); rememberChoice(); tone([523], 0.05, "triangle", 0.08);
  });

  function showOnly(screen) {
    [el.start, el.help, el.book, el.pause, el.end, el.editor].forEach((s) => s.classList.toggle("hidden", s !== screen));
    if (screen) { screen.scrollTop = 0; el.toast.classList.remove("show"); }
  }
  function showMenu() {
    cancelAnimationFrame(rafId);
    state = "menu"; S = null;
    el.timebar.classList.remove("show");
    setProblem({ text: "🐨 무엇을 공부할까요?" });
    el.problem.classList.remove("bonus");
    buildTabs(); buildModes();
    resetHud();
    showOnly(el.start);
    drawScene(performance.now());
  }
  document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => showOnly(el.start)));
  $("helpBtn").onclick = () => showOnly(el.help);
  $("bookBtn").onclick = () => { buildBook(); showOnly(el.book); };
  $("resetBtn").onclick = () => {
    if (!confirm("모든 기록과 스티커를 지울까요?")) return;
    const sound = save.sound; save = defaultSave(); save.sound = sound; persist(); buildBook(); buildModes();
  };

  function resetHud() {
    el.score.textContent = 0; el.level.textContent = 1; el.combo.textContent = "";
    el.life.textContent = gameType === "time" ? `⏱ ${CFG.timeAttack}` : gameType === "practice" ? "❤️ ∞" : "❤️".repeat(CFG.hearts);
    el.life.classList.remove("warn");
  }

  // 소리 버튼
  const syncSoundBtn = () => ($("soundBtn").textContent = save.sound ? "🔊" : "🔇");
  $("soundBtn").onclick = () => { save.sound = !save.sound; persist(); syncSoundBtn(); tone([880], 0.06); };
  syncSoundBtn();

  /* =================================================================
   * 게임 진행
   * ================================================================= */
  function startGame() {
    if (modeId === "custom" && save.custom.items.length < 2) { openEditor(); $("editorMsg").textContent = "⚠️ 문제를 2개 이상 만들어야 시작할 수 있어요."; return; }
    rememberChoice();
    resize();
    const r = koalaRadius();
    S = {
      mode: modeId === "custom" ? { ...MODE_MAP.custom, name: save.custom.title || MODE_MAP.custom.name } : MODE_MAP[modeId], type: gameType,
      score: 0, level: 1, hearts: CFG.hearts, timeLeft: CFG.timeAttack,
      combo: 0, maxCombo: 0, correct: 0, total: 0, qCount: 0,
      wrongLog: [], itemsGot: 0, bonusCorrect: 0, beeHits: 0,
      koala: { x: W / 2, y: groundY() - r * 0.95, r, vx: 0, face: 1, eat: 0, sad: 0, stun: 0, walk: 0, hop: 0 },
      leaves: [], items: [], particles: [], floats: [],
      effects: { slow: 0, double: 0 },
      current: null, waveDone: true, nextWaveAt: performance.now() + 1300,
      recent: [], lastTick: 0, theme: 0, shake: 0,
    };
    showOnly(null);
    el.timebar.classList.toggle("show", gameType === "time");
    updateHud();
    setProblem({ text: "준비~" });
    showToast("준비… 시작! 🐨", "#2f5530", 1100);
    sfx.start();
    state = "play";
    lastTime = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function setProblem(p) {
    el.problemArt.innerHTML = p.html || "";
    el.problemText.textContent = p.text;
    const len = [...p.text].length;
    el.problemText.classList.toggle("long", len > 13 && len <= 20);
    el.problemText.classList.toggle("xlong", len > 20);
    el.problem.classList.remove("pop"); void el.problem.offsetWidth; el.problem.classList.add("pop");
  }

  // 같은 문제가 연달아 나오지 않게 뽑기
  function nextProblem() {
    let p;
    for (let i = 0; i < 10; i++) {
      p = S.mode.gen(S.level);
      const key = p.text + "|" + p.answer;
      if (!S.recent.includes(key)) { S.recent.push(key); if (S.recent.length > 8) S.recent.shift(); break; }
    }
    return p;
  }

  function buildChoices(p, lanes) {
    const ans = String(p.answer);
    const seen = new Set([ans]);
    let pool = [];
    for (const w of p.wrongs || []) { const s = String(w); if (!seen.has(s)) { seen.add(s); pool.push(w); } }
    if (p.keepFirstWrong) pool = [pool[0], ...shuffle(pool.slice(1))].filter((v) => v !== undefined);
    else if (p.priority) pool = [...shuffle(pool.slice(0, p.priority)), ...shuffle(pool.slice(p.priority))]; // 직접 적은 오답 먼저
    else pool = shuffle(pool);
    let wrongs = pool.slice(0, lanes - 1);
    if (wrongs.length < lanes - 1 && isNum(p.answer) && (!p.wrongs || p.fill)) {
      wrongs = wrongs.concat(nearNumbers(p.answer, lanes - 1 - wrongs.length, seen));
    }
    return shuffle([p.answer, ...wrongs]);
  }

  function newWave() {
    S.qCount++;
    const p = nextProblem();
    const bonus = S.qCount % CFG.bonusEvery === 0;
    S.current = { ...p, bonus };
    setProblem(p);
    el.problem.classList.toggle("bonus", bonus);
    if (bonus) { showToast("👑 황금 보너스 문제! ×3", "#e65100", 1200); sfx.bonus(); }

    const lanes = W < 430 ? 3 : 4;
    const values = buildChoices(p, lanes);
    const count = values.length;
    const laneW = W / count;
    const textual = values.some((v) => !isNum(v) || String(v).length > 3);
    const rx = clamp(laneW * (textual ? 0.4 : 0.34), 28, textual ? 88 : 60);
    const ry = clamp(rx * (textual ? 0.5 : 0.66), 24, 40);
    const reading = textual || p.html ? 0.82 : 1; // 글자가 많은 문제는 조금 천천히
    const typeF = S.type === "practice" ? 0.6 : S.type === "time" ? 1.2 : 1;
    const base = (H / 4.6) * (1 + (S.level - 1) * 0.1) * reading * typeF;
    S.leaves = values.map((v, i) => ({
      value: v, label: String(v), correct: String(v) === String(p.answer),
      x: clamp(laneW * (i + 0.5) + rand(-laneW * 0.06, laneW * 0.06), rx * 1.15, W - rx * 1.15),
      y: -ry - rand(0, Math.min(90, H * 0.12)),
      rx, ry, vy: base * (0.92 + Math.random() * 0.16),
      rot: 0, sway: Math.random() * Math.PI * 2, alive: true, fading: null, gold: bonus,
    }));
    S.waveDone = false;
    maybeSpawnExtras(base);
  }

  function maybeSpawnExtras(base) {
    // 아이템
    if (Math.random() < 0.2 && S.qCount > 1) {
      const pool = ["star", "slow", "clover", "clover"];
      if (S.type !== "practice" && (S.type === "time" || S.hearts < CFG.maxHearts)) pool.push("heart", "heart");
      spawnItem(pick(pool), base * 0.75);
    }
    // 방해꾼 벌 (레벨 3부터, 연습 모드 제외)
    if (S.type !== "practice" && S.level >= 3 && Math.random() < Math.min(0.15 + S.level * 0.03, 0.45)) {
      spawnItem("bee", base * 0.9);
    }
  }
  const ITEM_EMOJI = { heart: "❤️", slow: "⏳", star: "⭐", clover: "🍀", bee: "🐝" };
  function spawnItem(kind, vy) {
    S.items.push({ kind, x: rand(30, Math.max(31, W - 30)), y: -30 - rand(40, 160), vy, t: Math.random() * 6, alive: true, baseX: 0 });
    S.items[S.items.length - 1].baseX = S.items[S.items.length - 1].x;
  }

  function resolve(isCorrect, chosen, at) {
    if (S.waveDone) return;
    S.waveDone = true;
    S.total++;
    const k = S.koala;
    if (isCorrect) {
      S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
      S.correct++;
      let gain = 10 + Math.min(S.combo - 1, 10) * 2 + (S.level - 1) * 2;
      if (S.effects.double > 0) gain *= 2;
      if (S.current.bonus) { gain *= 3; S.bonusCorrect++; }
      S.score += gain;
      k.eat = 0.45; k.hop = 1;
      addFloat(`+${gain}`, at.x, at.y, S.current.bonus ? "#ff8f00" : "#2e7d32");
      const cheer = S.combo >= 10 ? "🔥 대단해요!" : S.combo >= 5 ? "👍 멋져요!" : pick(["정답!", "냠냠!", "맛있다!", "딩동댕!"]);
      showToast(`${cheer}${S.combo >= 3 ? ` ${S.combo}콤보` : ""}${S.current.reveal ? " " + S.current.reveal : ""}`, "#2e7d32");
      sfx.good(S.combo);
      if (S.correct % CFG.correctPerLevel === 0) levelUp();
    } else {
      S.combo = 0;
      k.sad = 0.9; S.shake = 0.3;
      S.wrongLog.push({ text: S.current.text, html: S.current.html, answer: S.current.answer, chosen });
      if (S.type === "normal") S.hearts--;
      if (S.type === "time") S.timeLeft = Math.max(0, S.timeLeft - CFG.timePenalty);
      showToast(chosen === null ? `놓쳤어요! 정답: ${S.current.answer}` : `앗! 정답은 ${S.current.answer}`, "#d84315", 1300);
      if (S.type === "time") addFloat(`-${CFG.timePenalty}초`, k.x, k.y - k.r * 2, "#d84315");
      sfx.bad();
      // 정답 잎을 반짝여서 알려주기
      S.leaves.forEach((l) => { if (l.correct && l.alive) l.highlight = 1.2; });
    }
    S.leaves.forEach((l) => { if (l.alive && l.fading === null) l.fading = l.highlight ? 1.6 : 1; });
    updateHud();
    if (S.type === "normal" && S.hearts <= 0) { setTimeout(() => endGame(), 900); S.over = true; return; }
    S.nextWaveAt = performance.now() + (isCorrect ? 550 : 1300);
  }

  function levelUp() {
    S.level++;
    const newTheme = Math.floor((S.level - 1) / 3) % THEMES.length;
    setTimeout(() => {
      if (state !== "play" || !S) return;
      showToast(`🚀 레벨 업! Lv.${S.level}`, "#ef6c00", 1100);
      sfx.level();
      for (let i = 0; i < 30; i++) addParticle(rand(0, W), rand(0, H * 0.5), pick(["#ffca28", "#66bb6a", "#42a5f5", "#ef5350", "#ab47bc"]), 1.2, true);
    }, 500);
    if (newTheme !== S.theme) S.theme = newTheme;
  }

  function collectItem(it) {
    S.itemsGot++;
    const k = S.koala;
    switch (it.kind) {
      case "heart":
        if (S.type === "time") { S.timeLeft += CFG.timeBonus; addFloat(`+${CFG.timeBonus}초`, it.x, it.y, "#e91e63"); }
        else { S.hearts = Math.min(CFG.maxHearts, S.hearts + 1); addFloat("❤️ +1", it.x, it.y, "#e91e63"); }
        break;
      case "slow": S.effects.slow = CFG.slowTime; addFloat("⏳ 천천히~", it.x, it.y, "#1e88e5"); break;
      case "star": S.effects.double = CFG.doubleTime; addFloat("⭐ 점수 2배!", it.x, it.y, "#f9a825"); break;
      case "clover": {
        const wrong = S.leaves.filter((l) => l.alive && !l.correct && l.fading === null);
        if (wrong.length && !S.waveDone) { const w = pick(wrong); w.fading = 1; burst(w.x, w.y, "#a5d6a7", 10); addFloat("🍀 오답 하나 삭제!", it.x, it.y, "#2e7d32"); }
        else { S.score += 15; addFloat("🍀 +15", it.x, it.y, "#2e7d32"); }
        break;
      }
    }
    k.eat = 0.3;
    burst(it.x, it.y, "#fff59d", 14);
    sfx.item();
    updateHud();
  }

  function hitBee(it) {
    const k = S.koala;
    S.beeHits++;
    k.stun = CFG.stunTime; k.sad = CFG.stunTime;
    S.score = Math.max(0, S.score - 5);
    S.shake = 0.35;
    addFloat("🐝 어질어질 -5", it.x, it.y, "#6d4c41");
    sfx.bee();
    updateHud();
  }

  function updateHud() {
    if (!S) return;
    el.score.textContent = S.score;
    el.level.textContent = S.level;
    el.combo.textContent = S.combo >= 2 ? `🔥${S.combo}` : "";
    if (S.type === "time") {
      el.life.textContent = `⏱ ${Math.ceil(S.timeLeft)}`;
      el.life.classList.toggle("warn", S.timeLeft <= 10);
    } else if (S.type === "practice") {
      el.life.textContent = "❤️ ∞";
    } else {
      el.life.textContent = "❤️".repeat(Math.max(S.hearts, 0)) + "🤍".repeat(Math.max(0, CFG.hearts - S.hearts));
      el.life.classList.toggle("warn", S.hearts === 1);
    }
  }

  let toastTimer;
  function showToast(text, color, ms = 900) {
    el.toast.textContent = text; el.toast.style.color = color;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), ms);
  }

  function addParticle(x, y, color, life = 0.7, confetti = false) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
    S.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life, max: life, color, confetti, rot: Math.random() * 6, size: confetti ? rand(4, 8) : rand(3, 5) });
  }
  function burst(x, y, color, n = 16) { for (let i = 0; i < n; i++) addParticle(x, y, color); }
  function addFloat(text, x, y, color) { S.floats.push({ text, x: clamp(x, 60, W - 60), y, color, life: 1.1 }); }

  /* =================================================================
   * 메인 루프
   * ================================================================= */
  function loop(now) {
    if (state !== "play") return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    update(dt, now);
    drawScene(now);
    rafId = requestAnimationFrame(loop);
  }

  function update(dt, now) {
    const k = S.koala;
    // 효과 시간
    S.effects.slow = Math.max(0, S.effects.slow - dt);
    S.effects.double = Math.max(0, S.effects.double - dt);
    const slowF = S.effects.slow > 0 ? 0.5 : 1;

    // 타임어택 시간
    if (S.type === "time" && !S.over) {
      S.timeLeft -= dt;
      if (S.timeLeft <= 5 && Math.ceil(S.timeLeft) !== S.lastTick) { S.lastTick = Math.ceil(S.timeLeft); sfx.tick(); }
      el.timebarFill.style.transform = `scaleX(${clamp(S.timeLeft / CFG.timeAttack, 0, 1)})`;
      if (S.timeLeft <= 0) { S.timeLeft = 0; S.over = true; updateHud(); showToast("⏰ 시간 끝!", "#d84315", 1200); setTimeout(() => endGame(), 900); }
      updateHud();
    }

    // 코알라 이동
    const prevX = k.x;
    k.stun = Math.max(0, k.stun - dt);
    if (k.stun <= 0) {
      const sp = W * 1.15;
      if (keys.left) k.x -= sp * dt;
      if (keys.right) k.x += sp * dt;
      if (pointerX !== null) k.x += (pointerX - k.x) * Math.min(1, dt * 14);
    }
    k.x = clamp(k.x, k.r, W - k.r);
    k.vx = (k.x - prevX) / Math.max(dt, 0.001);
    if (Math.abs(k.vx) > 20) { k.face = Math.sign(k.vx); k.walk += dt * 14; }
    k.eat = Math.max(0, k.eat - dt);
    k.sad = Math.max(0, k.sad - dt);
    k.hop = Math.max(0, k.hop - dt * 3);
    S.shake = Math.max(0, S.shake - dt);

    const mouthX = k.x, mouthY = k.y - k.r * 0.1, reach = k.r * 0.75;

    // 잎
    for (const l of S.leaves) {
      if (!l.alive) continue;
      if (l.highlight) l.highlight = Math.max(0, l.highlight - dt);
      if (l.fading !== null) {
        l.fading -= dt * 1.8; l.y += l.vy * dt * 0.35;
        if (l.fading <= 0) l.alive = false;
        continue;
      }
      l.y += l.vy * dt * slowF;
      l.sway += dt * 2.2;
      l.rot = Math.sin(l.sway) * 0.18;
      l.x = clamp(l.x + Math.cos(l.sway) * 6 * dt, l.rx * 1.15, W - l.rx * 1.15);
      const nx = (l.x - mouthX) / (l.rx * 0.85 + reach), ny = (l.y - mouthY) / (l.ry + reach);
      if (!S.waveDone && nx * nx + ny * ny < 1) {
        l.alive = false;
        burst(l.x, l.y, l.correct ? (l.gold ? "#ffca28" : "#66bb6a") : "#ff7043", l.correct ? 18 : 10);
        resolve(l.correct, l.value, l);
      } else if (l.y - l.ry > groundY()) {
        l.alive = false;
        if (l.correct && !S.waveDone) resolve(false, null, l);
      }
    }
    if (!S.waveDone && S.leaves.every((l) => !l.alive)) resolve(false, null, k);
    if (S.waveDone && !S.over && now >= S.nextWaveAt) newWave();

    // 아이템 · 벌
    for (const it of S.items) {
      if (!it.alive) continue;
      it.t += dt;
      it.y += it.vy * dt * slowF;
      if (it.kind === "bee") it.x = clamp(it.baseX + Math.sin(it.t * 2.6) * Math.min(90, W * 0.2), 20, W - 20);
      else it.x = it.baseX + Math.sin(it.t * 2) * 10;
      const dx = it.x - mouthX, dy = it.y - mouthY;
      if (Math.hypot(dx, dy) < k.r * 0.9 + 16) {
        it.alive = false;
        if (it.kind === "bee") { if (!S.over) hitBee(it); } else collectItem(it);
      } else if (it.y > H + 40) it.alive = false;
    }
    S.items = S.items.filter((i) => i.alive);

    // 파티클 · 떠오르는 글자
    for (const p of S.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 320 * dt; p.vx *= 0.99; p.rot += dt * 8; p.life -= dt; }
    S.particles = S.particles.filter((p) => p.life > 0);
    for (const f of S.floats) { f.y -= 50 * dt; f.life -= dt; }
    S.floats = S.floats.filter((f) => f.life > 0);
  }

  /* =================================================================
   * 그리기
   * ================================================================= */
  const THEMES = [
    { name: "아침", sky: ["#b3e5fc", "#e1f5fe"], hill: "#a5d6a7", hill2: "#81c784", ground: "#9ccc65", sun: "#fff59d", cloud: "rgba(255,255,255,.9)" },
    { name: "한낮", sky: ["#4fc3f7", "#b3e5fc"], hill: "#81c784", hill2: "#66bb6a", ground: "#8bc34a", sun: "#ffee58", cloud: "rgba(255,255,255,.95)" },
    { name: "노을", sky: ["#ff8a65", "#ffe0b2"], hill: "#8d6e63", hill2: "#6d4c41", ground: "#9e9d24", sun: "#ffcc80", cloud: "rgba(255,224,178,.85)" },
    { name: "밤", sky: ["#1a237e", "#5c6bc0"], hill: "#283593", hill2: "#1a237e", ground: "#33691e", moon: true, cloud: "rgba(197,202,233,.35)" },
  ];
  const STARS = Array.from({ length: 50 }, () => [Math.random(), Math.random() * 0.6, Math.random() * 1.5 + 0.5, Math.random() * 6]);

  function drawScene(now) {
    const t = now / 1000;
    ctx.save();
    if (S && S.shake > 0) ctx.translate(rand(-4, 4) * S.shake * 3, rand(-3, 3) * S.shake * 3);
    drawBackground(t, S ? THEMES[S.theme] : THEMES[0]);
    if (S) {
      for (const l of S.leaves) if (l.alive) drawLeaf(l, t);
      for (const it of S.items) drawItem(it, t);
      drawKoala(S.koala, t);
      for (const p of S.particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color;
        if (p.confetti) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      for (const f of S.floats) {
        ctx.globalAlpha = clamp(f.life, 0, 1);
        ctx.font = "900 22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      drawEffects();
    } else {
      // 메뉴 뒤 배경 장식 코알라
      drawKoala({ x: W / 2, y: groundY() - koalaRadius() * 0.95, r: koalaRadius(), face: 1, eat: 0, sad: 0, stun: 0, walk: 0, hop: 0, vx: 0 }, t);
    }
    ctx.restore();
  }

  function drawBackground(t, th) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
    if (th.moon) {
      for (const [sx, sy, sr, ph] of STARS) {
        ctx.globalAlpha = 0.5 + Math.sin(t * 2 + ph) * 0.4; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(sx * W, sy * H, sr, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff9c4"; ctx.beginPath(); ctx.arc(W * 0.82, H * 0.14, 26, 0, 7); ctx.fill();
      ctx.fillStyle = th.sky[0]; ctx.beginPath(); ctx.arc(W * 0.82 + 11, H * 0.14 - 7, 22, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = th.sun; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(W * 0.84, H * 0.13, 30, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(W * 0.84, H * 0.13, 44 + Math.sin(t * 2) * 4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 구름
    ctx.fillStyle = th.cloud;
    [[0.1, 0.1, 1, 9], [0.6, 0.22, 0.8, 14], [0.35, 0.36, 0.6, 20]].forEach(([cx, cy, s, sp]) => {
      const x = ((cx * W + t * sp) % (W + 160)) - 80, y = cy * H, r = 20 * s;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.arc(x + r, y - r * 0.5, r * 1.15, 0, 7); ctx.arc(x + r * 2.1, y, r, 0, 7); ctx.fill();
    });
    // 언덕
    const gy = groundY();
    ctx.fillStyle = th.hill;
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, gy - 50 - Math.sin(x / 90) * 22);
    ctx.lineTo(W, gy); ctx.fill();
    ctx.fillStyle = th.hill2;
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, gy - 22 - Math.sin(x / 60 + 2) * 12);
    ctx.lineTo(W, gy); ctx.fill();
    // 양옆 유칼립투스 나무
    drawTree(14, gy, th); drawTree(W - 14, gy, th, true);
    // 땅
    ctx.fillStyle = th.ground; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(0, gy, W, 4);
  }

  function drawTree(x, gy, th, flip) {
    const h = Math.min(H * 0.55, 260);
    ctx.fillStyle = th.moon ? "#4e342e" : "#a1887f";
    ctx.beginPath(); ctx.moveTo(x - 9, gy); ctx.lineTo(x - 5, gy - h); ctx.lineTo(x + 5, gy - h); ctx.lineTo(x + 9, gy); ctx.fill();
    ctx.fillStyle = th.moon ? "#2e7d32" : "#66bb6a";
    for (let i = 0; i < 6; i++) {
      const ly = gy - h + i * 26, dir = (i % 2 ? 1 : -1) * (flip ? -1 : 1);
      ctx.save(); ctx.translate(x + dir * 14, ly); ctx.rotate(dir * 0.5);
      ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  // 글자를 잎 안에 맞추기 (필요하면 두 줄로)
  function layoutLabel(label, maxW, maxH) {
    let lines = [label];
    const words = label.split(" ");
    let size = Math.min(maxH * 0.78, 34);
    ctx.font = `900 ${size}px sans-serif`;
    if (ctx.measureText(label).width > maxW && words.length > 1) {
      // 가장 균형 있게 두 줄로 나누기
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
        const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
        if (!best || w < best.w) best = { w, lines: [a, b] };
      }
      lines = best.lines;
      size = Math.min(size, maxH * 0.46);
    }
    ctx.font = `900 ${size}px sans-serif`;
    const widest = Math.max(...lines.map((s) => ctx.measureText(s).width));
    if (widest > maxW) size = Math.max(10, size * (maxW / widest));
    return { lines, size };
  }

  function drawLeaf(l, t) {
    ctx.save();
    const alpha = l.fading !== null ? clamp(l.fading, 0, 1) : 1;
    ctx.globalAlpha = alpha;
    ctx.translate(l.x, l.y);
    // 놓친 정답 알려주기
    if (l.highlight > 0) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffeb3b"; ctx.lineWidth = 5 + Math.sin(t * 20) * 2;
      ctx.beginPath(); ctx.ellipse(0, 0, l.rx * 1.15, l.ry * 1.35, 0, 0, 7); ctx.stroke();
    }
    ctx.rotate(l.rot);
    // 잎 모양 (양 끝이 뾰족한 유칼립투스 잎)
    const rx = l.rx, ry = l.ry * 1.1;
    const grad = ctx.createLinearGradient(0, -ry, 0, ry);
    if (l.gold) { grad.addColorStop(0, "#ffe082"); grad.addColorStop(1, "#ffa000"); }
    else { grad.addColorStop(0, "#81c784"); grad.addColorStop(1, "#388e3c"); }
    ctx.fillStyle = grad;
    ctx.strokeStyle = l.gold ? "#e65100" : "#1b5e20"; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-rx * 1.12, 0);
    ctx.bezierCurveTo(-rx * 0.6, -ry * 1.45, rx * 0.6, -ry * 1.45, rx * 1.12, 0);
    ctx.bezierCurveTo(rx * 0.6, ry * 1.45, -rx * 0.6, ry * 1.45, -rx * 1.12, 0);
    ctx.fill(); ctx.stroke();
    // 잎맥
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-rx * 1.1, 0); ctx.lineTo(rx * 1.1, 0); ctx.stroke();
    // 꼭지
    ctx.strokeStyle = "#5d4037"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-rx * 1.1, 0); ctx.lineTo(-rx * 1.3, -6); ctx.stroke();
    // 글자 라벨
    ctx.rotate(-l.rot * 0.6);
    const bw = rx * 1.62, bh = ry * 1.25;
    ctx.fillStyle = "rgba(255,255,255,.95)";
    roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2.2); ctx.fill();
    const { lines, size } = layoutLabel(l.label, bw - 12, bh - 4);
    ctx.fillStyle = l.gold ? "#bf360c" : "#1b5e20";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `900 ${size}px sans-serif`;
    const lh = size * 1.08;
    lines.forEach((s, i) => ctx.fillText(s, 0, (i - (lines.length - 1) / 2) * lh + 1));
    ctx.restore();
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawItem(it, t) {
    ctx.save();
    ctx.translate(it.x, it.y);
    if (it.kind !== "bee") {
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.beginPath(); ctx.arc(0, 0, 21 + Math.sin(t * 6 + it.t) * 2, 0, 7); ctx.fill();
      ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 2; ctx.stroke();
    } else {
      // 날갯짓
      ctx.fillStyle = "rgba(255,255,255,.7)";
      const f = Math.sin(t * 40) * 4;
      ctx.beginPath(); ctx.ellipse(-6, -14 - f / 2, 8, 5 + f / 2, -0.4, 0, 7); ctx.ellipse(6, -14 - f / 2, 8, 5 + f / 2, 0.4, 0, 7); ctx.fill();
    }
    ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#000"; // 이모지가 투명해지지 않도록
    ctx.fillText(ITEM_EMOJI[it.kind], 0, 1);
    ctx.restore();
  }

  function drawKoala(k, t) {
    const r = k.r;
    const bob = Math.abs(Math.sin(k.walk)) * 3 + (k.hop > 0 ? Math.sin(k.hop * Math.PI) * 10 : 0);
    ctx.save();
    // 그림자
    ctx.fillStyle = "rgba(0,0,0,.18)";
    ctx.beginPath(); ctx.ellipse(k.x, groundY() + 2, r * 0.9, 6, 0, 0, 7); ctx.fill();
    ctx.translate(k.x, k.y - bob);
    if (k.stun > 0) ctx.rotate(Math.sin(t * 18) * 0.12);
    const gray = "#9eaab3", dark = "#78878f", belly = "#eceff1", pink = "#f8bbd0";
    // 몸통
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.78, r * 0.55, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = belly;
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.42, r * 0.36, 0, Math.PI, 0); ctx.fill();
    // 팔 (먹을 때 위로)
    ctx.fillStyle = dark;
    const armUp = k.eat > 0 ? -r * 0.35 : 0;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * r * 0.62, r * 0.7 + armUp, r * 0.2, r * 0.3, sx * 0.5, 0, 7); ctx.fill(); }
    // 귀
    for (const sx of [-1, 1]) {
      ctx.fillStyle = gray; ctx.beginPath(); ctx.arc(sx * r * 0.86, -r * 0.55, r * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx * r * 0.88, -r * 0.55, r * 0.34, 0, 7); ctx.fill();
      ctx.fillStyle = pink; ctx.beginPath(); ctx.arc(sx * r * 0.88, -r * 0.55, r * 0.22, 0, 7); ctx.fill();
    }
    // 얼굴
    ctx.fillStyle = gray; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    const lx = k.face * r * 0.06;
    // 눈
    ctx.fillStyle = "#263238"; ctx.strokeStyle = "#263238"; ctx.lineWidth = 3; ctx.lineCap = "round";
    if (k.stun > 0) {
      ctx.lineWidth = 2;
      for (const sx of [-1, 1]) { ctx.beginPath(); for (let a = 0; a < 10; a += 0.5) ctx.lineTo(sx * r * 0.38 + lx + Math.cos(a + t * 10) * a * 0.9, -r * 0.18 + Math.sin(a + t * 10) * a * 0.9); ctx.stroke(); }
    } else if (k.sad > 0) {
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.52 + lx, -r * 0.26); ctx.lineTo(sx * r * 0.26 + lx, -r * 0.14); ctx.stroke(); }
    } else if (k.eat > 0) {
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * r * 0.38 + lx, -r * 0.12, r * 0.11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else {
      const blink = (t % 3.2) < 0.12;
      for (const sx of [-1, 1]) {
        if (blink) { ctx.beginPath(); ctx.moveTo(sx * r * 0.48 + lx, -r * 0.18); ctx.lineTo(sx * r * 0.28 + lx, -r * 0.18); ctx.stroke(); }
        else {
          ctx.beginPath(); ctx.arc(sx * r * 0.38 + lx, -r * 0.18, r * 0.11, 0, 7); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx * r * 0.38 + lx + r * 0.04, -r * 0.22, r * 0.035, 0, 7); ctx.fill(); ctx.fillStyle = "#263238";
        }
      }
    }
    // 코
    ctx.fillStyle = "#37474f"; ctx.beginPath(); ctx.ellipse(lx, r * 0.14, r * 0.23, r * 0.31, 0, 0, 7); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(lx - r * 0.07, r * 0.02, r * 0.06, r * 0.1, 0, 0, 7); ctx.fill();
    // 입
    ctx.strokeStyle = "#37474f"; ctx.lineWidth = 2.5;
    if (k.eat > 0) {
      ctx.fillStyle = "#c2185b"; ctx.beginPath(); ctx.ellipse(lx, r * 0.6, r * 0.17, r * 0.14 * (0.6 + Math.abs(Math.sin(t * 25)) * 0.6), 0, 0, 7); ctx.fill();
    } else if (k.sad > 0) {
      ctx.beginPath(); ctx.arc(lx, r * 0.76, r * 0.17, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(lx, r * 0.47, r * 0.17, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    // 볼
    ctx.fillStyle = "rgba(244,143,177,.55)";
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * r * 0.62, r * 0.27, r * 0.14, r * 0.09, 0, 0, 7); ctx.fill(); }
    // 어지러움 별
    if (k.stun > 0) {
      ctx.font = `${r * 0.4}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#000";
      for (let i = 0; i < 3; i++) { const a = t * 5 + (i * Math.PI * 2) / 3; ctx.fillText("⭐", Math.cos(a) * r * 0.8, -r * 1.15 + Math.sin(a) * r * 0.2); }
    }
    ctx.restore();
  }

  function drawEffects() {
    let x = 10;
    const list = [];
    if (S.effects.slow > 0) list.push(["⏳", S.effects.slow / CFG.slowTime, "#42a5f5"]);
    if (S.effects.double > 0) list.push(["⭐×2", S.effects.double / CFG.doubleTime, "#ffb300"]);
    for (const [label, ratio, color] of list) {
      ctx.fillStyle = "rgba(38,50,56,.55)"; roundRect(x, 10, 78, 28, 14); ctx.fill();
      ctx.fillStyle = color; roundRect(x + 3, 13, Math.max(20, 72 * ratio), 22, 11); ctx.fill();
      ctx.font = "900 15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.strokeText(label, x + 39, 25);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 39, 25);
      x += 82;
    }
  }

  /* =================================================================
   * 일시정지 · 결과
   * ================================================================= */
  function pauseGame() {
    if (state !== "play" || !S || S.over) return;
    state = "pause";
    cancelAnimationFrame(rafId);
    keys.left = keys.right = false; pointerX = null;
    $("pauseInfo").textContent = `${S.mode.emoji} ${S.mode.name} · ${GAME_TYPES[S.type]} · 지금 ${S.score}점`;
    showOnly(el.pause);
  }
  function resumeGame() {
    if (state !== "pause") return;
    showOnly(null);
    state = "play";
    lastTime = performance.now();
    if (S.waveDone) S.nextWaveAt = performance.now() + 400;
    rafId = requestAnimationFrame(loop);
  }
  $("pauseBtn").onclick = () => (state === "play" ? pauseGame() : resumeGame());
  $("resumeBtn").onclick = resumeGame;
  $("finishBtn").onclick = () => { state = "play"; endGame(); };
  $("quitBtn").onclick = showMenu;
  document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });

  // ----- 스티커(업적) -----
  const STICKERS = [
    { id: "first", emoji: "🌱", name: "첫걸음", desc: "게임을 처음 끝냈어요", test: (g) => true },
    { id: "c10", emoji: "🍃", name: "잎사귀 10장", desc: "한 판에 10문제 정답", test: (g) => g.correct >= 10 },
    { id: "c30", emoji: "🌿", name: "배부른 코알라", desc: "한 판에 30문제 정답", test: (g) => g.correct >= 30 },
    { id: "combo5", emoji: "🔥", name: "불꽃 콤보", desc: "5콤보 달성", test: (g) => g.maxCombo >= 5 },
    { id: "combo10", emoji: "💥", name: "폭발 콤보", desc: "10콤보 달성", test: (g) => g.maxCombo >= 10 },
    { id: "combo20", emoji: "🌋", name: "화산 콤보", desc: "20콤보 달성", test: (g) => g.maxCombo >= 20 },
    { id: "s200", emoji: "💯", name: "200점", desc: "한 판에 200점", test: (g) => g.score >= 200 },
    { id: "s500", emoji: "🏆", name: "500점", desc: "한 판에 500점", test: (g) => g.score >= 500 },
    { id: "s1000", emoji: "💎", name: "1000점", desc: "한 판에 1000점", test: (g) => g.score >= 1000 },
    { id: "lv7", emoji: "🌇", name: "노을 구경", desc: "레벨 7 도달", test: (g) => g.level >= 7 },
    { id: "lv10", emoji: "🌙", name: "밤하늘 코알라", desc: "레벨 10 도달", test: (g) => g.level >= 10 },
    { id: "perfect", emoji: "🎯", name: "백발백중", desc: "10문제 이상 하나도 안 틀림", test: (g) => g.total >= 10 && g.correct === g.total },
    { id: "items", emoji: "🎁", name: "아이템 수집가", desc: "한 판에 아이템 3개", test: (g) => g.itemsGot >= 3 },
    { id: "bonus", emoji: "👑", name: "황금 잎", desc: "보너스 문제 맞히기", test: (g) => g.bonusCorrect >= 1 },
    { id: "time20", emoji: "⏱", name: "번개 손", desc: "타임어택에서 20문제 정답", test: (g) => g.type === "time" && g.correct >= 20 },
    { id: "nobee", emoji: "🛡️", name: "벌 피하기 달인", desc: "레벨 5 이상, 벌에 한 번도 안 쏘임", test: (g) => g.level >= 5 && g.beeHits === 0 && g.type !== "practice" },
    { id: "allsub", emoji: "🌈", name: "골고루 박사", desc: `${LEARN_SUBJECTS.length}과목 모두 해 보기`, test: () => LEARN_SUBJECTS.every((s) => s.modes.some((m) => save.played[m.id])) },
    { id: "modes10", emoji: "📚", name: "탐험가", desc: "10가지 모드 해 보기", test: () => Object.keys(save.played).length >= 10 },
    { id: "modesAll", emoji: "🗺️", name: "모든 모드 정복", desc: `${BUILTIN_MODE_IDS.length}가지 모드 모두 해 보기`, test: () => BUILTIN_MODE_IDS.every((id) => save.played[id]) },
    { id: "bell", emoji: "🔔", name: "골든벨 도전자", desc: "골든벨에서 15문제 정답", test: (g) => g.mode.subject.id === "bell" && g.correct >= 15 },
    { id: "maker", emoji: "✏️", name: "출제 위원", desc: "직접 만든 문제로 게임하기", test: (g) => g.mode.id === "custom" },
    { id: "t100", emoji: "🐨", name: "코알라 친구", desc: "누적 정답 100개", test: () => save.totalCorrect >= 100 },
    { id: "t500", emoji: "🎓", name: "코알라 박사", desc: "누적 정답 500개", test: () => save.totalCorrect >= 500 },
  ];

  function endGame() {
    if (!S || state === "end" || state === "menu") return;
    state = "end";
    cancelAnimationFrame(rafId);
    sfx.over();
    el.timebar.classList.remove("show");
    el.problem.classList.remove("bonus");
    setProblem({ text: "🏁 수고했어요!" });
    const g = { ...S, type: S.type };

    // 저장
    save.games++;
    save.totalCorrect += g.correct;
    if (g.total > 0) save.played[g.mode.id] = (save.played[g.mode.id] || 0) + 1;
    const key = `${g.mode.id}|${g.type}`;
    const prevBest = save.best[key] || 0;
    const isNew = g.type !== "practice" && g.score > prevBest;
    if (g.type !== "practice") save.best[key] = Math.max(prevBest, g.score);
    const earned = g.total > 0 ? STICKERS.filter((s) => !save.stickers[s.id] && s.test(g)) : [];
    earned.forEach((s) => (save.stickers[s.id] = Date.now()));
    persist();

    // 별점
    const acc = g.total ? g.correct / g.total : 0;
    const stars = g.correct === 0 ? 0 : acc >= 0.9 && g.correct >= 15 ? 3 : acc >= 0.75 && g.correct >= 8 ? 2 : 1;
    $("rating").innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? "" : "off"}" style="animation-delay:${i * 0.15}s">⭐</span>`).join("");
    $("endTitle").textContent = isNew && g.score > 0 ? "🎉 최고 기록 달성!" : stars === 3 ? "완벽해요! 👏" : stars === 2 ? "잘했어요! 😊" : g.correct > 0 ? "좋은 시작이에요! 💪" : "다시 도전해 봐요! 🐨";
    $("endMode").textContent = `${g.mode.subject.emoji} ${g.mode.subject.name} · ${g.mode.emoji} ${g.mode.name} · ${GAME_TYPES[g.type]} · Lv.${g.level}`;
    $("rScore").textContent = g.score;
    $("rCorrect").textContent = `${g.correct}/${g.total}`;
    $("rAcc").textContent = Math.round(acc * 100) + "%";
    $("rCombo").textContent = g.maxCombo;
    $("rBest").textContent = g.type === "practice" ? "연습 모드는 기록이 저장되지 않아요." : `이 모드 최고 점수: ${Math.max(prevBest, g.score)}점`;

    $("newStickers").innerHTML = earned.length
      ? `<b>🎊 새 스티커를 받았어요!</b><br/>` + earned.map((s, i) => `<span class="got" style="animation-delay:${0.3 + i * 0.15}s"><span>${s.emoji}</span>${s.name}</span>`).join("")
      : "";

    const review = $("review");
    if (g.wrongLog.length) {
      review.innerHTML = `<h4>📒 오답 노트 <small>(${g.wrongLog.length}문제)</small></h4><ul>` + g.wrongLog.map((w) => {
        const art = w.html ? w.html.replace('class="clock"', "") : "";
        return `<li>${art}<span class="q">${esc(w.text)}</span> → <span class="right">${esc(w.answer)}</span>` +
          (w.chosen !== null ? ` <span class="wrong">${esc(w.chosen)}</span>` : ` <span class="miss">(놓침)</span>`) + "</li>";
      }).join("") + "</ul>";
    } else if (g.total > 0) {
      review.innerHTML = `<p class="perfect">🌟 틀린 문제가 하나도 없어요!</p>`;
    } else review.innerHTML = "";

    showOnly(el.end);
    if (earned.length) setTimeout(() => sfx.bonus(), 400);
  }
  $("retryBtn").onclick = startGame;
  $("homeBtn").onclick = showMenu;

  function buildBook() {
    const got = STICKERS.filter((s) => save.stickers[s.id]).length;
    $("bookCount").textContent = `${got} / ${STICKERS.length}`;
    $("stickerGrid").innerHTML = STICKERS.map((s) => {
      const has = !!save.stickers[s.id];
      return `<div class="sticker ${has ? "" : "locked"}"><span>${s.emoji}</span><b>${has ? s.name : "???"}</b>${s.desc}</div>`;
    }).join("");
    let rows = "";
    for (const s of SUBJECTS) {
      rows += `<tr><td colspan="4" class="subj">${s.emoji} ${s.name}</td></tr>`;
      for (const m of s.modes) {
        rows += `<tr><td>${m.emoji} ${m.name}</td><td>${save.best[`${m.id}|normal`] || "-"}</td><td>${save.best[`${m.id}|time`] || "-"}</td><td>${save.played[m.id] || 0}</td></tr>`;
      }
    }
    $("records").innerHTML = `<p style="margin-bottom:6px">🎮 ${save.games}판 · ✅ 누적 정답 ${save.totalCorrect}개</p>
      <table><thead><tr><th>모드</th><th>❤️ 기본</th><th>⏱ 타임</th><th>플레이</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* =================================================================
   * 문제 만들기 · 공유
   * ================================================================= */
  const toB64 = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const fromB64 = (b64) => { const bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/")); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
  const itemsToText = (items) => items.map((i) => [i.q, i.a, i.w.join(", ")].filter((x, k) => k < 2 || x).join(" | ")).join("\n");

  function openEditor() {
    $("customTitle").value = save.custom.title || "";
    $("customText").value = save.custom.items.length ? itemsToText(save.custom.items) : "";
    $("shareBox").classList.add("hidden");
    previewEditor();
    showOnly(el.editor);
  }
  function previewEditor() {
    const { items, errors } = parseCustom($("customText").value);
    $("editorMsg").textContent = `✅ ${items.length}문제` + (errors.length ? `  ·  ⚠️ ${errors.join(", ")}번째 줄은 '문제 | 정답' 형식이 아니에요` : "");
    return items;
  }
  function saveEditor() {
    const items = previewEditor();
    save.custom = { title: $("customTitle").value.trim().slice(0, 30), items };
    persist();
    return items;
  }
  $("customText").addEventListener("input", previewEditor);
  $("sampleBtn").onclick = () => { if (!$("customText").value.trim() || confirm("예시 문제로 바꿀까요?")) { $("customText").value = SAMPLE_CUSTOM; previewEditor(); } };
  $("saveCustomBtn").onclick = () => {
    const items = saveEditor();
    if (items.length < 2) { $("editorMsg").textContent = "⚠️ 문제를 2개 이상 적어 주세요."; return; }
    subjectId = "custom"; modeId = "custom"; rememberChoice(); buildTabs(); buildModes(); showOnly(el.start);
  };
  $("playCustomBtn").onclick = () => {
    const items = saveEditor();
    if (items.length < 2) { $("editorMsg").textContent = "⚠️ 문제를 2개 이상 적어 주세요."; return; }
    subjectId = "custom"; modeId = "custom"; rememberChoice(); buildTabs(); buildModes(); startGame();
  };
  $("shareCustomBtn").onclick = async () => {
    const items = saveEditor();
    if (items.length < 2) { $("editorMsg").textContent = "⚠️ 문제를 2개 이상 적어야 공유할 수 있어요."; return; }
    const data = toB64(JSON.stringify({ t: save.custom.title, q: items.map((i) => [i.q, i.a, i.w]) }));
    const url = location.href.split("#")[0] + "#quiz=" + data;
    $("shareUrl").value = url;
    $("shareBox").classList.remove("hidden");
    try { await navigator.clipboard.writeText(url); $("shareMsg").textContent = "📋 링크를 복사했어요! 학생들에게 보내 주세요."; }
    catch (e) { $("shareUrl").select(); $("shareMsg").textContent = "아래 링크를 길게 눌러 복사해 주세요."; }
  };
  $("closeEditorBtn").onclick = () => { saveEditor(); buildModes(); showOnly(el.start); };

  // 공유 링크로 들어온 경우 문제 불러오기
  function importFromHash() {
    const m = location.hash.match(/quiz=([\w-]+)/);
    if (!m) return;
    try {
      const obj = JSON.parse(fromB64(m[1]));
      const items = (obj.q || []).filter((x) => Array.isArray(x) && x[0] && x[1] != null)
        .map((x) => ({ q: String(x[0]).slice(0, 200), a: String(x[1]).slice(0, 60), w: (Array.isArray(x[2]) ? x[2] : []).map((w) => String(w).slice(0, 60)).slice(0, 10) }));
      if (items.length >= 2) {
        save.custom = { title: String(obj.t || "").slice(0, 30), items };
        subjectId = "custom"; modeId = "custom"; rememberChoice();
        sharedNotice = `📨 공유받은 퀴즈 "${save.custom.title || "내가 만든 퀴즈"}" (${items.length}문제)를 불러왔어요!`;
      }
    } catch (e) { /* 잘못된 링크 무시 */ }
    history.replaceState(null, "", location.href.split("#")[0]);
  }
  let sharedNotice = "";

  /* =================================================================
   * 입력
   * ================================================================= */
  const LEFT = ["ArrowLeft", "a", "A", "ㅁ"], RIGHT = ["ArrowRight", "d", "D", "ㅇ"];
  const typing = (e) => /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  window.addEventListener("keydown", (e) => {
    if (typing(e)) return;
    if (LEFT.includes(e.key)) { keys.left = true; pointerX = null; }
    if (RIGHT.includes(e.key)) { keys.right = true; pointerX = null; }
    if (["Escape", "p", "P", "ㅔ"].includes(e.key)) { state === "play" ? pauseGame() : state === "pause" && resumeGame(); }
    if (e.key === "Enter" && (state === "menu" && !el.start.classList.contains("hidden") || state === "end")) { e.preventDefault(); startGame(); }
    if (e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    if (LEFT.includes(e.key)) keys.left = false;
    if (RIGHT.includes(e.key)) keys.right = false;
  });
  const setPointer = (e) => { const r = canvas.getBoundingClientRect(); pointerX = e.clientX - r.left; };
  canvas.addEventListener("pointerdown", (e) => { setPointer(e); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" || e.buttons) setPointer(e); });
  canvas.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") pointerX = null; });
  canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") pointerX = null; });
  $("startBtn").onclick = startGame;

  // 테스트/디버그용 (브라우저 콘솔에서 사용 가능)
  window.__koala = { get state() { return state; }, get S() { return S; }, startGame, endGame };

  importFromHash();
  resize();
  showMenu();
  if (sharedNotice) $("bestLine").textContent = sharedNotice;
})();
