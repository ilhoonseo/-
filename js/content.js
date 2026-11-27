/* =====================================================================
 * 코알라 퀴즈 캐치 - 문제 데이터
 * ---------------------------------------------------------------------
 * 선생님이 문제를 쉽게 추가·수정할 수 있도록 게임 엔진(game.js)과 분리했습니다.
 *
 * 각 모드의 gen(lv) 함수는 문제 하나를 만들어 돌려줍니다.
 *   { text: "화면에 보일 문제",
 *     answer: 정답(숫자 또는 글자),
 *     wrongs: [오답 후보들]   // 생략하면 숫자 정답 주변 수로 자동 생성
 *     html:  "그림이 필요할 때(예: 시계) 문제 칸에 넣을 HTML" }  // 선택
 * lv 는 현재 레벨(1부터)이며, 레벨이 오를수록 어렵게 만들 수 있습니다.
 *
 * 아래 BANK(문제 은행) 배열에 줄을 추가하기만 해도 새 문제가 나옵니다.
 * ===================================================================== */
(function () {
  "use strict";

  // ---------- 도우미 ----------
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(0, i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // 정답과 다른 값만 골라 오답 후보로 돌려줍니다.
  const others = (pool, answer, extraFilter) =>
    [...new Set(pool)].filter((v) => String(v) !== String(answer) && (!extraFilter || extraFilter(v)));

  // 한글 초성 뽑기 (예: "코끼리" → "ㅋㄲㄹ")
  const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
  const initials = (word) =>
    [...word].map((ch) => {
      const c = ch.charCodeAt(0) - 0xac00;
      return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
    }).join("");

  // 문제 은행에서 하나 고르기 (q: 문제, a: 정답, w: 오답)
  const fromBank = (bank) => {
    const item = pick(bank);
    return { text: item.q, answer: item.a, wrongs: item.w };
  };

  /* =================================================================
   * 수학
   * ================================================================= */
  const rangeByLv = (lv) => (lv <= 2 ? 10 : lv <= 4 ? 20 : lv <= 6 ? 50 : 100);

  function add(lv) {
    const max = rangeByLv(lv);
    const a = rand(1, max - 1), b = rand(1, Math.max(1, max - a));
    return { text: `${a} + ${b} = ?`, answer: a + b };
  }
  function sub(lv) {
    const max = rangeByLv(lv);
    const a = rand(2, max), b = rand(1, a - 1);
    return { text: `${a} − ${b} = ?`, answer: a - b };
  }
  function mul(lv) {
    const dans = lv <= 2 ? [2, 5] : lv <= 4 ? [2, 3, 4, 5] : lv <= 6 ? [2, 3, 4, 5, 6, 7] : [2, 3, 4, 5, 6, 7, 8, 9];
    const a = pick(dans), b = rand(1, 9);
    // 곱셈구구 오답: 이웃 단·이웃 수 (자주 하는 실수)
    const wrongs = others([a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b, a * b + 1, a * b - 1], a * b, (v) => v > 0);
    return { text: `${a} × ${b} = ?`, answer: a * b, wrongs, fill: true };
  }
  function div(lv) {
    const maxDiv = lv <= 2 ? 5 : lv <= 4 ? 7 : 9;
    const b = rand(2, maxDiv), q = rand(1, 9);
    return { text: `${b * q} ÷ ${b} = ?`, answer: q };
  }
  function blank(lv) {
    const t = pick(lv <= 3 ? ["add", "sub"] : ["add", "sub", "mul", "div"]);
    if (t === "mul") { const a = rand(2, 9), b = rand(1, 9); return { text: `${a} × □ = ${a * b}`, answer: b }; }
    if (t === "div") { const a = rand(2, 9), b = rand(1, 9); return { text: `${a * b} ÷ □ = ${b}`, answer: a }; }
    const max = lv <= 2 ? 10 : lv <= 5 ? 20 : 50;
    if (t === "add") {
      const a = rand(1, max - 1), b = rand(1, Math.max(1, max - a));
      return Math.random() < 0.5 ? { text: `${a} + □ = ${a + b}`, answer: b } : { text: `□ + ${b} = ${a + b}`, answer: a };
    }
    const a = rand(2, max), b = rand(1, a - 1);
    return Math.random() < 0.5 ? { text: `${a} − □ = ${a - b}`, answer: b } : { text: `□ − ${b} = ${a - b}`, answer: a };
  }
  function mixed(lv) {
    if (lv >= 5 && Math.random() < 0.3) {
      // 두 단계 계산 (곱셈 먼저!)
      const a = rand(1, 20), b = rand(2, 9), c = rand(2, 9);
      return Math.random() < 0.5
        ? { text: `${a} + ${b} × ${c} = ?`, answer: a + b * c, wrongs: [(a + b) * c, a + b + c], fill: true }
        : { text: `${b} × ${c} − ${Math.min(a, b * c)} = ?`, answer: b * c - Math.min(a, b * c) };
    }
    return pick([add, sub, mul, div])(lv);
  }

  // 시계 보기 ---------------------------------------------------------
  function clockSVG(h, m) {
    const hourAng = ((h % 12) + m / 60) * 30, minAng = m * 6;
    let nums = "", ticks = "";
    for (let i = 1; i <= 12; i++) {
      const a = (i * 30 - 90) * Math.PI / 180;
      nums += `<text x="${50 + Math.cos(a) * 34}" y="${50 + Math.sin(a) * 34}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="700" fill="#33691e">${i}</text>`;
    }
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 - 90) * Math.PI / 180, r1 = i % 5 ? 44 : 41;
      ticks += `<line x1="${50 + Math.cos(a) * r1}" y1="${50 + Math.sin(a) * r1}" x2="${50 + Math.cos(a) * 46}" y2="${50 + Math.sin(a) * 46}" stroke="#8d6e63" stroke-width="${i % 5 ? 0.8 : 2}"/>`;
    }
    return `<svg class="clock" viewBox="0 0 100 100" aria-label="시계">
      <circle cx="50" cy="50" r="48" fill="#fff" stroke="#6d4c41" stroke-width="3"/>${ticks}${nums}
      <line x1="50" y1="50" x2="50" y2="27" stroke="#263238" stroke-width="4.5" stroke-linecap="round" transform="rotate(${hourAng} 50 50)"/>
      <line x1="50" y1="50" x2="50" y2="13" stroke="#e65100" stroke-width="2.5" stroke-linecap="round" transform="rotate(${minAng} 50 50)"/>
      <circle cx="50" cy="50" r="3.5" fill="#263238"/></svg>`;
  }
  const fmtTime = (h, m) => (m === 0 ? `${h}시` : `${h}시 ${m}분`);
  const wrapH = (h) => ((h - 1 + 12) % 12) + 1;
  function clock(lv) {
    const h = rand(1, 12);
    const m = lv <= 2 ? pick([0, 30]) : lv <= 4 ? rand(0, 11) * 5 : rand(0, 59);
    const wrongs = [fmtTime(wrapH(h + 1), m), fmtTime(wrapH(h - 1), m)];
    if (m % 5 === 0 && m !== 0) wrongs.push(fmtTime(m / 5, (h % 12) * 5)); // 긴바늘·짧은바늘 헷갈림
    wrongs.push(fmtTime(h, (m + 30) % 60), fmtTime(h, (m + 5) % 60), fmtTime(h, (m + 55) % 60));
    return { text: "시계가 가리키는 시각은?", html: clockSVG(h, m), answer: fmtTime(h, m), wrongs: others(wrongs, fmtTime(h, m)) };
  }

  // 단위 바꾸기 -------------------------------------------------------
  const UNITS = [
    ["cm", "mm", 10], ["m", "cm", 100], ["km", "m", 1000], ["kg", "g", 1000], ["L", "mL", 1000],
    ["분", "초", 60], ["시간", "분", 60], ["일", "시간", 24], ["주일", "일", 7], ["년", "개월", 12],
  ];
  function unit(lv) {
    const [u1, u2, f] = pick(lv <= 2 ? UNITS.slice(0, 5) : UNITS);
    const a = lv <= 1 ? 1 : rand(1, lv <= 4 ? 5 : 9);
    const ans = a * f;
    const wrongs = [ans * 10, ans / 10, ans + f, ans - f, a * 10, a * 100, a * 1000].filter((v) => Number.isInteger(v) && v > 0);
    return { text: `${a}${u1} = ?${u2}`, answer: ans, wrongs: others(wrongs, ans), fill: true };
  }

  // 분수 -------------------------------------------------------------
  function fraction(lv) {
    const t = pick(lv <= 2 ? ["part", "unit"] : ["part", "unit", "of"]);
    if (t === "part") {
      const d = rand(3, 10), n = rand(1, d - 1);
      const food = pick(["🍕 피자를", "🍰 케이크를", "🍫 초콜릿을", "🍉 수박을"]);
      return {
        text: `${food} ${d}조각으로 똑같이 나눠 ${n}조각 먹으면?`,
        answer: `${n}/${d}`,
        wrongs: others([`${d}/${n}`, `${d - n}/${d}`, `${n}/${d + 1}`, `${n + 1}/${d}`, `${n}/${d - 1}`], `${n}/${d}`, (v) => !v.endsWith("/0") && !v.startsWith("0/")),
      };
    }
    if (t === "unit") {
      const ds = shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 4);
      const big = Math.random() < 0.6;
      const target = big ? Math.min(...ds) : Math.max(...ds);
      return { text: big ? "가장 큰 분수는?" : "가장 작은 분수는?", answer: `1/${target}`, wrongs: ds.filter((d) => d !== target).map((d) => `1/${d}`) };
    }
    const d = rand(2, 5), k = rand(2, 6), n = rand(1, d - 1);
    return { text: `${d * k}의 ${n}/${d} 은(는)?`, answer: k * n, wrongs: others([k, d * k - k * n, k * (n + 1), d * n], k * n, (v) => v > 0), fill: true };
  }

  // 도형 -------------------------------------------------------------
  const SHAPES = [["삼각형", 3], ["사각형", 4], ["오각형", 5], ["육각형", 6], ["팔각형", 8]];
  function shape(lv) {
    const [name, n] = pick(SHAPES);
    const t = rand(0, lv <= 2 ? 1 : 3);
    if (t === 0) return { text: `꼭짓점이 ${n}개인 도형은?`, answer: name, wrongs: others(SHAPES.map((s) => s[0]).concat("원"), name) };
    if (t === 1) return { text: `${name}의 변은 몇 개?`, answer: n };
    if (t === 2) { const k = rand(2, 4); return { text: `${name} ${k}개의 꼭짓점은 모두 몇 개?`, answer: n * k }; }
    return pick([
      { text: "원의 꼭짓점은 몇 개?", answer: 0, wrongs: [1, 2, 4] },
      { text: "정사각형은 네 변의 길이가 모두?", answer: "같다", wrongs: ["다르다", "두 개만 같다", "알 수 없다"] },
      { text: "직각이 4개인 도형은?", answer: "직사각형", wrongs: ["삼각형", "원", "오각형"] },
      { text: "굴리면 잘 굴러가는 모양은?", answer: "⚽ 공 모양", wrongs: ["📦 상자 모양", "🔺 뿔 모양", "📚 책 모양"] },
    ]);
  }

  // 규칙 찾기 ---------------------------------------------------------
  function pattern(lv) {
    let seq, ans;
    if (lv >= 5 && Math.random() < 0.3) {
      const s = rand(1, 3); seq = [s, s * 2, s * 4, s * 8]; ans = s * 16; // 2배씩
    } else {
      const step = lv <= 2 ? rand(1, 2) : lv <= 4 ? rand(2, 5) : rand(3, 10);
      const down = lv >= 3 && Math.random() < 0.4;
      const start = down ? rand(step * 5, step * 5 + 30) : rand(0, 20);
      seq = [0, 1, 2, 3].map((i) => start + (down ? -1 : 1) * step * i);
      ans = start + (down ? -1 : 1) * step * 4;
      if (Math.random() < 0.35) {
        // 가운데 빈칸
        const idx = rand(1, 2), hid = seq[idx];
        const shown = seq.map((v, i) => (i === idx ? "?" : v));
        return { text: `${shown.join(", ")}, ${ans}`, answer: hid };
      }
    }
    return { text: `${seq.join(", ")}, ?`, answer: ans };
  }

  // 수 감각 -----------------------------------------------------------
  function numSense(lv) {
    const t = rand(0, 4);
    if (t === 0) {
      const even = Math.random() < 0.5, max = lv <= 3 ? 20 : 100;
      const mk = (wantEven) => { let v; do { v = rand(1, max); } while ((v % 2 === 0) !== wantEven); return v; };
      const ws = new Set(); while (ws.size < 5) ws.add(mk(!even));
      return { text: even ? "짝수를 찾아요!" : "홀수를 찾아요!", answer: mk(even), wrongs: [...ws] };
    }
    if (t === 1) {
      const big = lv >= 4;
      const h = big ? rand(1, 9) : 0, te = rand(1, 9), o = rand(0, 9);
      const text = big ? `100이 ${h}개, 10이 ${te}개, 1이 ${o}개인 수는?` : `10이 ${te}개, 1이 ${o}개인 수는?`;
      const ans = h * 100 + te * 10 + o;
      const wrongs = big ? [h * 100 + o * 10 + te, te * 100 + h * 10 + o, h * 100 + te + o, ans + 10] : [o * 10 + te, te + o, ans + 10, ans - 1];
      return { text, answer: ans, wrongs: others(wrongs, ans, (v) => v >= 0), fill: true };
    }
    if (t === 2 || t === 3) {
      const max = lv <= 2 ? 50 : lv <= 5 ? 500 : 9999;
      const set = new Set(); while (set.size < 4) set.add(rand(10, max));
      const arr = [...set], big = t === 2;
      const ans = big ? Math.max(...arr) : Math.min(...arr);
      return { text: big ? "가장 큰 수는?" : "가장 작은 수는?", answer: ans, wrongs: arr.filter((v) => v !== ans) };
    }
    // 자릿값
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, lv <= 3 ? 3 : 4);
    const num = Number(digits.join(""));
    const names = digits.length === 3 ? ["백", "십", "일"] : ["천", "백", "십", "일"];
    const i = rand(0, digits.length - 1);
    if (Math.random() < 0.5) {
      return { text: `${num}에서 ${names[i]}의 자리 숫자는?`, answer: digits[i], wrongs: digits.filter((_, k) => k !== i) };
    }
    return { text: `${num}에서 숫자 ${digits[i]}은(는) 어느 자리?`, answer: `${names[i]}의 자리`, wrongs: names.filter((_, k) => k !== i).map((n) => `${n}의 자리`) };
  }

  /* =================================================================
   * 국어
   * ================================================================= */
  // [바른 말, 틀린 말]
  const SPELLING = [
    ["설거지", "설겆이"], ["깨끗이", "깨끗히"], ["며칠", "몇일"], ["어떡해", "어떻해"], ["금세", "금새"],
    ["베개", "배개"], ["찌개", "찌게"], ["오랜만", "오랫만"], ["할게", "할께"], ["돌멩이", "돌맹이"],
    ["곰곰이", "곰곰히"], ["떡볶이", "떡볶기"], ["육개장", "육계장"], ["왠지", "웬지"], ["웬일", "왠일"],
    ["일찍이", "일찌기"], ["희한하다", "희안하다"], ["아무튼", "아뭏든"], ["되어", "돼어"], ["안 돼", "안 되"],
    ["숟가락", "숫가락"], ["젓가락", "젇가락"], ["얼음", "어름"], ["눈곱", "눈꼽"], ["개구쟁이", "개구장이"],
    ["트림", "트름"], ["뒤꿈치", "뒷꿈치"], ["무릎", "무릅"], ["알맞은", "알맞는"], ["깎다", "깍다"],
  ];
  function spelling() {
    const [right, wrong] = pick(SPELLING);
    const otherWrongs = shuffle(SPELLING.filter((p) => p[0] !== right).map((p) => p[1]));
    return { text: "바르게 쓴 낱말을 먹어요!", answer: right, wrongs: [wrong, ...otherWrongs], keepFirstWrong: true };
  }

  const ANTONYM = [
    ["크다", "작다"], ["길다", "짧다"], ["높다", "낮다"], ["덥다", "춥다"], ["빠르다", "느리다"],
    ["무겁다", "가볍다"], ["넓다", "좁다"], ["밝다", "어둡다"], ["많다", "적다"], ["깊다", "얕다"],
    ["두껍다", "얇다"], ["기쁘다", "슬프다"], ["쉽다", "어렵다"], ["열다", "닫다"], ["입다", "벗다"],
    ["사다", "팔다"], ["이기다", "지다"], ["주다", "받다"], ["앉다", "서다"], ["낮", "밤"],
    ["위", "아래"], ["앞", "뒤"], ["안", "밖"], ["오른쪽", "왼쪽"], ["시작", "끝"], ["더하다", "빼다"],
  ];
  function antonym() {
    const pair = pick(ANTONYM), flip = Math.random() < 0.5;
    const q = flip ? pair[1] : pair[0], a = flip ? pair[0] : pair[1];
    const pool = ANTONYM.flat().filter((w) => w !== q && w !== a);
    return { text: `'${q}'의 반대말은?`, answer: a, wrongs: shuffle(pool) };
  }

  const HONORIFIC = [
    ["밥", "진지"], ["집", "댁"], ["나이", "연세"], ["이름", "성함"], ["말", "말씀"], ["생일", "생신"],
    ["자다", "주무시다"], ["있다", "계시다"], ["주다", "드리다"], ["묻다", "여쭙다"], ["데리다", "모시다"],
    ["먹다", "드시다"], ["아프다", "편찮으시다"], ["죽다", "돌아가시다"],
  ];
  function honorific() {
    const [plain, hon] = pick(HONORIFIC);
    return { text: `'${plain}'의 높임말은?`, answer: hon, wrongs: shuffle(HONORIFIC.filter((p) => p[1] !== hon).map((p) => p[1])) };
  }

  const PROVERB = [
    { q: "가는 말이 고와야 오는 말이 ___", a: "곱다" },
    { q: "원숭이도 나무에서 ___", a: "떨어진다" },
    { q: "낮말은 새가 듣고 밤말은 ___가 듣는다", a: "쥐" },
    { q: "소 잃고 ___ 고친다", a: "외양간" },
    { q: "티끌 모아 ___", a: "태산" },
    { q: "세 살 버릇 ___까지 간다", a: "여든" },
    { q: "백지장도 맞들면 ___", a: "낫다" },
    { q: "콩 심은 데 콩 나고 ___ 심은 데 ___ 난다", a: "팥" },
    { q: "등잔 밑이 ___", a: "어둡다" },
    { q: "발 없는 말이 ___ 간다", a: "천 리" },
    { q: "우물 안 ___", a: "개구리" },
    { q: "꿩 대신 ___", a: "닭" },
    { q: "고래 싸움에 ___ 등 터진다", a: "새우" },
    { q: "누워서 ___ 먹기", a: "떡" },
    { q: "꿩 먹고 ___ 먹는다", a: "알" },
    { q: "하늘이 무너져도 솟아날 ___이 있다", a: "구멍" },
    { q: "도토리 ___ 재기", a: "키" },
    { q: "열 번 찍어 안 넘어가는 ___ 없다", a: "나무" },
    { q: "호랑이도 제 말 하면 ___", a: "온다" },
    { q: "개구리 ___ 적 생각 못 한다", a: "올챙이" },
    { q: "급할수록 ___ 가라", a: "돌아" },
    { q: "작은 고추가 ___", a: "맵다" },
  ];
  function proverb() {
    const p = pick(PROVERB);
    return { text: p.q, answer: p.a, wrongs: shuffle(PROVERB.map((x) => x.a)) };
  }

  const WORDS = {
    동물: ["고양이", "강아지", "토끼", "호랑이", "코끼리", "기린", "사자", "원숭이", "다람쥐", "거북이", "펭귄", "코알라", "하마", "오리", "돼지", "여우"],
    과일: ["사과", "포도", "바나나", "딸기", "수박", "복숭아", "참외", "귤", "자두", "레몬", "키위", "망고", "체리"],
    탈것: ["자동차", "비행기", "기차", "자전거", "버스", "택시", "지하철", "오토바이", "트럭", "로켓", "배", "헬리콥터"],
    학용품: ["연필", "지우개", "공책", "가위", "풀", "크레파스", "색종이", "필통", "가방", "자", "물감"],
    채소: ["당근", "오이", "감자", "고구마", "양파", "배추", "호박", "토마토", "시금치", "옥수수"],
  };
  function chosung() {
    const cat = pick(Object.keys(WORDS)), word = pick(WORDS[cat]), ini = initials(word);
    const wrongs = shuffle(WORDS[cat].filter((w) => w !== word && initials(w) !== ini));
    return { text: `초성 퀴즈: ${ini} (${cat})`, answer: word, wrongs };
  }

  /* =================================================================
   * 영어
   * ================================================================= */
  const EN = [
    ["apple", "사과", "🍎"], ["banana", "바나나", "🍌"], ["grape", "포도", "🍇"], ["orange", "오렌지", "🍊"],
    ["cat", "고양이", "🐱"], ["dog", "개", "🐶"], ["rabbit", "토끼", "🐰"], ["tiger", "호랑이", "🐯"],
    ["lion", "사자", "🦁"], ["bear", "곰", "🐻"], ["bird", "새", "🐦"], ["fish", "물고기", "🐟"],
    ["pig", "돼지", "🐷"], ["cow", "소", "🐮"], ["horse", "말", "🐴"], ["duck", "오리", "🦆"],
    ["monkey", "원숭이", "🐵"], ["car", "자동차", "🚗"], ["bus", "버스", "🚌"], ["book", "책", "📖"],
    ["pencil", "연필", "✏️"], ["bag", "가방", "🎒"], ["chair", "의자", "🪑"], ["milk", "우유", "🥛"],
    ["egg", "달걀", "🥚"], ["water", "물", "💧"], ["sun", "해", "☀️"], ["moon", "달", "🌙"],
    ["star", "별", "⭐"], ["tree", "나무", "🌳"], ["flower", "꽃", "🌸"], ["house", "집", "🏠"],
    ["ball", "공", "⚽"], ["hat", "모자", "👒"], ["snow", "눈", "❄️"], ["rain", "비", "🌧️"],
    ["red", "빨간색", "🔴"], ["blue", "파란색", "🔵"], ["green", "초록색", "🟢"], ["yellow", "노란색", "🟡"],
    ["hand", "손", "✋"], ["eye", "눈(얼굴)", "👁️"], ["nose", "코", "👃"], ["ear", "귀", "👂"],
  ];
  function enToKo() {
    const [en, ko, emo] = pick(EN);
    return { text: `${en} 의 뜻은?`, answer: ko, wrongs: shuffle(EN.filter((w) => w[0] !== en).map((w) => w[1])), reveal: emo };
  }
  function koToEn() {
    const [en, ko, emo] = pick(EN);
    return { text: `${emo} ${ko.replace("(얼굴)", "")} → 영어로?`, answer: en, wrongs: shuffle(EN.filter((w) => w[0] !== en).map((w) => w[0])) };
  }

  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const CONFUSE = { b: "dpq", d: "bpq", p: "qbd", q: "pdg", m: "nwh", n: "mhu", u: "nvw", w: "mvu", i: "jlt", j: "igy", l: "ijt", g: "qjy", h: "nkb", f: "ftk", v: "uwy", y: "vgj", a: "eod", e: "aco", c: "eoa", o: "ace" };
  function alphabet() {
    const L = pick([...ALPHA]), l = L.toLowerCase();
    const near = (CONFUSE[l] || "").split("").filter((c) => c !== l);
    const rest = shuffle([...ALPHA.toLowerCase()].filter((c) => c !== l && !near.includes(c)));
    if (Math.random() < 0.6) return { text: `대문자 ${L} → 소문자는?`, answer: l, wrongs: [...shuffle(near), ...rest], keepFirstWrong: true };
    return { text: `소문자 ${l} → 대문자는?`, answer: L, wrongs: [...shuffle(near), ...rest].map((c) => c.toUpperCase()), keepFirstWrong: true };
  }

  const NUM_EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  function enNumber(lv) {
    const n = rand(1, lv <= 3 ? 10 : 20);
    const near = [n - 1, n + 1, n - 2, n + 2, n + 10, n - 10].filter((v) => v >= 0 && v <= 20 && v !== n);
    if (Math.random() < 0.5) return { text: `${n} → 영어로?`, answer: NUM_EN[n], wrongs: shuffle(near).map((v) => NUM_EN[v]) };
    return { text: `${NUM_EN[n]} → 숫자로?`, answer: n, wrongs: shuffle(near) };
  }

  const EN_SENT = [
    { q: "How are you? → I'm ___.", a: "fine", w: ["seven", "apple", "dog"] },
    { q: "What's your name? → My ___ is Mina.", a: "name", w: ["cat", "red", "book"] },
    { q: "How old are you? → I'm ten years ___.", a: "old", w: ["new", "big", "red"] },
    { q: "Good ___! (아침 인사)", a: "morning", w: ["night", "bye", "sorry"] },
    { q: "Thank you! → You're ___.", a: "welcome", w: ["hello", "sorry", "fine"] },
    { q: "I'm sorry. → That's ___.", a: "okay", w: ["apple", "green", "tall"] },
    { q: "What color is it? → It's ___. 🍌", a: "yellow", w: ["blue", "green", "black"] },
    { q: "Can you swim? → Yes, I ___.", a: "can", w: ["am", "is", "do"] },
    { q: "I like ___. 🍎", a: "apples", w: ["dogs", "buses", "pencils"] },
    { q: "Nice to ___ you.", a: "meet", w: ["eat", "sit", "go"] },
    { q: "Let's ___ soccer! ⚽", a: "play", w: ["eat", "sleep", "read"] },
    { q: "It's ___ today. ☀️", a: "sunny", w: ["rainy", "snowy", "cloudy"] },
  ];
  const enSentence = () => fromBank(EN_SENT);

  /* =================================================================
   * 상식 (사회 · 과학)
   * ================================================================= */
  const CAPITALS = [
    ["대한민국", "🇰🇷", "서울"], ["일본", "🇯🇵", "도쿄"], ["중국", "🇨🇳", "베이징"], ["미국", "🇺🇸", "워싱턴 D.C."],
    ["영국", "🇬🇧", "런던"], ["프랑스", "🇫🇷", "파리"], ["독일", "🇩🇪", "베를린"], ["이탈리아", "🇮🇹", "로마"],
    ["러시아", "🇷🇺", "모스크바"], ["캐나다", "🇨🇦", "오타와"], ["호주", "🇦🇺", "캔버라"], ["이집트", "🇪🇬", "카이로"],
    ["태국", "🇹🇭", "방콕"], ["베트남", "🇻🇳", "하노이"], ["스페인", "🇪🇸", "마드리드"], ["브라질", "🇧🇷", "브라질리아"],
    ["인도", "🇮🇳", "뉴델리"], ["몽골", "🇲🇳", "울란바토르"], ["튀르키예", "🇹🇷", "앙카라"], ["필리핀", "🇵🇭", "마닐라"],
  ];
  function capital() {
    const [c, flag, cap] = pick(CAPITALS);
    if (Math.random() < 0.75) return { text: `${flag} ${c}의 수도는?`, answer: cap, wrongs: shuffle(CAPITALS.filter((x) => x[2] !== cap).map((x) => x[2])) };
    return { text: `${cap}은(는) 어느 나라의 수도?`, answer: `${flag} ${c}`, wrongs: shuffle(CAPITALS.filter((x) => x[0] !== c).map((x) => `${x[1]} ${x[0]}`)) };
  }

  const INSECT = ["개미", "나비", "벌", "메뚜기", "잠자리", "무당벌레", "매미", "사슴벌레", "장수풍뎅이", "모기", "귀뚜라미", "반딧불이"];
  const NOT_INSECT = ["거미", "지렁이", "달팽이", "지네", "개구리", "참새", "공벌레", "전갈", "가재", "도마뱀"];
  function insect() {
    if (Math.random() < 0.6) return { text: "곤충을 찾아요! (다리 6개)", answer: pick(INSECT), wrongs: shuffle(NOT_INSECT) };
    return { text: "곤충이 아닌 것은?", answer: pick(NOT_INSECT), wrongs: shuffle(INSECT) };
  }

  const SCIENCE = [
    { q: "물이 얼면 무엇이 될까요?", a: "얼음", w: ["수증기", "구름", "모래"] },
    { q: "물이 끓을 때 생기는 것은?", a: "수증기", w: ["얼음", "모래", "흙"] },
    { q: "자석에 붙는 물건은?", a: "철 클립", w: ["지우개", "종이", "유리컵", "나무젓가락"] },
    { q: "태양에서 가장 가까운 행성은?", a: "수성", w: ["금성", "지구", "화성"] },
    { q: "태양계에서 가장 큰 행성은?", a: "목성", w: ["토성", "지구", "화성"] },
    { q: "우리가 살고 있는 행성은?", a: "지구", w: ["화성", "달", "금성"] },
    { q: "스스로 빛을 내는 것은?", a: "태양", w: ["달", "지구", "화성"] },
    { q: "다리가 8개인 동물은?", a: "거미", w: ["개미", "나비", "벌"] },
    { q: "올챙이가 자라면?", a: "개구리", w: ["물고기", "잠자리", "거북"] },
    { q: "배추흰나비 애벌레가 자라면?", a: "나비", w: ["벌", "잠자리", "매미"] },
    { q: "온몸으로 피를 보내는 기관은?", a: "심장", w: ["위", "폐", "뇌"] },
    { q: "숨을 쉬는 기관은?", a: "폐", w: ["심장", "위", "간"] },
    { q: "음식을 소화시키는 기관은?", a: "위", w: ["폐", "뼈", "귀"] },
    { q: "식물이 햇빛으로 양분을 만드는 곳은?", a: "잎", w: ["뿌리", "꽃", "열매"] },
    { q: "식물이 물을 빨아들이는 곳은?", a: "뿌리", w: ["잎", "꽃", "열매"] },
    { q: "소리는 무엇이 떨려서 날까요?", a: "물체", w: ["빛", "그림자", "색깔"] },
    { q: "그림자는 빛의 ___ 쪽에 생겨요", a: "반대", w: ["같은", "위", "안"] },
    { q: "달이 둥글게 꽉 찬 모양은?", a: "보름달", w: ["초승달", "반달", "그믐달"] },
    { q: "겨울잠을 자는 동물은?", a: "곰", w: ["참새", "강아지", "닭"] },
    { q: "알을 낳는 동물은?", a: "닭", w: ["고양이", "강아지", "소"] },
  ];
  const science = () => fromBank(SCIENCE);

  const KOREA = [
    { q: "한글을 만든 왕은?", a: "세종대왕", w: ["태조", "정조", "광개토대왕"] },
    { q: "거북선을 만들어 나라를 지킨 장군은?", a: "이순신", w: ["강감찬", "을지문덕", "김유신"] },
    { q: "우리나라의 나라꽃은?", a: "무궁화", w: ["장미", "개나리", "진달래"] },
    { q: "우리나라의 국기는?", a: "태극기", w: ["성조기", "일장기", "오륜기"] },
    { q: "우리나라의 수도는?", a: "서울", w: ["부산", "대전", "광주"] },
    { q: "독도가 있는 바다는?", a: "동해", w: ["서해", "남해", "북해"] },
    { q: "우리나라에서 가장 큰 섬은?", a: "제주도", w: ["거제도", "울릉도", "강화도"] },
    { q: "남한에서 가장 높은 산은?", a: "한라산", w: ["지리산", "설악산", "북한산"] },
    { q: "만 원짜리 지폐 속 인물은?", a: "세종대왕", w: ["이황", "이이", "신사임당"] },
    { q: "오만 원짜리 지폐 속 인물은?", a: "신사임당", w: ["세종대왕", "이황", "이순신"] },
    { q: "천 원짜리 지폐 속 인물은?", a: "이황", w: ["이이", "세종대왕", "신사임당"] },
    { q: "백 원짜리 동전 속 인물은?", a: "이순신", w: ["세종대왕", "이황", "이이"] },
    { q: "우리나라 고유의 글자 이름은?", a: "한글", w: ["한자", "알파벳", "가나"] },
    { q: "설날에 먹는 대표 음식은?", a: "떡국", w: ["송편", "팥죽", "오곡밥"] },
    { q: "추석에 빚어 먹는 떡은?", a: "송편", w: ["떡국", "가래떡", "시루떡"] },
    { q: "동지에 먹는 음식은?", a: "팥죽", w: ["떡국", "송편", "냉면"] },
    { q: "우리나라 전통 옷은?", a: "한복", w: ["기모노", "치파오", "양복"] },
    { q: "우리나라 국가(나라 노래)는?", a: "애국가", w: ["아리랑", "고향의 봄", "산토끼"] },
    { q: "3월 1일은 무슨 날?", a: "삼일절", w: ["광복절", "개천절", "한글날"] },
    { q: "10월 9일은 무슨 날?", a: "한글날", w: ["개천절", "광복절", "제헌절"] },
    { q: "8월 15일은 무슨 날?", a: "광복절", w: ["삼일절", "한글날", "현충일"] },
  ];
  const korea = () => fromBank(KOREA);

  const SAFETY = [
    { q: "🚦 초록불이 켜지면?", a: "좌우를 보고 건너요", w: ["바로 뛰어가요", "휴대폰 보며 건너요", "기다려요"] },
    { q: "🔥 불이 나면 몇 번에 신고?", a: "119", w: ["112", "114", "120"] },
    { q: "🚓 위험한 일, 경찰은 몇 번?", a: "112", w: ["119", "114", "100"] },
    { q: "🔥 불이 나서 연기가 나면?", a: "자세를 낮추고 대피", w: ["엘리베이터 타기", "숨기", "창문 닫고 자기"] },
    { q: "🌏 지진이 나면 먼저?", a: "책상 밑에 숨기", w: ["엘리베이터 타기", "창가에 서기", "뛰어다니기"] },
    { q: "🚌 버스에서 내릴 때는?", a: "완전히 멈추면 내려요", w: ["달릴 때 내려요", "뛰어내려요", "창문으로 내려요"] },
    { q: "🤧 기침이 나오면?", a: "옷소매로 가려요", w: ["손바닥에 해요", "친구 쪽으로 해요", "그냥 해요"] },
    { q: "🧼 손은 비누로 몇 초 이상 씻을까요?", a: "30초", w: ["1초", "3초", "5초"] },
    { q: "🚲 자전거를 탈 때 꼭 써요", a: "헬멧", w: ["선글라스", "모자", "이어폰"] },
    { q: "🍬 모르는 사람이 따라오라면?", a: "싫어요! 하고 거절", w: ["따라간다", "사탕을 받는다", "비밀로 한다"] },
  ];
  const safety = () => fromBank(SAFETY);

  /* =================================================================
   * 과목 · 모드 목록 (메뉴에 이 순서대로 표시됩니다)
   * ================================================================= */
  window.KOALA_CONTENT = {
    initials,
    subjects: [
      {
        id: "math", name: "수학", emoji: "🔢", color: "#43a047",
        modes: [
          { id: "add", name: "덧셈", emoji: "➕", grade: "1~2학년", gen: add },
          { id: "sub", name: "뺄셈", emoji: "➖", grade: "1~2학년", gen: sub },
          { id: "mul", name: "곱셈구구", emoji: "✖️", grade: "2학년", gen: mul },
          { id: "div", name: "나눗셈", emoji: "➗", grade: "3학년", gen: div },
          { id: "blank", name: "빈칸 채우기", emoji: "❓", grade: "□ 구하기", gen: blank },
          { id: "mix", name: "섞어서 계산", emoji: "🎲", grade: "혼합 계산", gen: mixed },
          { id: "clock", name: "시계 보기", emoji: "🕒", grade: "1~2학년", gen: clock },
          { id: "unit", name: "단위 바꾸기", emoji: "📏", grade: "2~3학년", gen: unit },
          { id: "frac", name: "분수", emoji: "🍕", grade: "3학년", gen: fraction },
          { id: "shape", name: "도형", emoji: "🔺", grade: "1~3학년", gen: shape },
          { id: "pattern", name: "규칙 찾기", emoji: "🔁", grade: "1~4학년", gen: pattern },
          { id: "numsense", name: "수 감각", emoji: "🧮", grade: "짝·홀, 자릿값", gen: numSense },
        ],
      },
      {
        id: "korean", name: "국어", emoji: "📖", color: "#ef6c00",
        modes: [
          { id: "spell", name: "맞춤법", emoji: "✍️", grade: "바른 말 찾기", gen: spelling },
          { id: "antonym", name: "반대말", emoji: "↔️", grade: "1~3학년", gen: antonym },
          { id: "honor", name: "높임말", emoji: "🙇", grade: "2~3학년", gen: honorific },
          { id: "proverb", name: "속담 완성", emoji: "📜", grade: "3~4학년", gen: proverb },
          { id: "chosung", name: "초성 퀴즈", emoji: "🔤", grade: "낱말 찾기", gen: chosung },
        ],
      },
      {
        id: "english", name: "영어", emoji: "🔠", color: "#1e88e5",
        modes: [
          { id: "en2ko", name: "영어 → 뜻", emoji: "🍎", grade: "기초 단어", gen: enToKo },
          { id: "ko2en", name: "뜻 → 영어", emoji: "🐯", grade: "기초 단어", gen: koToEn },
          { id: "alpha", name: "대·소문자", emoji: "🅰️", grade: "알파벳", gen: alphabet },
          { id: "ennum", name: "영어 숫자", emoji: "🔟", grade: "one ~ twenty", gen: enNumber },
          { id: "ensent", name: "영어 표현", emoji: "💬", grade: "빈칸 채우기", gen: enSentence },
        ],
      },
      {
        id: "general", name: "상식", emoji: "🌏", color: "#8e24aa",
        modes: [
          { id: "korea", name: "우리나라", emoji: "🇰🇷", grade: "역사·문화", gen: korea },
          { id: "capital", name: "세계 수도", emoji: "🗺️", grade: "국기·수도", gen: capital },
          { id: "science", name: "과학 퀴즈", emoji: "🔬", grade: "3~4학년", gen: science },
          { id: "insect", name: "곤충 찾기", emoji: "🐞", grade: "3학년", gen: insect },
          { id: "safety", name: "안전 생활", emoji: "🚦", grade: "1~2학년", gen: safety },
        ],
      },
    ],
  };
})();
