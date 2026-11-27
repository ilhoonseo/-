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
   * 추가 콘텐츠
   * ================================================================= */
  // 문제 은행: 오답(w)을 안 적으면 다른 문제의 정답 중에서 골라요.
  const fromBankPool = (bank) => {
    const item = pick(bank);
    const pool = shuffle(bank.map((x) => x.a).filter((a) => a !== item.a));
    return { text: item.q, answer: item.a, wrongs: item.w ? [...item.w, ...pool] : pool, priority: item.w ? item.w.length : 0 };
  };

  // ----- 수학: 돈 계산 -----
  const won = (n) => `${n.toLocaleString("ko-KR")}원`;
  function money(lv) {
    if (lv >= 3 && Math.random() < 0.45) {
      const pay = pick(lv >= 5 ? [1000, 5000, 10000] : [1000, 1000, 5000]);
      const price = rand(1, Math.min(pay / 100 - 1, 49)) * 100;
      const ans = pay - price;
      const item = pick(["🍪 과자", "🧃 주스", "✏️ 연필", "🍦 아이스크림", "📒 공책", "🧸 인형"]);
      const ws = [ans + 100, ans - 100, price, ans + 1000, ans - 1000, ans + 500].filter((v) => v > 0 && v !== ans);
      return { text: `${item} ${won(price)}, ${won(pay)} 내면 거스름돈은?`, answer: won(ans), wrongs: shuffle(ws).map(won) };
    }
    const coins = lv <= 2 ? [10, 50, 100, 500] : [10, 50, 100, 500, 1000, 5000];
    const [a, b] = shuffle(coins).slice(0, 2).sort((x, y) => y - x);
    const na = rand(1, lv <= 1 ? 3 : 5), nb = rand(1, lv <= 1 ? 3 : 5);
    const ans = a * na + b * nb;
    const ws = [a * nb + b * na, a * na + b, a + b * nb, ans + b, ans - b, ans + a, (a + b) * Math.max(na, nb)].filter((v) => v > 0 && v !== ans);
    return { text: `💰 ${won(a)} ${na}개, ${won(b)} ${nb}개는 모두?`, answer: won(ans), wrongs: [...new Set(ws)].map(won) };
  }

  // ----- 수학: 시간 계산 -----
  function timeCalc(lv) {
    if (Math.random() < 0.3) {
      const h = rand(1, 3), m = pick([10, 15, 20, 30, 40, 45, 50]), ans = h * 60 + m;
      return { text: `${h}시간 ${m}분은 몇 분?`, answer: `${ans}분`, wrongs: [h * 100 + m, h * 10 + m, ans + 10, ans - 10, ans + 60].map((v) => `${v}분`) };
    }
    const step = lv <= 2 ? 10 : 5;
    const h = rand(1, 12), m = rand(0, Math.floor(59 / step)) * step;
    const d = lv <= 2 ? rand(1, 5) * 10 : rand(3, 22) * 5;
    const after = lv < 3 || Math.random() < 0.65;
    const toStr = (total) => { const t = ((total % 720) + 720) % 720; return fmtTime(wrapH(Math.floor(t / 60)), t % 60); };
    const start = (h % 12) * 60 + m, sign = after ? 1 : -1, end = start + sign * d;
    const dText = d >= 60 ? (d % 60 ? `${Math.floor(d / 60)}시간 ${d % 60}분` : `${d / 60}시간`) : `${d}분`;
    const ws = [toStr(end + 10), toStr(end - 10), toStr(end + 60), toStr(end - 60), toStr(start - sign * d)];
    if (after && m + (d % 60) >= 60) ws.unshift(fmtTime(wrapH(h + Math.floor(d / 60)), (m + d) % 60)); // 받아올림을 잊는 실수
    return { text: `🕐 ${fmtTime(h, m)}에서 ${dText} ${after ? "후" : "전"}는?`, answer: toStr(end), wrongs: others(ws, toStr(end)), keepFirstWrong: after && m + (d % 60) >= 60 };
  }

  // ----- 수학: 소수 -----
  const dec = (t) => (t % 10 === 0 ? String(t / 10) : (t / 10).toFixed(1)); // t: 0.1 단위 정수
  function decimal(lv) {
    const r = rand(0, lv <= 2 ? 2 : 4);
    if (r === 0) {
      const n = rand(1, lv <= 2 ? 9 : 39);
      return { text: `0.1이 ${n}개인 수는?`, answer: dec(n), wrongs: others([String(n), "0.0" + n, dec(n + 1), dec(n - 1), dec(n * 10)], dec(n), (v) => !v.startsWith("0.0") || n < 10) };
    }
    if (r === 1 || r === 3) {
      const max = lv <= 2 ? 9 : 99;
      const a = rand(1, max), b = rand(1, max), s = a + b;
      const ws = [dec(s + 1), dec(s - 1), dec(s + 10), dec(s - 10)];
      if (lv <= 2 && s >= 10) ws.unshift("0." + s); // 0.7 + 0.5 = 0.12 실수
      return { text: `${dec(a)} + ${dec(b)} = ?`, answer: dec(s), wrongs: others(ws, dec(s), (v) => v !== "0" && !v.startsWith("-")), keepFirstWrong: lv <= 2 && s >= 10 };
    }
    if (r === 2) {
      const max = lv <= 2 ? 9 : 99;
      let a = rand(2, max), b = rand(1, a - 1);
      return { text: `${dec(a)} − ${dec(b)} = ?`, answer: dec(a - b), wrongs: others([dec(a - b + 1), dec(a - b + 10), dec(a + b), dec(Math.abs(a - b - 1))], dec(a - b), (v) => v !== "0") };
    }
    // 크기 비교 (0.5 와 0.45 헷갈림)
    const set = new Set();
    while (set.size < 4) { const one = Math.random() < 0.5; set.add(one ? rand(1, 9) * 10 : rand(11, 99)); }
    const vals = [...set], big = Math.random() < 0.6, ans = big ? Math.max(...vals) : Math.min(...vals);
    const f = (v) => (v % 10 === 0 ? (v / 100).toFixed(1) : (v / 100).toFixed(2));
    return { text: big ? "가장 큰 소수는?" : "가장 작은 소수는?", answer: f(ans), wrongs: vals.filter((v) => v !== ans).map(f) };
  }

  // ----- 수학: 어림하기 -----
  function rounding(lv) {
    const unit = lv <= 2 ? 10 : pick([10, 100]);
    let n; do { n = unit === 10 ? rand(101, 999) : rand(1001, 9999); } while (n % unit === 0);
    const k = pick(lv <= 2 ? ["반올림"] : ["반올림", "반올림", "올림", "버림"]);
    const f = { 반올림: Math.round, 올림: Math.ceil, 버림: Math.floor }[k];
    const ans = f(n / unit) * unit;
    const ws = [Math.floor(n / unit) * unit, Math.ceil(n / unit) * unit, Math.round(n / (unit * 10)) * unit * 10, ans + unit, ans - unit];
    return { text: `${n}을(를) ${k}하여 ${unit === 10 ? "십" : "백"}의 자리까지 나타내면?`, answer: ans, wrongs: others(ws, ans), fill: true };
  }

  // ----- 수학: 큰 수 -----
  function bigNumber() {
    const t = rand(0, 2), a = rand(1, 9), b = rand(1, 9);
    const n = a * 10000 + b * 1000, read = `${a}만 ${b}천`;
    if (t === 0) return { text: `'${read}'을(를) 숫자로 쓰면?`, answer: n, wrongs: [a * 1000 + b * 100, a * 100000 + b * 10000, a * 10000 + b * 100, a * 10000 + b * 10], fill: true };
    if (t === 1) return { text: `${n}을(를) 읽으면?`, answer: read, wrongs: others([`${b}만 ${a}천`, `${a}천 ${b}백`, `${a}만 ${b}백`, `${a}십만 ${b}만`], read) };
    const k = rand(11, 99);
    return { text: `1000이 ${k}개인 수는?`, answer: k * 1000, wrongs: [k * 100, k * 10000, k * 1000 + 1000, k * 1000 - 1000], fill: true };
  }

  // ----- 수학: 약수와 배수 -----
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function factor(lv) {
    const t = rand(0, lv <= 2 ? 1 : 3);
    if (t === 0) {
      const n = pick([12, 16, 18, 20, 24, 30, 36]), divs = [], nons = [];
      for (let i = 1; i <= n; i++) (n % i ? nons : divs).push(i);
      return Math.random() < 0.5
        ? { text: `${n}의 약수가 아닌 것은?`, answer: pick(nons), wrongs: shuffle(divs) }
        : { text: `${n}의 약수를 찾아요!`, answer: pick(divs.filter((d) => d > 1 && d < n)), wrongs: shuffle(nons) };
    }
    if (t === 1) {
      const k = rand(3, 9), ans = k * rand(2, 9), ws = new Set();
      while (ws.size < 5) { const v = rand(k + 1, k * 10); if (v % k) ws.add(v); }
      return { text: `${k}의 배수를 찾아요!`, answer: ans, wrongs: [...ws] };
    }
    let g, x, y;
    do { g = rand(2, 6); x = rand(2, 7); y = rand(2, 7); } while (x === y || gcd(x, y) !== 1);
    const a = g * x, b = g * y, l = g * x * y;
    if (t === 2) return { text: `${a}와(과) ${b}의 최대공약수는?`, answer: g, wrongs: others([l, g * 2, x * y, Math.min(a, b)], g), fill: true };
    return { text: `${a}와(과) ${b}의 최소공배수는?`, answer: l, wrongs: others([a * b, g, l * 2, a + b], l), fill: true };
  }

  // ----- 국어: 흉내 내는 말 -----
  const SOUNDS = [
    ["🐶 강아지가 짖는 소리는?", "멍멍"], ["🐱 고양이 울음소리는?", "야옹"], ["🐓 닭 울음소리는?", "꼬끼오"],
    ["🐥 병아리 소리는?", "삐약삐약"], ["🦆 오리 소리는?", "꽥꽥"], ["🐮 소 울음소리는?", "음매"],
    ["🐷 돼지 소리는?", "꿀꿀"], ["🐸 개구리 소리는?", "개굴개굴"], ["🐦 참새 소리는?", "짹짹"], ["🦉 부엉이 소리는?", "부엉부엉"],
  ];
  const SHAPES_WORD = [
    ["⭐ 별이 ___ 빛나요", "반짝반짝"], ["🐰 토끼가 ___ 뛰어요", "깡충깡충"], ["🌧️ 비가 ___ 내려요", "주룩주룩"],
    ["🐢 거북이가 ___ 기어가요", "엉금엉금"], ["🦆 오리가 ___ 걸어가요", "뒤뚱뒤뚱"], ["❄️ 함박눈이 ___ 내려요", "펑펑"],
    ["🚂 기차가 ___ 달려요", "칙칙폭폭"], ["🔔 종이 ___ 울려요", "땡땡"], ["😊 아기가 ___ 웃어요", "방긋방긋"], ["🐝 벌이 ___ 날아요", "윙윙"],
  ];
  function mimetic() {
    const set = Math.random() < 0.5 ? SOUNDS : SHAPES_WORD;
    const [q, a] = pick(set);
    return { text: q, answer: a, wrongs: shuffle(set.filter((x) => x[1] !== a).map((x) => x[1])) };
  }

  // ----- 국어: 사자성어 -----
  const IDIOM = [
    ["돌 하나로 새 두 마리를 잡음", "일석이조"], ["묻는 말에 엉뚱한 대답을 함", "동문서답"], ["굳은 결심이 사흘을 못 감", "작심삼일"],
    ["이리저리 왔다 갔다 갈피를 못 잡음", "우왕좌왕"], ["열 가운데 여덟이나 아홉, 거의 대부분", "십중팔구"], ["말하지 않아도 마음이 통함", "이심전심"],
    ["미리 준비하면 걱정할 것이 없음", "유비무환"], ["큰 인물은 늦게 이루어짐", "대기만성"], ["많으면 많을수록 좋음", "다다익선"],
    ["자기가 한 일의 결과를 자기가 받음", "자업자득"], ["날마다 달마다 크게 발전함", "일취월장"], ["지금 처음 들음", "금시초문"],
    ["실력이 비슷해 누가 나은지 가리기 어려움", "막상막하"], ["둘이 다투는 사이 남이 이익을 얻음", "어부지리"], ["어릴 때부터 함께 자란 친구", "죽마고우"],
    ["제자가 스승보다 더 나음", "청출어람"], ["고생 끝에 즐거움이 옴", "고진감래"], ["조금 차이는 있지만 본질은 같음", "오십보백보"],
  ];
  function idiom() {
    const [q, a] = pick(IDIOM);
    return { text: q, answer: a, wrongs: shuffle(IDIOM.filter((x) => x[1] !== a).map((x) => x[1])) };
  }

  // ----- 국어: 비슷한 말 -----
  const SYNONYM = [
    ["기쁘다", "즐겁다"], ["예쁘다", "아름답다"], ["가끔", "이따금"], ["모두", "전부"], ["매우", "아주"], ["곧", "금방"],
    ["이유", "까닭"], ["걱정", "근심"], ["친구", "벗"], ["대답", "응답"], ["나이", "연령"], ["길", "도로"], ["이", "치아"],
    ["기르다", "키우다"], ["고치다", "수리하다"], ["넉넉하다", "충분하다"], ["틀리다", "그르다"],
  ];
  function synonym() {
    const pair = pick(SYNONYM), flip = Math.random() < 0.5;
    const q = flip ? pair[1] : pair[0], a = flip ? pair[0] : pair[1];
    const pool = SYNONYM.filter((p) => p !== pair).flat();
    return { text: `'${q}'와(과) 뜻이 비슷한 말은?`, answer: a, wrongs: shuffle(pool) };
  }

  // ----- 영어: 철자 -----
  function misspell(w) {
    const vs = "aeiou";
    const ops = [
      () => { const i = rand(0, w.length - 2); return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); },
      () => { const i = rand(1, w.length - 1); return w.slice(0, i) + w.slice(i + 1); },
      () => { const i = rand(0, w.length - 1); return w.slice(0, i + 1) + w[i] + w.slice(i + 1); },
      () => { const idx = [...w].map((c, i) => (vs.includes(c) ? i : -1)).filter((i) => i >= 0); if (!idx.length) return w + "e"; const i = pick(idx); return w.slice(0, i) + pick([...vs].filter((v) => v !== w[i])) + w.slice(i + 1); },
    ];
    return pick(ops)();
  }
  function enSpell() {
    const [en, ko, emo] = pick(EN.filter((w) => w[0].length >= 3));
    const set = new Set(); let g = 0;
    while (set.size < 5 && g++ < 80) { const m = misspell(en); if (m !== en && !EN.some((x) => x[0] === m)) set.add(m); }
    return { text: `${emo} ${ko.replace("(얼굴)", "")} — 바른 철자는?`, answer: en, wrongs: [...set] };
  }

  // ----- 영어: 반대말 -----
  const EN_OPP = [
    ["big", "small"], ["tall", "short"], ["hot", "cold"], ["fast", "slow"], ["happy", "sad"], ["up", "down"],
    ["open", "close"], ["new", "old"], ["day", "night"], ["left", "right"], ["black", "white"], ["in", "out"],
    ["yes", "no"], ["heavy", "light"], ["strong", "weak"], ["clean", "dirty"], ["early", "late"], ["full", "empty"], ["rich", "poor"],
  ];
  function enOpposite() {
    const pair = pick(EN_OPP), flip = Math.random() < 0.5;
    const q = flip ? pair[1] : pair[0], a = flip ? pair[0] : pair[1];
    return { text: `'${q}'의 반대말은?`, answer: a, wrongs: shuffle(EN_OPP.filter((p) => p !== pair).flat()) };
  }

  // ----- 영어: 요일 · 달 · 계절 -----
  const EN_CAL = [
    [["Monday", "월요일"], ["Tuesday", "화요일"], ["Wednesday", "수요일"], ["Thursday", "목요일"], ["Friday", "금요일"], ["Saturday", "토요일"], ["Sunday", "일요일"]],
    [["January", "1월"], ["February", "2월"], ["March", "3월"], ["April", "4월"], ["May", "5월"], ["June", "6월"], ["July", "7월"], ["August", "8월"], ["September", "9월"], ["October", "10월"], ["November", "11월"], ["December", "12월"]],
    [["spring", "봄 🌸"], ["summer", "여름 🏖️"], ["fall", "가을 🍁"], ["winter", "겨울 ⛄"]],
  ];
  function enCalendar() {
    const group = pick([EN_CAL[0], EN_CAL[0], EN_CAL[1], EN_CAL[1], EN_CAL[2]]);
    const [en, ko] = pick(group), rest = group.filter((x) => x[0] !== en);
    if (Math.random() < 0.5) return { text: `${en} → 우리말로?`, answer: ko, wrongs: shuffle(rest.map((x) => x[1])) };
    return { text: `${ko} → 영어로?`, answer: en, wrongs: shuffle(rest.map((x) => x[0])) };
  }

  // ----- 영어: 가족 · 직업 -----
  const EN_PEOPLE = [
    ["father", "아빠", "👨"], ["mother", "엄마", "👩"], ["grandfather", "할아버지", "👴"], ["grandmother", "할머니", "👵"],
    ["baby", "아기", "👶"], ["teacher", "선생님", "🧑‍🏫"], ["doctor", "의사", "🧑‍⚕️"], ["nurse", "간호사", "💉"],
    ["cook", "요리사", "🧑‍🍳"], ["farmer", "농부", "🧑‍🌾"], ["police officer", "경찰관", "👮"], ["firefighter", "소방관", "🧑‍🚒"],
    ["singer", "가수", "🎤"], ["pilot", "조종사", "✈️"], ["student", "학생", "🎒"], ["scientist", "과학자", "🔬"], ["dancer", "무용수", "💃"],
  ];
  function enPeople() {
    const [en, ko, emo] = pick(EN_PEOPLE), rest = EN_PEOPLE.filter((x) => x[0] !== en);
    if (Math.random() < 0.5) return { text: `${en} 의 뜻은?`, answer: ko, wrongs: shuffle(rest.map((x) => x[1])), reveal: emo };
    return { text: `${emo} ${ko} → 영어로?`, answer: en, wrongs: shuffle(rest.map((x) => x[0])) };
  }

  // ----- 사회: 한국사 인물·나라 -----
  const HISTORY = [
    { q: "측우기 등을 만든 조선의 과학자는?", a: "장영실", w: ["허준", "정약용", "김정호"] },
    { q: "살수대첩에서 수나라를 물리친 고구려 장군은?", a: "을지문덕", w: ["강감찬", "이순신", "계백"] },
    { q: "귀주대첩에서 거란을 물리친 고려 장군은?", a: "강감찬", w: ["을지문덕", "김유신", "권율"] },
    { q: "황산벌에서 신라군과 싸운 백제 장군은?", a: "계백", w: ["김유신", "을지문덕", "강감찬"] },
    { q: "행주산성에서 왜군을 크게 물리친 장군은?", a: "권율", w: ["이순신", "강감찬", "계백"] },
    { q: "우리나라 최초의 나라는?", a: "고조선", w: ["고구려", "신라", "고려"] },
    { q: "고조선을 세운 사람은?", a: "단군왕검", w: ["주몽", "온조", "왕건"] },
    { q: "고구려를 세운 사람은?", a: "주몽", w: ["온조", "박혁거세", "왕건"] },
    { q: "백제를 세운 사람은?", a: "온조", w: ["주몽", "박혁거세", "대조영"] },
    { q: "발해를 세운 사람은?", a: "대조영", w: ["왕건", "주몽", "궁예"] },
    { q: "고려를 세운 사람은?", a: "왕건", w: ["이성계", "주몽", "온조"] },
    { q: "조선을 세운 사람은?", a: "이성계", w: ["왕건", "세종대왕", "궁예"] },
    { q: "삼국을 통일한 나라는?", a: "신라", w: ["고구려", "백제", "가야"] },
    { q: "경주 첨성대를 만든 나라는?", a: "신라", w: ["고려", "백제", "조선"] },
    { q: "팔만대장경을 만든 나라는?", a: "고려", w: ["신라", "조선", "백제"] },
    { q: "금속 활자로 「직지」를 인쇄한 나라는?", a: "고려", w: ["조선", "신라", "백제"] },
    { q: "「동의보감」을 쓴 의학자는?", a: "허준", w: ["장영실", "정약용", "김정호"] },
    { q: "거중기를 만들어 수원 화성 건설을 도운 학자는?", a: "정약용", w: ["장영실", "허준", "이황"] },
    { q: "「대동여지도」를 만든 사람은?", a: "김정호", w: ["정약용", "허준", "장영실"] },
    { q: "3·1 운동 때 만세를 외치다 순국한 학생은?", a: "유관순", w: ["신사임당", "김구", "안중근"] },
    { q: "하얼빈에서 이토 히로부미를 저격한 독립운동가는?", a: "안중근", w: ["윤봉길", "김구", "이봉창"] },
    { q: "대한민국 임시 정부를 이끈 '백범'은?", a: "김구", w: ["안중근", "안창호", "윤봉길"] },
    { q: "한글을 연구하고 널리 알린 '한힌샘'은?", a: "주시경", w: ["세종대왕", "김구", "정약용"] },
  ];
  const history = () => fromBank(HISTORY);

  // ----- 사회: 우리나라 지리 -----
  const METRO = ["부산", "대구", "인천", "광주", "대전", "울산"];
  const NOT_METRO = ["수원", "전주", "청주", "춘천", "포항", "창원", "경주", "강릉", "천안"];
  const GEO = [
    { q: "우리나라의 하나뿐인 특별시는?", a: "서울", w: ["부산", "세종", "인천"] },
    { q: "행정 중심 복합 도시인 특별자치시는?", a: "세종", w: ["수원", "대전", "청주"] },
    { q: "우리나라에서 두 번째로 큰 도시는?", a: "부산", w: ["대구", "인천", "광주"] },
    { q: "불국사·첨성대가 있는 옛 신라의 수도는?", a: "경주", w: ["공주", "부여", "개성"] },
    { q: "백제의 마지막 수도(사비)는 오늘날 어디?", a: "부여", w: ["경주", "공주", "개성"] },
    { q: "고려의 수도는?", a: "개성", w: ["경주", "부여", "한양"] },
    { q: "조선의 수도 '한양'은 오늘날 어디?", a: "서울", w: ["개성", "수원", "경주"] },
    { q: "수원 화성이 있는 도시는?", a: "수원", w: ["서울", "부산", "경주"] },
    { q: "남한에서 가장 긴 강은?", a: "낙동강", w: ["한강", "금강", "영산강"] },
    { q: "서울을 가로질러 흐르는 강은?", a: "한강", w: ["낙동강", "금강", "섬진강"] },
    { q: "우리나라 가장 동쪽 끝의 섬은?", a: "독도", w: ["울릉도", "마라도", "제주도"] },
    { q: "우리나라 가장 남쪽 끝의 섬은?", a: "마라도", w: ["독도", "울릉도", "강화도"] },
    { q: "우리나라 땅의 모양을 닮은 동물(비유)은?", a: "호랑이", w: ["고래", "코끼리", "기린"] },
    { q: "우리나라를 둘러싼 바다가 아닌 것은?", a: "북해", w: ["동해", "서해", "남해"] },
  ];
  function geography() {
    if (Math.random() < 0.3) return { text: "광역시를 찾아요!", answer: pick(METRO), wrongs: shuffle(NOT_METRO) };
    return fromBank(GEO);
  }

  // ----- 사회: 직업 -----
  const JOBS = [
    { q: "🏥 아픈 사람을 치료해요", a: "의사" }, { q: "🚒 불을 끄고 사람을 구해요", a: "소방관" },
    { q: "✉️ 편지와 소포를 배달해요", a: "집배원" }, { q: "🚓 우리 동네 안전을 지켜요", a: "경찰관" },
    { q: "🥐 빵과 과자를 만들어요", a: "제빵사" }, { q: "✈️ 비행기를 조종해요", a: "조종사" },
    { q: "💇 머리를 자르고 다듬어요", a: "미용사" }, { q: "🌾 곡식과 채소를 길러요", a: "농부" },
    { q: "🐟 바다에서 물고기를 잡아요", a: "어부" }, { q: "🐕 아픈 동물을 치료해요", a: "수의사" },
    { q: "🏗️ 집과 건물을 설계해요", a: "건축가" }, { q: "🦷 아픈 이를 치료해요", a: "치과 의사" },
    { q: "📚 도서관에서 책을 관리해요", a: "사서" }, { q: "📰 새로운 소식을 취재해 전해요", a: "기자" },
    { q: "💊 약을 지어 줘요", a: "약사" }, { q: "🍳 맛있는 음식을 만들어요", a: "요리사" },
  ];
  const jobs = () => fromBankPool(JOBS);

  // ----- 사회: 바른 생활 -----
  const MANNERS = [
    { q: "🎁 선물을 받았을 때 하는 말은?", a: "고맙습니다", w: ["미안합니다", "안녕히 계세요", "잘 먹겠습니다"] },
    { q: "🦶 친구 발을 밟았을 때 하는 말은?", a: "미안해", w: ["고마워", "잘 자", "축하해"] },
    { q: "🍚 밥 먹기 전에 하는 인사는?", a: "잘 먹겠습니다", w: ["잘 먹었습니다", "안녕히 주무세요", "다녀오겠습니다"] },
    { q: "🍽️ 밥을 다 먹은 뒤 하는 인사는?", a: "잘 먹었습니다", w: ["잘 먹겠습니다", "다녀왔습니다", "고맙습니다"] },
    { q: "🏫 학교 가기 전 부모님께 하는 인사는?", a: "다녀오겠습니다", w: ["다녀왔습니다", "잘 먹겠습니다", "안녕히 주무세요"] },
    { q: "🏠 집에 돌아와서 하는 인사는?", a: "다녀왔습니다", w: ["다녀오겠습니다", "잘 먹었습니다", "안녕히 계세요"] },
    { q: "🌙 잠자기 전 어른께 하는 인사는?", a: "안녕히 주무세요", w: ["안녕히 가세요", "다녀오겠습니다", "잘 먹겠습니다"] },
    { q: "🎂 친구 생일에 하는 말은?", a: "생일 축하해", w: ["미안해", "잘 가", "다녀올게"] },
    { q: "📚 도서관에서는?", a: "조용히 해요", w: ["뛰어다녀요", "크게 떠들어요", "음식을 먹어요"] },
    { q: "🗑️ 쓰레기는 어떻게 버려요?", a: "분리해서 버려요", w: ["아무 데나 버려요", "책상 속에 넣어요", "창밖으로 던져요"] },
    { q: "🚶 복도와 계단에서는?", a: "오른쪽으로 걸어요", w: ["뛰어다녀요", "밀치며 가요", "장난쳐요"] },
    { q: "🤲 어른께 물건을 드릴 때는?", a: "두 손으로 드려요", w: ["한 손으로 던져요", "발로 밀어요", "휙 줘요"] },
    { q: "🙋 수업 시간에 말하고 싶을 때는?", a: "손을 들어요", w: ["소리쳐요", "그냥 말해요", "일어나 걸어요"] },
  ];
  const manners = () => fromBank(MANNERS);

  // ----- 과학: 동물 분류 -----
  const ANIMAL_CLASS = {
    포유류: { hint: "새끼에게 젖을 먹여요", list: ["고래", "돌고래", "박쥐", "사자", "코끼리", "원숭이", "캥거루", "코알라"] },
    조류: { hint: "깃털과 날개가 있어요", list: ["펭귄", "타조", "독수리", "참새", "닭", "오리", "부엉이"] },
    어류: { hint: "아가미로 숨을 쉬어요", list: ["상어", "고등어", "금붕어", "연어", "붕어", "가오리"] },
    파충류: { hint: "폐로 숨 쉬고 몸이 비늘로 덮여 있어요", list: ["뱀", "거북", "악어", "도마뱀"] },
    양서류: { hint: "어릴 땐 물, 커서는 땅에서도 살아요", list: ["개구리", "도롱뇽", "두꺼비"] },
  };
  function animalClass() {
    const cls = pick(Object.keys(ANIMAL_CLASS)), info = ANIMAL_CLASS[cls];
    const wrongs = shuffle(Object.keys(ANIMAL_CLASS).filter((c) => c !== cls).flatMap((c) => ANIMAL_CLASS[c].list));
    return { text: `${cls}를 찾아요! (${info.hint})`, answer: pick(info.list), wrongs };
  }

  // ----- 과학: 계절 -----
  const SEASON = [
    { q: "🌸 벚꽃과 개나리가 피는 계절은?", a: "봄" }, { q: "🌱 새싹이 돋아나는 계절은?", a: "봄" }, { q: "🎒 새 학년이 시작되는 계절은?", a: "봄" },
    { q: "🏖️ 해수욕을 하는 계절은?", a: "여름" }, { q: "🦗 매미가 맴맴 우는 계절은?", a: "여름" }, { q: "☔ 장마가 있는 계절은?", a: "여름" }, { q: "🥵 가장 더운 계절은?", a: "여름" },
    { q: "🍁 단풍이 드는 계절은?", a: "가을" }, { q: "🌾 곡식을 거두는 계절은?", a: "가을" }, { q: "🌕 추석이 있는 계절은?", a: "가을" },
    { q: "⛄ 눈사람을 만드는 계절은?", a: "겨울" }, { q: "🛷 얼음 썰매를 타는 계절은?", a: "겨울" }, { q: "🥶 가장 추운 계절은?", a: "겨울" },
  ];
  function season() {
    const it = pick(SEASON);
    return { text: it.q, answer: it.a, wrongs: shuffle(["봄", "여름", "가을", "겨울"].filter((s) => s !== it.a)) };
  }

  // ----- 과학: 우리 몸 -----
  const BODY = [
    { q: "우리 몸을 지탱하고 보호하는 것은?", a: "뼈", w: ["근육", "피부", "혈액"] },
    { q: "뼈를 당겨 몸을 움직이게 하는 것은?", a: "근육", w: ["혈관", "신경", "피부"] },
    { q: "음식물이 위로 내려가는 길은?", a: "식도", w: ["기관", "혈관", "큰창자"] },
    { q: "영양소를 주로 흡수하는 곳은?", a: "작은창자", w: ["큰창자", "식도", "입"] },
    { q: "오줌을 만드는 기관은?", a: "콩팥", w: ["간", "위", "폐"] },
    { q: "생각하고 기억하는 기관은?", a: "뇌", w: ["심장", "위", "폐"] },
    { q: "냄새를 맡는 감각 기관은?", a: "코", w: ["귀", "눈", "혀"] },
    { q: "맛을 느끼는 감각 기관은?", a: "혀", w: ["코", "귀", "피부"] },
    { q: "차갑고 뜨거운 것을 느끼는 감각 기관은?", a: "피부", w: ["혀", "귀", "코"] },
    { q: "몸속에서 피가 흐르는 길은?", a: "혈관", w: ["신경", "근육", "뼈"] },
    { q: "공기 속 산소를 받아들이는 기관은?", a: "폐", w: ["위", "간", "콩팥"] },
  ];
  const body = () => fromBank(BODY);

  // ----- 과학: 지구와 우주 -----
  const SPACE = [
    { q: "태양계에서 가장 작은 행성은?", a: "수성", w: ["화성", "금성", "지구"] },
    { q: "'붉은 행성'이라 불리는 행성은?", a: "화성", w: ["금성", "목성", "수성"] },
    { q: "태양계에서 가장 바깥에 있는 행성은?", a: "해왕성", w: ["천왕성", "토성", "명왕성"] },
    { q: "고리가 뚜렷하고 아름다운 행성은?", a: "토성", w: ["화성", "수성", "금성"] },
    { q: "지구 둘레를 도는 위성은?", a: "달", w: ["태양", "화성", "금성"] },
    { q: "태양계의 행성은 모두 몇 개?", a: "8개", w: ["9개", "7개", "10개"] },
    { q: "지구가 스스로 한 바퀴 도는 데 걸리는 시간은?", a: "하루", w: ["한 달", "일 년", "일주일"] },
    { q: "지구가 태양을 한 바퀴 도는 데 걸리는 시간은?", a: "일 년", w: ["하루", "한 달", "일주일"] },
    { q: "낮과 밤이 생기는 까닭은?", a: "지구의 자전", w: ["지구의 공전", "달의 공전", "태양의 자전"] },
    { q: "북쪽 하늘의 국자 모양 별자리는?", a: "북두칠성", w: ["오리온자리", "전갈자리", "백조자리"] },
    { q: "해가 뜨는 방향은?", a: "동쪽", w: ["서쪽", "남쪽", "북쪽"] },
    { q: "해가 지는 방향은?", a: "서쪽", w: ["동쪽", "남쪽", "북쪽"] },
    { q: "초승달 → 상현달 → ? (달의 변화)", a: "보름달", w: ["그믐달", "초승달", "하현달"] },
  ];
  const space = () => fromBank(SPACE);

  // ----- 예체능: 색 -----
  const COLOR_MIX = [
    ["🔴 빨강 + 🟡 노랑 = ?", "주황"], ["🔴 빨강 + 🔵 파랑 = ?", "보라"], ["🔵 파랑 + 🟡 노랑 = ?", "초록"],
    ["🔴 빨강 + ⚪ 흰색 = ?", "분홍"], ["⚫ 검정 + ⚪ 흰색 = ?", "회색"],
  ];
  const COLOR_ETC = [
    { q: "🎨 색의 삼원색이 아닌 것은?", a: "초록", w: ["빨강", "노랑", "파랑"] },
    { q: "🌈 무지개 색이 아닌 것은?", a: pick(["검정", "갈색", "흰색"]), w: ["빨강", "주황", "노랑", "초록", "파랑", "남색", "보라"] },
    { q: "🌈 무지개의 맨 바깥쪽 색은?", a: "빨강", w: ["보라", "초록", "파랑"] },
    { q: "🔥 따뜻한 느낌의 색은?", a: pick(["빨강", "주황"]), w: ["파랑", "남색", "청록"] },
    { q: "🧊 차가운 느낌의 색은?", a: pick(["파랑", "남색"]), w: ["빨강", "주황", "노랑"] },
    { q: "🟡 노랑과 섞으면 초록이 되는 색은?", a: "파랑", w: ["빨강", "흰색", "검정"] },
  ];
  function colors() {
    if (Math.random() < 0.55) { const [q, a] = pick(COLOR_MIX); return { text: q, answer: a, wrongs: shuffle(["주황", "보라", "초록", "분홍", "회색", "갈색", "하늘색"].filter((c) => c !== a)) }; }
    return fromBank(COLOR_ETC);
  }

  // ----- 예체능: 악기 -----
  const INSTRUMENT = [
    { q: "🎹 건반을 눌러 연주하는 악기는?", a: "피아노" }, { q: "🎻 줄을 활로 켜서 연주하는 악기는?", a: "바이올린" },
    { q: "🎶 입으로 불고 구멍을 막아 연주하는 악기는?", a: "리코더" }, { q: "🥁 허리가 잘록한 우리나라 타악기는?", a: "장구" },
    { q: "🔔 사물놀이에서 가장 높은 소리를 내는 쇠 악기는?", a: "꽹과리" }, { q: "🪕 열두 줄을 손으로 뜯는 우리 현악기는?", a: "가야금" },
    { q: "🔺 삼각형 모양의 쇠 악기는?", a: "트라이앵글" }, { q: "🎵 나무 막대를 채로 쳐서 소리 내는 악기는?", a: "실로폰" },
    { q: "🎸 여섯 줄을 손가락으로 튕기는 악기는?", a: "기타" }, { q: "🎺 입술을 떨어 부는 금관 악기는?", a: "트럼펫" },
    { q: "🥁 사물놀이 악기가 아닌 것은?", a: "피아노", w: ["장구", "북", "징", "꽹과리"] },
  ];
  const instrument = () => fromBankPool(INSTRUMENT);

  // ----- 예체능: 음악 기호 -----
  const MUSIC = [
    { q: "♩ 4분음표는 몇 박?", a: "1박", w: ["2박", "반 박", "4박"] },
    { q: "2분음표는 몇 박?", a: "2박", w: ["1박", "3박", "4박"] },
    { q: "점2분음표는 몇 박?", a: "3박", w: ["2박", "4박", "1박"] },
    { q: "온음표는 몇 박?", a: "4박", w: ["1박", "2박", "3박"] },
    { q: "♪ 8분음표는 몇 박?", a: "반 박", w: ["1박", "2박", "8박"] },
    { q: "f (포르테)의 뜻은?", a: "세게", w: ["여리게", "빠르게", "느리게"] },
    { q: "p (피아노)의 뜻은?", a: "여리게", w: ["세게", "빠르게", "점점 세게"] },
    { q: "mf (메조 포르테)의 뜻은?", a: "조금 세게", w: ["매우 세게", "조금 여리게", "여리게"] },
    { q: "ff (포르티시모)의 뜻은?", a: "매우 세게", w: ["조금 세게", "매우 여리게", "세게"] },
    { q: "크레셴도(<)의 뜻은?", a: "점점 세게", w: ["점점 여리게", "빠르게", "멈추기"] },
    { q: "데크레셴도(>)의 뜻은?", a: "점점 여리게", w: ["점점 세게", "느리게", "다시 처음부터"] },
    { q: "4/4박자는 한 마디에 몇 박?", a: "4박", w: ["2박", "3박", "1박"] },
    { q: "3/4박자는 한 마디에 몇 박?", a: "3박", w: ["4박", "2박", "1박"] },
    { q: "도 레 미 파 솔 라 ? 도", a: "시", w: ["레", "파", "솔"] },
  ];
  const music = () => fromBank(MUSIC);

  // ----- 예체능: 스포츠 -----
  const SPORTS = [
    { q: "⚽ 골키퍼만 손을 쓸 수 있는 공놀이는?", a: "축구" }, { q: "🏀 바구니에 공을 넣는 운동은?", a: "농구" },
    { q: "🏐 네트 너머로 공을 손으로 쳐 넘기는 운동은?", a: "배구" }, { q: "🏸 셔틀콕을 라켓으로 치는 운동은?", a: "배드민턴" },
    { q: "⚾ 방망이로 공을 치고 베이스를 도는 운동은?", a: "야구" }, { q: "🥋 우리나라에서 시작된 발차기 무예는?", a: "태권도" },
    { q: "🏓 탁자 위에서 작은 공을 치는 운동은?", a: "탁구" }, { q: "🏊 물속에서 헤엄치는 운동은?", a: "수영" },
    { q: "⛷️ 눈 덮인 산을 판을 타고 내려오는 운동은?", a: "스키" }, { q: "🥌 얼음 위로 스톤을 미끄러뜨리는 운동은?", a: "컬링" },
    { q: "🪢 운동회에서 줄을 당기는 경기는?", a: "줄다리기" },
    { q: "🏅 올림픽 오륜기의 고리는 몇 개?", a: "5개", w: ["4개", "6개", "7개"] },
  ];
  const sports = () => fromBankPool(SPORTS);

  /* =================================================================
   * 과목 · 모드 목록 (메뉴에 이 순서대로 표시됩니다)
   * grades: 학년 골든벨에서 이 모드를 몇 학년 문제로 쓸지
   * ================================================================= */
  const subjects = [
    {
      id: "math", name: "수학", emoji: "🔢", color: "#43a047",
      modes: [
        { id: "add", name: "덧셈", emoji: "➕", grade: "1~2학년", grades: [1, 2], gen: add },
        { id: "sub", name: "뺄셈", emoji: "➖", grade: "1~2학년", grades: [1, 2], gen: sub },
        { id: "mul", name: "곱셈구구", emoji: "✖️", grade: "2학년", grades: [2, 3], gen: mul },
        { id: "div", name: "나눗셈", emoji: "➗", grade: "3학년", grades: [3], gen: div },
        { id: "blank", name: "빈칸 채우기", emoji: "❓", grade: "□ 구하기", grades: [1, 2, 3], gen: blank },
        { id: "mix", name: "섞어서 계산", emoji: "🎲", grade: "혼합 계산", grades: [3, 4], gen: mixed },
        { id: "clock", name: "시계 보기", emoji: "🕒", grade: "1~2학년", grades: [1, 2], gen: clock },
        { id: "timecalc", name: "시간 계산", emoji: "⏰", grade: "2~3학년", grades: [2, 3], gen: timeCalc },
        { id: "money", name: "돈 계산", emoji: "💰", grade: "2~3학년", grades: [2, 3], gen: money },
        { id: "unit", name: "단위 바꾸기", emoji: "📏", grade: "2~3학년", grades: [2, 3], gen: unit },
        { id: "frac", name: "분수", emoji: "🍕", grade: "3학년", grades: [3, 4], gen: fraction },
        { id: "decimal", name: "소수", emoji: "🔟", grade: "3~4학년", grades: [3, 4], gen: decimal },
        { id: "shape", name: "도형", emoji: "🔺", grade: "1~3학년", grades: [1, 2, 3], gen: shape },
        { id: "pattern", name: "규칙 찾기", emoji: "🔁", grade: "1~4학년", grades: [1, 2, 3, 4], gen: pattern },
        { id: "numsense", name: "수 감각", emoji: "🧮", grade: "짝·홀, 자릿값", grades: [1, 2, 3], gen: numSense },
        { id: "bignum", name: "큰 수", emoji: "🏦", grade: "4학년", grades: [4], gen: bigNumber },
        { id: "round", name: "어림하기", emoji: "🎯", grade: "4~5학년", grades: [4, 5], gen: rounding },
        { id: "factor", name: "약수와 배수", emoji: "🧩", grade: "5학년", grades: [5, 6], gen: factor },
      ],
    },
    {
      id: "korean", name: "국어", emoji: "📖", color: "#ef6c00",
      modes: [
        { id: "mimetic", name: "흉내 내는 말", emoji: "🐥", grade: "1~2학년", grades: [1, 2], gen: mimetic },
        { id: "chosung", name: "초성 퀴즈", emoji: "🔤", grade: "낱말 찾기", grades: [1, 2], gen: chosung },
        { id: "antonym", name: "반대말", emoji: "↔️", grade: "1~3학년", grades: [1, 2, 3], gen: antonym },
        { id: "synonym", name: "비슷한 말", emoji: "🟰", grade: "3~4학년", grades: [3, 4], gen: synonym },
        { id: "honor", name: "높임말", emoji: "🙇", grade: "2~3학년", grades: [2, 3], gen: honorific },
        { id: "spell", name: "맞춤법", emoji: "✍️", grade: "바른 말 찾기", grades: [3, 4, 5, 6], gen: spelling },
        { id: "proverb", name: "속담 완성", emoji: "📜", grade: "3~4학년", grades: [3, 4, 5], gen: proverb },
        { id: "idiom", name: "사자성어", emoji: "🀄", grade: "5~6학년", grades: [5, 6], gen: idiom },
      ],
    },
    {
      id: "english", name: "영어", emoji: "🔠", color: "#1e88e5",
      modes: [
        { id: "alpha", name: "대·소문자", emoji: "🅰️", grade: "알파벳", grades: [3], gen: alphabet },
        { id: "en2ko", name: "영어 → 뜻", emoji: "🍎", grade: "기초 단어", grades: [3, 4], gen: enToKo },
        { id: "ko2en", name: "뜻 → 영어", emoji: "🐯", grade: "기초 단어", grades: [3, 4], gen: koToEn },
        { id: "enspell", name: "바른 철자", emoji: "🔡", grade: "스펠링", grades: [4, 5], gen: enSpell },
        { id: "ennum", name: "영어 숫자", emoji: "🔢", grade: "one ~ twenty", grades: [3, 4], gen: enNumber },
        { id: "enopp", name: "영어 반대말", emoji: "🔄", grade: "big ↔ small", grades: [4, 5], gen: enOpposite },
        { id: "encal", name: "요일·달·계절", emoji: "📅", grade: "Monday, May…", grades: [4, 5, 6], gen: enCalendar },
        { id: "enpeople", name: "가족·직업", emoji: "👨‍👩‍👧", grade: "teacher, doctor…", grades: [3, 4, 5], gen: enPeople },
        { id: "ensent", name: "영어 표현", emoji: "💬", grade: "빈칸 채우기", grades: [4, 5, 6], gen: enSentence },
      ],
    },
    {
      id: "general", name: "사회", emoji: "🏛️", color: "#8e24aa",
      modes: [
        { id: "manners", name: "바른 생활", emoji: "🙏", grade: "1~2학년", grades: [1, 2], gen: manners },
        { id: "safety", name: "안전 생활", emoji: "🚦", grade: "1~2학년", grades: [1, 2], gen: safety },
        { id: "jobs", name: "직업", emoji: "🧑‍🚒", grade: "2학년", grades: [1, 2], gen: jobs },
        { id: "korea", name: "우리나라", emoji: "🇰🇷", grade: "문화·기념일", grades: [3, 4, 5, 6], gen: korea },
        { id: "geo", name: "우리나라 지리", emoji: "🗾", grade: "도시·강·섬", grades: [4, 5], gen: geography },
        { id: "history", name: "한국사", emoji: "📜", grade: "5~6학년", grades: [5, 6], gen: history },
        { id: "capital", name: "세계 수도", emoji: "🗺️", grade: "국기·수도", grades: [5, 6], gen: capital },
      ],
    },
    {
      id: "science", name: "과학", emoji: "🔬", color: "#00838f",
      modes: [
        { id: "season", name: "계절", emoji: "🌸", grade: "1~2학년", grades: [1, 2], gen: season },
        { id: "insect", name: "곤충 찾기", emoji: "🐞", grade: "3학년", grades: [3], gen: insect },
        { id: "animal", name: "동물 분류", emoji: "🐋", grade: "포유류·조류…", grades: [3, 4], gen: animalClass },
        { id: "science", name: "과학 퀴즈", emoji: "🧪", grade: "3~4학년", grades: [3, 4], gen: science },
        { id: "body", name: "우리 몸", emoji: "🫀", grade: "5~6학년", grades: [5, 6], gen: body },
        { id: "space", name: "지구와 우주", emoji: "🪐", grade: "5~6학년", grades: [5, 6], gen: space },
      ],
    },
    {
      id: "arts", name: "예체능", emoji: "🎨", color: "#d81b60",
      modes: [
        { id: "color", name: "색 섞기", emoji: "🎨", grade: "미술", grades: [1, 2, 3], gen: colors },
        { id: "instrument", name: "악기", emoji: "🎻", grade: "음악", grades: [2, 3, 4], gen: instrument },
        { id: "music", name: "음악 기호", emoji: "🎼", grade: "박자·셈여림", grades: [3, 4, 5], gen: music },
        { id: "sports", name: "스포츠", emoji: "⚽", grade: "체육", grades: [2, 3, 4], gen: sports },
      ],
    },
  ];

  // 🔔 골든벨: 여러 과목·모드에서 골고루 출제
  const allModes = subjects.flatMap((s) => s.modes.map((m) => ({ ...m, subject: s })));
  const bell = (lo, hi) => (lv) => {
    const pool = allModes.filter((m) => m.grades.some((g) => g >= lo && g <= hi));
    const m = pick(pool), p = m.gen(lv);
    return { ...p, text: `${m.subject.emoji} ${p.text}` };
  };
  subjects.push({
    id: "bell", name: "골든벨", emoji: "🔔", color: "#f9a825",
    modes: [
      { id: "bell12", name: "1~2학년 골든벨", emoji: "🐣", grade: "전 과목 섞기", grades: [1, 2], gen: bell(1, 2) },
      { id: "bell34", name: "3~4학년 골든벨", emoji: "🐥", grade: "전 과목 섞기", grades: [3, 4], gen: bell(3, 4) },
      { id: "bell56", name: "5~6학년 골든벨", emoji: "🦅", grade: "전 과목 섞기", grades: [5, 6], gen: bell(5, 6) },
      { id: "bellall", name: "전 학년 골든벨", emoji: "🏆", grade: "모든 문제!", grades: [1, 2, 3, 4, 5, 6], gen: bell(1, 6) },
    ],
  });

  window.KOALA_CONTENT = { initials, subjects };
})();
