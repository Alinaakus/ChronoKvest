// ============ ХроноКвест — логика черновой версии ============
// Принципы игровой механики берём из CLAUDE.md:
// мгновенная реакция, короткие сессии, стрик, лёгкая случайность,
// прогресс-путь, низкая цена ошибки.

// ---------- Вспомогательное ----------
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

// ---------- Блокировка прокрутки фона при открытом модальном окне ----------
// Пока поверх страницы открыта модалка, задний план (страница карточки) не
// должен скроллиться. На iOS Safari одного `overflow: hidden` мало — палец всё
// равно «протаскивает» фон. Поэтому жёстко фиксируем body через position: fixed,
// запоминая текущую позицию прокрутки и возвращая её при закрытии. Счётчик —
// на случай, если вдруг откроется несколько модалок подряд: разблокируем фон
// только когда закрылась последняя.
let _scrollLockY = 0;
let _scrollLockCount = 0;
function lockBodyScroll() {
  if (_scrollLockCount === 0) {
    _scrollLockY = window.scrollY || window.pageYOffset || 0;
    const b = document.body.style;
    b.position = "fixed";
    b.top = `-${_scrollLockY}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    b.overflow = "hidden";
  }
  _scrollLockCount++;
}
function unlockBodyScroll() {
  if (_scrollLockCount === 0) return;
  _scrollLockCount--;
  if (_scrollLockCount === 0) {
    const b = document.body.style;
    b.position = "";
    b.top = "";
    b.left = "";
    b.right = "";
    b.width = "";
    b.overflow = "";
    window.scrollTo(0, _scrollLockY); // возвращаем страницу на прежнее место
  }
}

// Показ/скрытие модального окна вместе с блокировкой прокрутки фона.
// Все модалки проекта должны открываться/закрываться через эти обёртки.
function openModal(id) {
  show(id);
  lockBodyScroll();
}
function closeModal(id) {
  hide(id);
  unlockBodyScroll();
}

// =================== ЗВУКОВОЕ СОПРОВОЖДЕНИЕ (Web Audio API) ===================
// Все звуки синтезируются кодом (без файлов). Единая палитра: мягкие
// треугольные/синусоидные тоны с коротким «колокольным» затуханием и общим
// мастер-гейном. В квизе звуки чуть заметнее — это ключевой эмоциональный момент.
const SOUND_KEY = "hq_sound_v1";

const Sound = (() => {
  let ctx = null, master = null;
  // По умолчанию звук включён; уважаем сохранённый выбор.
  let enabled = localStorage.getItem(SOUND_KEY) !== "off";

  // Ленивая инициализация: контекст создаём/резюмируем только по жесту пользователя
  // (иначе браузеры блокируют автозапуск звука).
  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;                 // очень старый браузер — просто без звука
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Один тон с плавной атакой и экспоненциальным затуханием (общий тембр палитры).
  function tone(freq, at, dur, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || "triangle";
    o.frequency.setValueAtTime(freq, at);
    if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, at + dur);
    const peak = opts.gain != null ? opts.gain : 0.2;
    const attack = opts.attack != null ? opts.attack : 0.008;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + dur + 0.03);
  }

  // Короткий шумовой «свуш» с полосовым фильтром, ползущим вверх (эффект отправления).
  function swoosh(at, dur, peak) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(500, at);
    bp.frequency.exponentialRampToValueAtTime(2600, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(at); src.stop(at + dur + 0.03);
  }

  // Обёртка: играем, только если звук включён и контекст доступен.
  function play(fn) {
    if (!enabled) return;
    if (!ensureCtx()) return;
    fn(ctx.currentTime);
  }

  return {
    isEnabled: () => enabled,
    toggle() {
      enabled = !enabled;
      localStorage.setItem(SOUND_KEY, enabled ? "on" : "off");
      if (enabled) this.hover(); // мягкий блип — подтверждение включения
      return enabled;
    },
    // ВЕРНЫЙ ОТВЕТ: восходящее арпеджио до-мажор — празднично (играет с «танцем» кота).
    correct() {
      play((t) => {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => // C5 E5 G5 C6
          tone(f, t + i * 0.085, i === 3 ? 0.34 : 0.2, { type: "triangle", gain: 0.24, attack: 0.006 }));
      });
    },
    // НЕВЕРНЫЙ ОТВЕТ: мягкая нисходящая пара нот — по-доброму, без резкости.
    wrong() {
      play((t) => {
        tone(392.0, t, 0.26, { type: "sine", gain: 0.18, attack: 0.02 });        // G4
        tone(311.13, t + 0.12, 0.34, { type: "sine", gain: 0.18, attack: 0.02 }); // Eb4
      });
    },
    // НАВЕДЕНИЕ на карточку режима: очень тихий короткий блип.
    hover() {
      play((t) => tone(1568, t, 0.05, { type: "triangle", gain: 0.045, attack: 0.004 })); // G6
    },
    // КНОПКА «Начать путешествие»: восходящий тон + свуш — ощущение отправления.
    depart() {
      play((t) => {
        tone(220, t, 0.42, { type: "triangle", gain: 0.16, attack: 0.02, glideTo: 880 });
        swoosh(t, 0.5, 0.12);
        tone(659.25, t + 0.24, 0.3, { type: "sine", gain: 0.12, attack: 0.01 }); // светлый акцент «прибытия»
      });
    },
  };
})();

// Переключатель звука в верхней панели.
function toggleSound() {
  Sound.toggle();
  updateSoundUI();
}
function updateSoundUI() {
  const btn = $("sound-toggle");
  if (!btn) return;
  const on = Sound.isEnabled();
  btn.classList.toggle("muted", !on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.setAttribute("aria-label", on ? "Выключить звук" : "Включить звук");
  btn.title = on ? "Звук включён" : "Звук выключен";
}

// =================== ПИКСЕЛЬНЫЙ КОТ-МАСКОТ ===================
// Единственный ретро-элемент. Рисуем кота из карты символов в SVG-квадратиках
// (без картинок) — так его легко менять и он всегда чёткий.
const CAT = {
  W: 12,
  H: 13,
  base: [
    ".K........K.",
    "KOK......KOK",
    "KOOK....KOOK",
    "KOOOKKKKOOOK",
    "KOWWOOOOWWOK",
    "KOWEOOOOEWOK",
    "KOOOOPPOOOOK",
    "KOOOWWWWOOOK",
    ".KOOOOOOOOK.",
    ".KOWWWWWWOK.",
    ".KOWWWWWWOK.",
    "..KOOOOOOK..",
    "..KKKKKKKK..",
  ],
  // O — рыжее тело, W — светлое, E — зрачок, P — розовый нос/щёки, K — контур
  colors: { K: "#2b2320", O: "#f4a03c", D: "#e07f2a", W: "#fff7ec", E: "#241d1a", P: "#ff9bb0" },
};

// Выражения мордочки = наборы оверрайдов строк карты (индекс строки → новая строка).
// Меняем только брови (стр.4), глаза (стр.5) и щёки/нос (стр.6) — силуэт один и тот
// же, поэтому все состояния читаются как ОДНА морда с разными эмоциями. У каждого
// состояния по 2 варианта, чтобы реакция не повторялась один в один.
//   O — рыжее тело, W — светлый белок глаза, E — тёмный зрачок, P — щёки/нос, K — контур.
// База (idle) — добрые «мультяшные» глаза 2×2: белок (W, стр.4) + зрачок (E, стр.5).
// Выражения меняют положение зрачков/закрытие глаз/щёки, силуэт неизменен —
// поэтому все состояния читаются как ОДНА морда с разными эмоциями.
const FACES = {
  idle: [
    {},                                                    // спокойный дружелюбный взгляд вперёд
    { 4: "KOWEOOOOEWOK", 5: "KOWWOOOOWWOK" },              // любопытный: глазки смотрят вверх
  ],
  // Радость НЕ меняет лицо: пустой оверрайд = то же нейтральное лицо, что в покое.
  // Эмоция передаётся ТОЛЬКО анимацией «подпрыгивание» (CSS .mascot--happy .cat-stage)
  // и репликой в облачке — никакой отдельной мимики/декора у радости нет.
  happy: [ {} ],
  think: [
    { 4: "KOEWOOOOEWOK", 5: "KOWWOOOOWWOK" }, // взгляд вверх-влево — размышляет
    { 4: "KOWEOOOOWEOK", 5: "KOWWOOOOWWOK" }, // взгляд вверх-вправо (вариант)
  ],
};
// Моргание: верх глаза — гладкий лоб, низ — тёмная чёрточка (глаза закрыты).
const BLINK = { 4: "KOOOOOOOOOOK", 5: "KOKKOOOOKKOK" };

// Собираем строки карты для выражения + варианта (+ опционально моргание).
function catRows(expr, variant, blink) {
  const r = CAT.base.slice();
  const set = (FACES[expr] || FACES.idle);
  const ov = set[variant] || set[0];
  for (const k in ov) r[+k] = ov[k];
  if (blink) { for (const k in BLINK) r[+k] = BLINK[k]; } // моргание перекрывает глаза
  return r;
}

// Собираем SVG кота. opts: { variant, blink }.
function catSVG(expr, px, opts) {
  opts = opts || {};
  const rows = catRows(expr, opts.variant != null ? opts.variant : 0, opts.blink);
  let rects = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === ".") continue;
      rects += `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="${CAT.colors[c]}"/>`;
    }
  });
  const h = Math.round((px * CAT.H) / CAT.W);
  return `<svg class="cat-svg" viewBox="0 0 ${CAT.W} ${CAT.H}" width="${px}" height="${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// Случайный вариант выражения — чтобы реакция каждый раз чуть отличалась.
function randVariant(expr) {
  return Math.floor(Math.random() * (FACES[expr] || FACES.idle).length);
}

// «Живой» кот в покое: редкое случайное моргание. Дыхание/покачивание — на CSS
// (анимируется стабильная обёртка, её innerHTML моргание перерисовывает, а сам
// элемент остаётся — анимация не сбивается). Таймеры в реестре по ключу.
const catBlinkTimers = {};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function stopCatBlink(key) {
  if (catBlinkTimers[key]) { clearTimeout(catBlinkTimers[key]); catBlinkTimers[key] = 0; }
}

// wrap — обёртка, содержащая ТОЛЬКО svg кота. key — ключ таймера. px — ширина.
function liveCat(wrap, key, px) {
  stopCatBlink(key);
  if (!wrap) return;
  wrap.innerHTML = catSVG("idle", px, { variant: 0 }); // спокойное дружелюбное лицо
  if (reducedMotion()) return;                          // «меньше движения» — без морганий
  const loop = () => {
    catBlinkTimers[key] = setTimeout(() => {
      if (!wrap.isConnected) return stopCatBlink(key);
      wrap.innerHTML = catSVG("idle", px, { variant: 0, blink: true }); // глаза закрылись
      setTimeout(() => {
        if (!wrap.isConnected) return stopCatBlink(key);
        wrap.innerHTML = catSVG("idle", px, { variant: 0 });            // и снова открылись
        loop();
      }, 130);
    }, 2600 + Math.random() * 4200); // случайная пауза между морганиями
  };
  loop();
}

// state: "idle" (спокойно ждёт) | "happy" (радость/танец) | "think" (задумался)
// bubbleText — необязательная прямая речь кота: рисуется в облачке над ним.
function renderMascot(state, bubbleText) {
  const bubble = bubbleText
    ? `<div class="bubble bubble--${state}">${bubbleText}</div>`
    : "";
  $("quiz-mascot").innerHTML =
    `<div class="mascot mascot--${state}">` +
    bubble +
    `<div class="cat-stage"></div>` +
    `<div class="fx fx--think">?</div>` +
    `</div>`;
  const stage = $("quiz-mascot").querySelector(".cat-stage");
  if (state === "happy" || state === "think") {
    stopCatBlink("quiz");                                       // реакция — без морганий
    stage.innerHTML = catSVG(state, 84, { variant: randVariant(state) });
  } else {
    liveCat(stage, "quiz", 84);                                 // покой — моргает и «дышит»
  }
}

// Прямая речь кота (от первого лица, без эмодзи) — показывается в облачке.
// Верный ответ:
const HAPPY_LINES = [
  "Ура, ты молодец!",
  "О, пожалуй, потанцую!",
  "Тебе суждено 100 баллов!",
  "Есть! Ты справился!",
  "Точно в яблочко!",
  "Вот это память!",
  "Красавчик, погнали дальше!",
  "Я в тебя верил!",
  "Ещё одна дата в кармане!",
  "Так держать!",
  "Мозг работает на все сто!",
  "Как будто ты там был!",
  "Подозреваю, у тебя машина времени!",
  "Мурлычу от гордости за тебя!",
  "Ну ты монстр, вообще-то!",
  "Даже я так быстро не вспомнил бы!",
  "Имба, а не ответ!",
  "Заслуженный лойс от меня!",
  "Окак",
];
// Неверный ответ:
const THINK_LINES = [
  "Ничего страшного!",
  "Ой, что-то я призадумался...",
  "Почти! Давай ещё раз глянем.",
  "Бывает, не расстраивайся!",
  "Чуть-чуть не в ту сторону.",
  "Хорошая попытка!",
  "Не в этот раз, но в следующий точно!",
  "Ой, что-то я замечтался...",
  "Кажется, я запутался в веках!",
  "Мяу, промазал!",
  "Кто-то тут перепутал столетия!",
  "Упс, машина времени сломалась!",
  "Я тоже иногда путаю даты, чесслово!",
];

// =================== ЛОКАЛЬНЫЙ ПРОГРЕСС УЧЕНИКА ===================
// Всё хранится ТОЛЬКО в браузере (localStorage) — без сервера, базы и запросов.
// Один объект: статистика по каждой дате + серия дней.
const STORE_KEY = "hq_progress_v1";

function defaultProgress() {
  // round — «часы» интервального повторения: растёт на 1 за каждый пройденный раунд.
  return { dates: {}, streakDays: 0, lastVisit: null, round: 0 };
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || defaultProgress();
  } catch (e) {
    return defaultProgress(); // если данные повреждены — начинаем заново
  }
}

let progress = loadProgress();
if (progress.round == null) progress.round = 0; // миграция старых сохранений

function saveProgress() {
  localStorage.setItem(STORE_KEY, JSON.stringify(progress));
}

// Статистика по одной дате:
//   correct/wrong — всего верных/неверных ответов;
//   streak — сколько верных ПОДРЯД прямо сейчас;
//   hard — попала ли дата в «сложные».
function emptyStat() {
  // streak — верных ПОДРЯД; wrongStreak — ошибок ПОДРЯД; hard — флаг «сложная».
  return { correct: 0, wrong: 0, streak: 0, wrongStreak: 0, hard: false };
}
function statOf(id) {
  const d = progress.dates[id] || (progress.dates[id] = emptyStat());
  if (d.wrongStreak === undefined) d.wrongStreak = 0; // миграция старых записей
  return d;
}

// Прочитать статистику, не создавая запись (для показа).
function readStat(id) {
  return progress.dates[id] || emptyStat();
}

// Записать ответ из квиза по конкретной дате.
function recordAnswer(id, isCorrect) {
  const s = statOf(id);
  s.seenRound = progress.round; // отметка «показана в этом раунде» — для интервалов
  if (isCorrect) {
    s.correct++;
    s.streak++;          // серия верных растёт
    s.wrongStreak = 0;   // серия ошибок обнулилась
    if (s.streak >= 2) s.hard = false; // 2 верных подряд — убираем из «сложных»
  } else {
    s.wrong++;
    s.wrongStreak++;     // серия ошибок растёт
    s.streak = 0;        // серия верных обнулилась (в т.ч. слетает «выучено»)
    if (s.wrongStreak >= 2) s.hard = true; // 2 ошибки ПОДРЯД — дата «сложная»
  }
  saveProgress();
}

// Дата «выучена» — 3 верных ответа подряд без ошибок между ними.
function isMastered(id) {
  return readStat(id).streak >= 3;
}
function masteredCount() {
  return CARDS.filter((c) => isMastered(c.id)).length;
}
function hardCards() {
  return CARDS.filter((c) => readStat(c.id).hard && !isMastered(c.id));
}

// Статус даты: "mastered" (выучено) | "hard" (сложная) | "progress" (в процессе).
function statusOf(id) {
  if (isMastered(id)) return "mastered";
  if (readStat(id).hard) return "hard";
  return "progress";
}

// =================== ДИАПАЗОН ТРЕНИРОВКИ (пул для раундов) ===================
// Диапазон НЕ меняет механику раундов по 7 — он лишь задаёт, из каких карточек
// эти раунды собираются. Хранится отдельно от прогресса, в своём ключе.
//   mode "all"      — все карточки (поведение по умолчанию);
//   mode "mastered" — только выученные (по статистике прогресса);
//   mode "range"    — срез списка по ПОРЯДКУ [from..to] (индексы, не годы).
const RANGE_KEY = "hq_range_v1";

function defaultRange() {
  return { mode: "all", from: 0, to: CARDS.length - 1 };
}

// Читаем сохранённый выбор и «подчищаем» его под текущие данные (список мог измениться).
function loadRange() {
  let r;
  try { r = JSON.parse(localStorage.getItem(RANGE_KEY)); } catch (e) { r = null; }
  if (!r || !r.mode) return defaultRange();
  const last = CARDS.length - 1;
  r.from = Math.max(0, Math.min(Number(r.from) || 0, last));
  r.to = Math.max(r.from, Math.min(Number(r.to == null ? last : r.to), last));
  return r;
}

let rangeSel = loadRange();

function saveRange() {
  localStorage.setItem(RANGE_KEY, JSON.stringify(rangeSel));
}

// Пул карточек текущего диапазона — из него buildSession() собирает раунды.
function rangePool() {
  if (rangeSel.mode === "mastered") return CARDS.filter((c) => isMastered(c.id));
  if (rangeSel.mode === "hard") return hardCards(); // те же «сложные», что и в «Моём прогрессе»
  if (rangeSel.mode === "range") {
    const last = CARDS.length - 1;
    const from = Math.max(0, Math.min(rangeSel.from, last));
    const to = Math.max(from, Math.min(rangeSel.to, last));
    return CARDS.slice(from, to + 1);
  }
  return CARDS; // "all"
}

// Какому пресету соответствует текущий выбор (для подсветки кнопки) — или null.
function presetOf(sel) {
  if (sel.mode === "all") return "all";
  if (sel.mode === "mastered") return "mastered";
  if (sel.mode === "hard") return "hard";
  if (sel.mode === "range" && sel.from === 0 && sel.to === Math.min(19, CARDS.length - 1)) return "first20";
  if (sel.mode === "range" && sel.from === 0 && sel.to === Math.min(49, CARDS.length - 1)) return "first50";
  return null; // произвольный ручной диапазон
}

// Короткая подпись диапазона для шапки раунда.
function rangeLabel() {
  const p = presetOf(rangeSel);
  if (p === "all") return "Все " + CARDS.length;
  if (p === "mastered") return "Выученные";
  if (p === "hard") return "Сложные";
  if (p === "first20") return "Первые 20";
  if (p === "first50") return "Первые 50";
  return `№${rangeSel.from + 1}–${rangeSel.to + 1}`; // порядковые номера в списке
}

// Склонение слова «дата» (1 дата, 2 даты, 5 дат).
function dateWord(n) {
  const a = Math.abs(n) % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return "дат";
  if (b === 1) return "дата";
  if (b >= 2 && b <= 4) return "даты";
  return "дат";
}

function showScreen(name) {
  ["hero", "menu", "learn", "quiz", "done", "progress", "flip", "guide", "about", "setup"].forEach((s) => hide("screen-" + s));
  show("screen-" + name);
  updateTopbar(name);
  window.scrollTo(0, 0); // новый экран всегда открываем с начала (важно для длинной статьи)
}

// Закреплённая верхняя панель: видна во всех разделах, КРОМЕ hero и меню.
// Подсвечивает активный раздел его цветом.
function updateTopbar(name) {
  const bar = $("topbar");
  if (!bar) return;
  const hideBar = name === "hero" || name === "menu";
  bar.classList.toggle("hidden", hideBar);
  // На экране настройки подсвечиваем тот раздел, который сейчас настраивается.
  const activeSec = name === "setup" ? setupTarget : name;
  document.querySelectorAll(".tlink").forEach((l) => {
    l.classList.toggle("active", l.dataset.sec === activeSec);
  });
}

// Формулировки события у карточки: всегда возвращаем массив.
// Если у старой карточки вдруг остался одиночный `event` — не ломаемся.
function eventsOf(card) {
  if (Array.isArray(card.events) && card.events.length) return card.events;
  return [card.event];
}

// Случайный элемент массива (для выбора формулировки в квизе).
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Случайная реплика БЕЗ повтора предыдущей (по ключу набора) — чтобы реакции
// кота не приедались при нескольких верных/неверных ответах подряд.
function pickFresh(arr, key) {
  if (arr.length < 2) return arr[0];
  let pick;
  do { pick = arr[Math.floor(Math.random() * arr.length)]; }
  while (pick === pickFresh._last[key]);
  pickFresh._last[key] = pick;
  return pick;
}
pickFresh._last = {};

// Генерация 3 неправильных вариантов («обманок») для квиза прямо из даты.
// Берём все числа в строке даты и сдвигаем их на небольшую величину,
// сохраняя формат ответа: «1380 год» → «1378 год», «964–966 годы» →
// «962–964 годы», «1650-е годы» → «1660-е годы». Так не нужно прописывать
// варианты руками — они получаются автоматически для любой даты с цифрами.
function generateDistractors(dateStr, count) {
  const nums = dateStr.match(/\d+/g);
  if (!nums) return []; // например «VI–VIII века» — цифр нет, генерировать нечего
  const isDecade = /-е/.test(dateStr); // десятилетие: «1650-е» → шаг 10, а не 1
  const step = isDecade ? 10 : 1;
  // Набор сдвигов (в шагах); перемешиваем, берём первые подходящие.
  const pool = isDecade
    ? [1, 2, 3, -1, -2, -3]
    : [1, 2, 3, 4, 5, -1, -2, -3, -4, -5];
  const result = [];
  for (const k of shuffle(pool)) {
    if (result.length >= count) break;
    const offset = k * step;
    // Сдвигаем каждое число в строке на offset — формат («год», «-е», диапазон) сохраняется.
    const variant = dateStr.replace(/\d+/g, (n) => String(Number(n) + offset));
    if (variant !== dateStr && !result.includes(variant)) result.push(variant);
  }
  return result;
}

// Итоговый список вариантов для карточки в квизе.
// Если у карточки уже прописаны реальные варианты (4 и больше) — используем их
// (так работают 3 стартовые карточки и любые ручные исключения в будущем).
// Иначе — правильный ответ + 3 сгенерированные «обманки».
function buildOptions(card) {
  if (Array.isArray(card.options) && card.options.length >= 4) {
    return card.options;
  }
  const distractors = generateDistractors(card.date, 3);
  if (distractors.length < 3) {
    // Не удалось сгенерировать (нет цифр в дате) — отдаём что есть, без падения.
    return card.options && card.options.length ? card.options : [card.answer];
  }
  return [card.answer, ...distractors];
}

// ---------- Стрик (серия дней подряд) ----------
// Считаем дни занятий подряд и храним внутри общего объекта прогресса.
function updateStreak() {
  const today = new Date().toDateString();
  if (progress.lastVisit !== today) {
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    // продолжили серию (заходили вчера) или начали заново
    progress.streakDays = progress.lastVisit === yesterday ? progress.streakDays + 1 : 1;
    progress.lastVisit = today;
    saveProgress();
  }
  renderStreak();
}

// Универсальное склонение по числу (русское правило).
// forms = [одна, две-четыре, пять-и-больше]. Пример: plural(2, ["день","дня","дней"]) → "дня".
function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

// Готовые наборы форм для счётных фраз интерфейса (число + фраза).
const WORD = {
  day:     ["день", "дня", "дней"],                         // серия дней
  learned: ["дата выучена", "даты выучены", "дат выучено"], // прогресс: сколько дат выучено
  hard:    ["сложная дата", "сложные даты", "сложных дат"], // сколько дат «сложные»
};

// Обёртка для серии дней (используется и в бейдже, и в плитках). Сохраняем имя.
function dayWord(n) { return plural(n, WORD.day); }

// Понятная подпись серии: «🔥 3 дня подряд».
function renderStreak() {
  const el = $("streak-badge");
  if (el) el.textContent = `🔥 ${progress.streakDays} ${dayWord(progress.streakDays)} подряд`;
}

// ---------- Путь по эпохам (визуальный прогресс) ----------
// Ряд точек убран (с 101 датой он переполнялся и читался как артефакт).
// Функция оставлена безопасной заглушкой, чтобы её вызовы из режимов не падали.
// Идея «истории по эпохам» теперь живёт в списке дат (группировка ниже).
function renderPath(doneSet, currentId) {
  const path = $("path");
  if (!path) return;
  path.innerHTML = "";
  CARDS.forEach((card, i) => {
    if (i > 0) {
      const line = document.createElement("div");
      line.className = "line";
      path.appendChild(line);
    }
    const dot = document.createElement("div");
    dot.className = "dot";
    if (doneSet.has(card.id)) dot.classList.add("done");
    if (card.id === currentId) dot.classList.add("current");
    path.appendChild(dot);
  });
}

// =================== РЕЖИМ ОБУЧЕНИЯ ===================
let learnIndex = 0;

function startLearn() {
  learnIndex = 0;
  showScreen("learn");
  renderLearnCard();
}

// =================== «ТИПОГРАФСКИЙ ПЛАКАТ» (оформление карточки обучения) ===================
// Применяется ко ВСЕМ карточкам обучения: крупный год (группы цифр — цветом и лёгким
// интервалом, без «часов»/двоеточия) + таймлайн с точкой положения даты в истории.

// Общая шкала таймлайна (год начала истории курса → современность).
// Левый край расширен до 500, чтобы дата «VI–VIII века» (~500–800) попадала на шкалу.
const TL_START = 500, TL_END = 2000;

// Римское число → арабское (для дат-веков вроде «VI–VIII века»).
function romanToInt(s) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = map[s[i]], next = map[s[i + 1]] || 0;
    n += cur < next ? -cur : cur;
  }
  return n;
}

// Год-«позиция» карточки на шкале: середина периода. Арабские годы — как есть;
// века — переводим в годы (VI век = 501..600), берём середину диапазона.
function posYear(card) {
  const nums = String(card.date).match(/\d+/g);
  if (nums) {
    const v = nums.map(Number);
    return (Math.min(...v) + Math.max(...v)) / 2;
  }
  const rom = String(card.date).match(/[IVXLCDM]+/g);
  if (rom) {
    const c = rom.map(romanToInt);
    const lo = (Math.min(...c) - 1) * 100 + 1, hi = Math.max(...c) * 100;
    return (lo + hi) / 2;
  }
  return TL_START;
}

// Разбор даты на крупные «части» + подпись (год/годы/века).
// 4-значный одиночный год → две пары (18 | 12), акцент на второй.
// Диапазон / римские века → делим по тире, акцент на последней части.
function buildTypo(card) {
  const raw = String(card.date).trim();
  const suffMatch = raw.match(/(годы|года|год|веков|века|век)$/i);
  const suffix = suffMatch ? suffMatch[0] : "";
  const core = (suffix ? raw.slice(0, raw.length - suffix.length) : raw).trim();

  // Десятилетие: «1650-е» → пары «16 | 50-е» (суффикс «-е» держим при второй паре).
  const dec = core.match(/^(\d{3,4})-е$/);
  if (dec) {
    const s = dec[1], cut = s.length === 4 ? 2 : 1;
    return { parts: [{ t: s.slice(0, cut) }, { t: s.slice(cut) + "-е", accent: true }], suffix };
  }

  // Одиночный год 3–4 цифры → две группы (18 | 12), акцент на второй. Не часы:
  // разделяем только цветом и лёгким интервалом, без двоеточия.
  const single = core.match(/^\d{3,4}$/);
  if (single) {
    const s = core, cut = s.length === 4 ? 2 : 1; // 4→2+2, 3→1+2
    return { parts: [{ t: s.slice(0, cut) }, { t: s.slice(cut), accent: true }], suffix };
  }
  // Разделители тире сохраняем как отдельные части (рендерим без акцента).
  const chunks = core.split(/([–—-])/).filter((x) => x !== "");
  let lastVal = -1;
  chunks.forEach((c, i) => { if (/[0-9IVXLCDM]/i.test(c)) lastVal = i; });
  return { parts: chunks.map((t, i) => ({ t, accent: i === lastVal })), suffix };
}

// Собрать разметку «типографского плаката» для карточки.
function typoPosterHTML(card, forms) {
  const idx = CARDS.indexOf(card);
  const epoch = EPOCHS[epochIndexOf(card)].name;
  const { parts, suffix } = buildTypo(card);
  const pos = Math.max(3, Math.min(97, ((posYear(card) - TL_START) / (TL_END - TL_START)) * 100));
  const numHTML = parts
    .map((p) => `<span class="${p.accent ? "typo-accent" : ""}">${p.t}</span>`)
    .join("");
  // Размер числа подстраиваем под длину: короткий год — крупно, длинный диапазон — мельче.
  const glyphs = parts.map((p) => p.t).join("").length;
  const sz = glyphs <= 4 ? "sz-l" : glyphs <= 9 ? "sz-m" : "sz-s";
  return (
    `<div class="typo">` +
      `<div class="typo-meta"><span>${epoch}</span><span>№ ${idx + 1} · ${CARDS.length}</span></div>` +
      `<div class="typo-hero">` +
        `<div class="typo-num ${sz}">${numHTML}</div>` +
        (suffix ? `<div class="typo-suffix">${suffix}</div>` : "") +
      `</div>` +
      `<div class="typo-timeline">` +
        `<div class="typo-rail"><span class="typo-pin" style="left:${pos}%"></span></div>` +
        `<div class="typo-ends"><span>${TL_START}</span><span>${TL_END}</span></div>` +
      `</div>` +
      `<div class="typo-event">${forms[0]}</div>` +
    `</div>`
  );
}

function renderLearnCard() {
  const card = CARDS[learnIndex];
  const forms = eventsOf(card);

  // Все карточки обучения — в стиле «типографский плакат» (крупный год + таймлайн).
  $("learn-poster").innerHTML = typoPosterHTML(card, forms);
  show("learn-poster");
  // Дефолтные иллюстрация/крупная дата/событие больше не нужны — прячем.
  ["learn-illustration", "learn-date", "learn-event"].forEach((id) => hide(id));

  // Прочие формулировки события (как спросят иначе на ЕГЭ) — под плакатом.
  const alts = forms.slice(1);
  $("learn-event-alts").textContent = alts.length
    ? "Также встречается как: " + alts.join("; ")
    : "";

  $("learn-context").textContent = card.context;
  $("learn-lifehack").textContent = card.lifehack;
  // Если у карточки нет лайфхака — прячем весь блок, чтобы не висел пустой заголовок.
  const lifehackBlock = $("learn-lifehack").closest(".block-lifehack");
  if (lifehackBlock) lifehackBlock.style.display = card.lifehack ? "" : "none";

  renderAssoc(); // личная ассоциация пользователя (localStorage)

  // путь: пройденными считаем все карточки до текущей
  const done = new Set(CARDS.slice(0, learnIndex).map((c) => c.id));
  renderPath(done, card.id);

  // «Назад» появляется только со 2-й карточки (на первой — скрыта, но место держит).
  $("learn-prev").style.visibility = learnIndex === 0 ? "hidden" : "visible";
  $("learn-next").textContent =
    learnIndex === CARDS.length - 1 ? "Завершить ✓" : "Далее →";
}

// ---------- Своя ассоциация (личная заметка к дате) ----------
// Храним в localStorage как объект { [id даты]: "текст" }.
const ASSOC_KEY = "hq_assoc_v1";
const ASSOC_MAX = 300;

function loadAssocs() {
  try {
    return JSON.parse(localStorage.getItem(ASSOC_KEY)) || {};
  } catch (e) {
    return {}; // если данные повреждены — считаем, что ассоциаций нет
  }
}
function saveAssocs(obj) {
  localStorage.setItem(ASSOC_KEY, JSON.stringify(obj));
}
// Текст ассоциации для текущей карточки обучения ("" — если нет).
function currentAssoc() {
  const card = CARDS[learnIndex];
  return card ? (loadAssocs()[card.id] || "") : "";
}

// Показать нужное состояние: сохранённый блок / кнопку / (редактор прячем).
function renderAssoc() {
  const block = $("learn-assoc-block");
  const add = $("learn-assoc-add");
  const editor = $("learn-assoc-editor");
  if (!block || !add || !editor) return;

  editor.classList.add("hidden"); // при смене карточки редактор всегда закрыт
  const text = currentAssoc();
  if (text) {
    $("learn-assoc-text").textContent = text;
    block.classList.remove("hidden");
    add.classList.add("hidden");
  } else {
    block.classList.add("hidden");
    add.classList.remove("hidden");
  }
}

// Обновить счётчик символов под полем ввода.
function updateAssocCounter() {
  const input = $("learn-assoc-input");
  const counter = $("learn-assoc-counter");
  if (input && counter) counter.textContent = `${input.value.length} / ${ASSOC_MAX}`;
}

// Открыть редактор (для новой ассоциации или для правки существующей).
function openAssocEditor() {
  const input = $("learn-assoc-input");
  input.value = currentAssoc();               // пусто для новой, текст — для правки
  $("learn-assoc-block").classList.add("hidden");
  $("learn-assoc-add").classList.add("hidden");
  $("learn-assoc-editor").classList.remove("hidden");
  updateAssocCounter();
  input.focus();
}
function editAssoc() { openAssocEditor(); }

// Сохранить: пустой текст трактуем как отмену/удаление, иначе пишем в хранилище.
function saveAssoc() {
  const card = CARDS[learnIndex];
  if (!card) return;
  const text = $("learn-assoc-input").value.trim().slice(0, ASSOC_MAX);
  const all = loadAssocs();
  if (text) all[card.id] = text;
  else delete all[card.id];
  saveAssocs(all);
  renderAssoc();
}
function cancelAssoc() {
  renderAssoc(); // просто вернуть предыдущее состояние (блок или кнопку)
}

// Удалить ассоциацию (с подтверждением, чтобы не потерять по случайному нажатию).
function deleteAssoc() {
  const card = CARDS[learnIndex];
  if (!card) return;
  if (!confirm("Удалить свою ассоциацию к этой дате?")) return;
  const all = loadAssocs();
  delete all[card.id];
  saveAssocs(all);
  renderAssoc();
}

// Шаг назад по карточкам обучения (к предыдущей дате).
function learnPrev() {
  if (learnIndex > 0) {
    learnIndex--;
    renderLearnCard();
  }
}

// ---------- Быстрый переход к любой дате (модалка со списком + поиск) ----------
function openJump() {
  $("jump-search").value = "";
  renderJumpList();
  openModal("jump-modal");
  $("jump-search").focus();
}
function closeJump() {
  closeModal("jump-modal");
}

// Одна строка даты в списке быстрого перехода.
function jumpItemHTML(c) {
  return (
    `<button class="jump-item" onclick="jumpTo(${c.id})">` +
    `<span class="jump-date">${c.date}</span>` +
    `<span class="jump-event">${eventsOf(c)[0]}</span>` +
    `</button>`
  );
}

// Список дат в модалке. Без поиска — сгруппирован по эпохам (с заголовками);
// при поиске — плоский список совпадений (год или текст события).
function renderJumpList() {
  const q = $("jump-search").value.trim().toLowerCase();
  const box = $("jump-list");

  if (q) {
    const items = CARDS.filter((c) =>
      (c.date + " " + eventsOf(c).join(" ")).toLowerCase().includes(q)
    );
    box.innerHTML = items.length
      ? items.map(jumpItemHTML).join("")
      : `<div class="empty">Ничего не найдено.</div>`;
    return;
  }

  box.innerHTML = groupByEpoch(CARDS)
    .map(
      (g) =>
        `<div class="jump-epoch">${g.name}</div>` + g.cards.map(jumpItemHTML).join("")
    )
    .join("");
}

// Переход к выбранной дате: закрываем модалку и открываем её в обучении.
function jumpTo(id) {
  closeJump();
  openLearnAt(id);
}

function learnNext() {
  if (learnIndex < CARDS.length - 1) {
    learnIndex++;
    renderLearnCard();
  } else {
    showDone("📚", "Ты дошёл до конца", "Все даты просмотрены. Теперь проверь себя в квизе!", [
      { label: "В квиз →", cls: "btn-primary", fn: startQuiz },
      { label: "В меню", cls: "btn-ghost", fn: goMenu },
    ]);
  }
}

// =================== РЕЖИМ КВИЗА ===================
let quizQueue = [];      // карточки текущего раунда
let quizCard = null;     // текущая карточка
let roundCorrect = 0;    // верных ответов в раунде
let roundTotal = 0;      // всего карточек в раунде

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// =================== ИНТЕРВАЛЬНОЕ ПОВТОРЕНИЕ (метод Лейтнера) ===================
// Раунд — короткая сессия из SESSION_SIZE карточек. Слабые/просроченные даты
// возвращаются часто, выученные — редко. «Часы» — счётчик пройденных раундов.
const SESSION_SIZE = 7;              // карточек в одном раунде (короткая сессия)
const SR_INTERVALS = [1, 2, 4, 8, 16]; // через сколько раундов повторить (по «коробке»)

// «Коробка» даты = серия верных подряд, обрезанная до размеров таблицы интервалов.
// Ошибка сбрасывает streak в 0 → коробка 0 → интервал 1 (вернётся уже в след. раунде).
function boxOf(id) {
  return Math.min(readStat(id).streak, SR_INTERVALS.length - 1);
}

// Пора ли показывать дату: не видели ни разу — да; иначе если прошёл её интервал.
function isDue(id, round) {
  const s = progress.dates[id];
  if (!s || s.seenRound == null) return true;
  return round - s.seenRound >= SR_INTERVALS[boxOf(id)];
}

// Приоритет карточки для попадания в раунд. Чем больше — тем нужнее показать.
// Порядок: сложные/только что заваленные → новые (вводим умеренно) → лёгкое
// повторение → и лишь потом (как «добивка») ещё не просроченные, давно не виденные.
function scoreCard(c, round) {
  const s = progress.dates[c.id];
  const neverSeen = !s || s.seenRound == null;
  const wait = neverSeen ? 0 : round - s.seenRound;
  // Не пора повторять — уводим в минус (берём такие, только если раунд не добрали).
  if (!isDue(c.id, round)) return -10000 + (round - (s ? s.seenRound : 0));
  if (neverSeen) return 260 + Math.random() * 10;           // новая дата — вводим умеренно
  const box = boxOf(c.id);                                   // 0 = слабая, выше — крепче
  const base = (s.hard ? 400 : 0) + (SR_INTERVALS.length - box) * 60;
  return base + Math.min(wait, 30) + Math.random() * 10;     // wait — лёгкий добор, случайность (#5)
}

// Собрать раунд из `size` карточек по приоритету интервального повторения.
// pool — из каких карточек собирать (диапазон тренировки). По умолчанию — все.
function buildSession(size, pool = CARDS) {
  const round = progress.round || 0;
  const scored = pool.map((c) => ({
    c,
    score: scoreCard(c, round),
    neverSeen: !progress.dates[c.id] || progress.dates[c.id].seenRound == null,
  }));
  scored.sort((a, b) => b.score - a.score);

  // Новых карточек за раунд — не больше половины, чтобы повторение не тонуло в новом.
  const maxNew = Math.ceil(size / 2);
  const picked = [];
  let newCount = 0;
  for (const it of scored) {
    if (picked.length >= size) break;
    if (it.neverSeen && newCount >= maxNew) continue;
    if (it.neverSeen) newCount++;
    picked.push(it.c);
  }
  // Если из-за лимита новых не добрали — досыпаем оставшимися по приоритету.
  if (picked.length < size) {
    for (const it of scored) {
      if (picked.length >= size) break;
      if (!picked.includes(it.c)) picked.push(it.c);
    }
  }
  return shuffle(picked); // порядок внутри раунда — вперемешку
}

// «Квиз» из меню/навбара сначала показывает выбор диапазона (запомненный).
function startQuiz() {
  openSetup("quiz");
}

// Реальный запуск раунда квиза из выбранного пула. Пул по умолчанию — диапазон.
function runQuiz(pool = rangePool()) {
  if (!pool.length) { openSetup("quiz"); return; } // пусто (напр. 0 выученных) — назад к выбору
  quizQueue = buildSession(SESSION_SIZE, pool);
  roundTotal = quizQueue.length;
  roundCorrect = 0;
  showScreen("quiz");
  nextQuizCard();
}

function nextQuizCard() {
  if (quizQueue.length === 0) {
    finishQuizRound();
    return;
  }
  quizCard = quizQueue.shift();
  // Прогресс раунда в шапке карточки: «Вопрос 3 из 7».
  const num = roundTotal - quizQueue.length;
  $("quiz-progress").textContent = `Вопрос ${num} из ${roundTotal} · ${rangeLabel()}`;
  // Случайно выбираем одну из формулировок события — тренируем узнавание
  // даты по разным вариантам условия (как на реальном ЕГЭ).
  $("quiz-event").textContent = pickRandom(eventsOf(quizCard));
  renderMascot("idle"); // кот спокойно ждёт ответа
  hide("quiz-feedback");
  $("quiz-feedback").innerHTML = "";

  // варианты ответа (тоже перемешиваем — непредсказуемость)
  const box = $("quiz-options");
  box.innerHTML = "";
  shuffle(buildOptions(quizCard)).forEach((opt) => {
    const b = document.createElement("button");
    b.className = "option";
    b.textContent = opt;
    b.onclick = () => answer(opt, b);
    box.appendChild(b);
  });
}

// Итог раунда: сдвигаем «часы» повторения на 1 и показываем экран результата.
function finishQuizRound() {
  progress.round++;
  saveProgress();
  const n = roundTotal;
  let emoji, title, text;
  if (roundCorrect === n) {
    emoji = "🎉"; title = "Идеальный раунд!";
    text = `${roundCorrect} из ${n} верно — так держать!`;
  } else if (roundCorrect >= Math.ceil(n * 0.6)) {
    emoji = "👍"; title = "Раунд пройден!";
    text = `${roundCorrect} из ${n} верно. Даты с ошибками вернутся в следующем раунде.`;
  } else {
    emoji = "💪"; title = "Раунд пройден";
    text = `${roundCorrect} из ${n} верно. Это нормально — сложные даты система покажет чаще.`;
  }
  showDone(emoji, title, text, [
    { label: "Ещё раунд →", cls: "btn-primary", fn: () => runQuiz() },
    { label: "Сменить диапазон", cls: "btn-secondary", fn: startQuiz },
    { label: "В меню", cls: "btn-ghost", fn: goMenu },
  ]);
}

function answer(choice, btn) {
  // блокируем повторные нажатия
  document.querySelectorAll(".option").forEach((o) => (o.onclick = null));
  const fb = $("quiz-feedback");
  show("quiz-feedback");

  const isLast = quizQueue.length === 0; // последний вопрос раунда
  if (choice === quizCard.answer) {
    // ✅ Кот увеличивается и танцует, а его реплика — в облачке (прямая речь).
    //    Никаких подписей от третьего лица: область фидбэка — только кнопка.
    btn.classList.add("correct");
    roundCorrect++;
    recordAnswer(quizCard.id, true); // сохраняем прогресс по дате
    Sound.correct();                 // праздничное арпеджио — синхронно с «танцем» кота
    renderMascot("happy", pickFresh(HAPPY_LINES, "happy"));
    fb.className = "feedback";
    fb.innerHTML = "";
    addContinueButton(fb, isLast ? "Итог раунда →" : "Дальше →");
  } else {
    // 🟠 Мягкая ошибка: реплика кота — в облачке (прямая речь, без объяснений
    //    от третьего лица). Подсвечиваем верный вариант и возвращаемся к лайфхаку.
    //    Переспрашивать в этом же раунде не нужно: интервальное повторение само
    //    вернёт эту дату следующим раундом (её «коробка» сбросилась в 0).
    btn.classList.add("wrong");
    recordAnswer(quizCard.id, false); // сохраняем прогресс по дате
    Sound.wrong();                    // мягкий добрый звук — синхронно с «задумался»
    document.querySelectorAll(".option").forEach((o) => {
      if (o.textContent === quizCard.answer) o.classList.add("correct");
    });
    renderMascot("think", pickFresh(THINK_LINES, "think"));
    fb.className = "feedback soft";
    fb.innerHTML =
      `Правильно: <b>${quizCard.answer}</b>. Вернёмся к лайфхаку:` +
      `<div class="assoc-reminder">💡 ${quizCard.lifehack}</div>`;
    addContinueButton(fb, isLast ? "Итог раунда →" : "Понятно, дальше →");
  }
}

function addContinueButton(container, label) {
  const b = document.createElement("button");
  b.className = "btn btn-primary";
  b.style.marginTop = "14px";
  b.textContent = label;
  b.onclick = nextQuizCard;
  container.appendChild(b);
}

// =================== ЭКРАН ВЫБОРА ДИАПАЗОНА (перед квизом/карточками) ===================
// Общий для обоих режимов: показывает пресеты + ручной диапазон, запоминает выбор.
let setupTarget = "quiz"; // какой режим запустится после выбора: "quiz" | "flip"

// Открыть экран выбора диапазона перед нужным режимом.
function openSetup(target) {
  setupTarget = target;
  // Пробрасываем режим на экран — CSS по нему подберёт акцентный цвет
  // (зелёный для квиза, оранжевый для режима карточек).
  $("screen-setup").dataset.mode = target;
  $("setup-kicker").textContent = target === "quiz" ? "Квиз" : "Режим карточек";
  $("preset-all").textContent = "Все даты (" + CARDS.length + ")";
  buildRangeSelects();
  syncSetupUI();
  showScreen("setup");
}

// Заполнить оба выпадающих списка карточками ПО ПОРЯДКУ (один раз).
function buildRangeSelects() {
  const from = $("range-from"), to = $("range-to");
  if (from.childElementCount) return; // уже собраны
  const opts = CARDS.map((c, i) => {
    let ev = eventsOf(c)[0];
    if (ev.length > 42) ev = ev.slice(0, 40) + "…"; // не раздуваем список
    return `<option value="${i}">${i + 1}. ${c.date} — ${ev}</option>`;
  }).join("");
  from.innerHTML = opts;
  to.innerHTML = opts;
}

// Клик по пресету: задаём диапазон, сохраняем, обновляем интерфейс.
function applyPreset(p) {
  const last = CARDS.length - 1;
  if (p === "first20") rangeSel = { mode: "range", from: 0, to: Math.min(19, last) };
  else if (p === "first50") rangeSel = { mode: "range", from: 0, to: Math.min(49, last) };
  else if (p === "mastered") rangeSel = { mode: "mastered", from: 0, to: last };
  else if (p === "hard") rangeSel = { mode: "hard", from: 0, to: last };
  else rangeSel = { mode: "all", from: 0, to: last };
  saveRange();
  syncSetupUI();
}

// Правка ручного диапазона через выпадающие списки. Держим from ≤ to.
function onRangeInput(which) {
  let from = Number($("range-from").value);
  let to = Number($("range-to").value);
  if (which === "from" && from > to) to = from;
  if (which === "to" && to < from) from = to;
  rangeSel = { mode: "range", from, to };
  saveRange();
  syncSetupUI();
}

// Отразить текущий выбор в интерфейсе: подсветка пресета, значения списков, сводка.
function syncSetupUI() {
  const active = presetOf(rangeSel);
  document.querySelectorAll(".preset").forEach((b) =>
    b.classList.toggle("active", b.dataset.preset === active)
  );

  // «Все выученные» и «Сложные» — фильтры по статусу, а не по порядку списка.
  const statusMode = rangeSel.mode === "mastered" || rangeSel.mode === "hard";
  // Списки показывают эффективный диапазон (для "all" — весь список).
  if (rangeSel.mode === "range") {
    $("range-from").value = rangeSel.from;
    $("range-to").value = rangeSel.to;
  } else if (rangeSel.mode === "all") {
    $("range-from").value = 0;
    $("range-to").value = CARDS.length - 1;
  }
  // В режимах «по статусу» ручной диапазон не задаёт пул — приглушаем его.
  $("setup-range").classList.toggle("disabled", statusMode);
  $("range-from").disabled = statusMode;
  $("range-to").disabled = statusMode;

  // Сводка «сколько дат в пуле» + доступность кнопки старта.
  const n = rangePool().length;
  const per = Math.min(SESSION_SIZE, n);
  let text;
  if (rangeSel.mode === "mastered") {
    text = n
      ? `В пуле ${n} выученных ${dateWord(n)}. Раунды по ${per} собираются из них.`
      : `Пока нет выученных дат — сначала пройди несколько в квизе или выбери другой диапазон.`;
  } else if (rangeSel.mode === "hard") {
    text = n
      ? `В пуле ${n} сложных ${dateWord(n)}. Раунды по ${per} собираются из них.`
      : `В пуле 0 дат. Пока нет сложных дат — отлично! 🎉 Выбери другой диапазон.`;
  } else {
    text = `В пуле ${n} ${dateWord(n)}. Раунды по ${per} собираются из них.`;
  }
  $("setup-summary").textContent = text;
  $("setup-start").disabled = n === 0;
}

// Кнопка «Начать раунд»: запускаем выбранный режим на текущем пуле.
function startFromSetup() {
  if (!rangePool().length) return; // страховка (кнопка и так заблокирована)
  if (setupTarget === "quiz") runQuiz();
  else runFlip();
}

// =================== РЕЖИМ «ВСПОМНИ И ПЕРЕВЕРНИ» (тренировочный) ===================
// Активное вспоминание без вариантов ответа: показываем событие, ученик сам
// вспоминает дату и переворачивает карточку, чтобы себя проверить.
//
// ВАЖНО: этот режим НАМЕРЕННО не влияет на прогресс. Здесь нет вызова
// recordAnswer() и нет записи в объект `progress` — статистика «выучено/сложные»
// и серия дней не меняются. Это чистая практика без давления оценки.
let flipDeck = [];       // перемешанная колода карточек (лёгкая случайность)
let flipIndex = 0;       // индекс текущей карточки в колоде
let flipRevealed = false; // перевёрнута ли сейчас карточка (виден ли ответ)

// «Режим карточек» из меню/навбара сначала показывает выбор диапазона.
function startFlip() {
  openSetup("flip");
}

// Реальный запуск раунда карточек из выбранного пула.
function runFlip(pool = rangePool()) {
  if (!pool.length) { openSetup("flip"); return; }
  // Тот же отбор по интервальному повторению (фокус на слабых датах для активного
  // вспоминания), но БЕЗ записи в прогресс — buildSession только читает статистику.
  flipDeck = buildSession(SESSION_SIZE, pool);
  flipIndex = 0;
  showScreen("flip");
  $("flip-range").textContent = "Диапазон: " + rangeLabel();
  renderFlipCard();
}

function renderFlipCard() {
  const card = flipDeck[flipIndex];
  // Всегда начинаем с «лица» (событие), ответ спрятан.
  flipRevealed = false;
  $("flip-card").classList.remove("flipped");
  // Случайная формулировка события — как в квизе (тренируем узнавание).
  $("flip-event").textContent = pickRandom(eventsOf(card));
  $("flip-date").textContent = card.date;

  // Путь внизу — только визуальная навигация по колоде этой сессии
  // (в прогресс НЕ пишется). Пройденными считаем карточки до текущей.
  const done = new Set(flipDeck.slice(0, flipIndex).map((c) => c.id));
  renderPath(done, card.id);

  $("flip-next").textContent =
    flipIndex === flipDeck.length - 1 ? "Завершить ✓" : "Далее →";
}

// Клик по карточке — переворот (туда и обратно).
function flipCard() {
  flipRevealed = !flipRevealed;
  $("flip-card").classList.toggle("flipped", flipRevealed);
}

function flipNext() {
  if (flipIndex < flipDeck.length - 1) {
    flipIndex++;
    renderFlipCard();
  } else {
    // Завершение тренировки. Снова подчёркиваем: записи в прогресс не было.
    showDone("🃏", "Раунд повторения пройден!",
      `Ты прокрутил ${flipDeck.length} карточек. Это была практика — в прогресс ничего не записано.`, [
      { label: "Ещё раунд →", cls: "btn-primary", fn: () => runFlip() },
      { label: "Сменить диапазон", cls: "btn-secondary", fn: startFlip },
      { label: "В меню", cls: "btn-ghost", fn: goMenu },
    ]);
  }
}

// =================== ЭКРАН-ИТОГ (общий для раундов и обучения) ===================
// emoji/заголовок/текст + произвольные кнопки действий (label, css-класс, обработчик).
function showDone(emoji, title, text, buttons) {
  $("done-emoji").textContent = emoji;
  $("done-title").textContent = title;
  $("done-text").textContent = text;
  const box = $("done-actions");
  box.innerHTML = "";
  buttons.forEach((b) => {
    const el = document.createElement("button");
    el.className = "btn " + b.cls;
    el.textContent = b.label;
    el.onclick = b.fn;
    box.appendChild(el);
  });
  showScreen("done");
}

// Функциональный хаб (второй экран): режимы, серия, сводка прогресса.
function goMenu() {
  showScreen("menu");
  renderPath(new Set(), null);
  updateHomeProgress();
  renderStreak();
  renderMenuTiles();
  renderMenuMascot();
}

// Статичный маскот в шапке меню: то же пиксельное лицо, что на hero, но меньше
// и БЕЗ анимации выезда/«дыхания» — просто зафиксированное присутствие бренда.
function renderMenuMascot() {
  const el = $("menu-mascot");
  if (!el) return;
  liveCat(el, "menu", 76); // дружелюбно присутствует: моргает и «дышит» (CSS)
}

// Просветительская статья «Как учить даты без стресса» (отдельный раздел-инфо).
// Персонажа здесь намеренно нет — это отдельный этап позже.
function showGuide() {
  showScreen("guide");
}

// Раздел «О проекте» — личный текст от автора.
function showAbout() {
  showScreen("about");
}

// Короткая сводка на главной: «Выучено X из N дат».
// (оставлена для совместимости; #home-progress мог быть удалён из разметки —
//  поэтому внутри проверка if(el).)
function updateHomeProgress() {
  const el = $("home-progress");
  if (el) el.textContent = `Выучено ${masteredCount()} из ${CARDS.length} дат`;
}

// Приборная панель в меню: 3 плитки (серия / выучено / сложные даты).
function renderMenuTiles() {
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const learned = masteredCount(), hard = hardCards().length;
  set("tile-streak", progress.streakDays);
  // Подписи склоняются по числу.
  set("tile-streak-cap", dayWord(progress.streakDays) + " подряд"); // «3 дня подряд»
  set("tile-learned", learned);
  set("tile-total", CARDS.length);
  set("tile-learned-cap", plural(learned, WORD.learned)); // «5 дат выучено»
  set("tile-hard", hard);
  set("tile-hard-cap", plural(hard, WORD.hard));           // «4 сложных даты» → «сложных дат»
}

// =================== HERO «МАШИНА ВРЕМЕНИ» ===================
// Проигрывается один раз при загрузке: цифры-одометр прокручиваются сквозь
// историю, замедляются и застывают на 2026 → морфинг в «ХроноКвест» →
// сверху выглядывает кот. Только CSS + лёгкий JS, без библиотек.
let heroPlayed = false;

// Собираем название по буквам (для «проступания» с задержкой).
function buildHeroTitle() {
  const titleEl = $("hero-title");
  if (titleEl.childElementCount) return; // уже собрано
  [..."ХроноКвест"].forEach((ch, idx) => {
    const s = document.createElement("span");
    s.textContent = ch;
    // Двухцветный вордмарк: «Хроно» (0–4) — основной цвет, «Квест» (5–9) — акцент бренда.
    s.className = idx < 5 ? "lg-chrono" : "lg-quest";
    s.style.transitionDelay = idx * 45 + "ms"; // буквы появляются по очереди
    titleEl.appendChild(s);
  });
}

function playHero() {
  if (heroPlayed) return;
  heroPlayed = true;

  buildHeroTitle();
  // кот-«наблюдатель» вверху (пока спрятан над краем). Крупный — экран входной.
  $("hero-mascot").innerHTML =
    `<div class="peek-cat"><div class="peek-inner"></div></div>`;
  liveCat($("hero-mascot").querySelector(".peek-inner"), "hero", 190); // моргает + «дышит» (peekbob)

  const yearEl = $("hero-year");
  const titleEl = $("hero-title");
  const mascotEl = $("hero-mascot");

  // Уважаем настройку «меньше движения»: сразу показываем финал.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    yearEl.classList.add("out");
    titleEl.classList.add("show");
    mascotEl.classList.add("peek");
    return;
  }

  // Кадры «пролистывания истории» — сквозь них мелькают 862, 1237, 1613, 1812.
  const frames = [862, 1147, 988, 1237, 1380, 1480, 1547, 1613, 1682, 1755, 1812, 1861, 1905, 1945, 1991, 2026];
  const n = frames.length;
  let i = 0;

  function step() {
    yearEl.textContent = frames[i];
    // перезапускаем мини-анимацию «прокрутки» одометра
    yearEl.classList.remove("tick");
    void yearEl.offsetWidth; // хитрость: заставляем браузер сбросить анимацию
    yearEl.classList.add("tick");
    i++;
    if (i < n) {
      const delay = 45 + Math.pow(i / n, 2.3) * 340; // плавно замедляемся
      setTimeout(step, delay);
    } else {
      setTimeout(morph, 650); // задержались на 2026 — и превращаемся
    }
  }

  function morph() {
    yearEl.classList.add("out");    // цифры плавно уходят
    titleEl.classList.add("show");  // проступает «ХроноКвест»
    setTimeout(() => mascotEl.classList.add("peek"), 200); // кот выглядывает
  }

  step();
}

// =================== ИСТОРИЧЕСКИЕ ЭПОХИ (группировка списков дат) ===================
// Список из 101 даты слишком длинный — группируем его по эпохам в сворачиваемые
// секции. Граница эпохи — по году НАЧАЛА события (верхняя граница `to` не включается).
const EPOCHS = [
  { name: "Древняя Русь",                              to: 1237 },
  { name: "Русь под властью Орды",                     to: 1480 },
  { name: "Московское царство",                        to: 1682 },
  { name: "Российская империя. XVIII век",             to: 1801 },
  { name: "Российская империя. XIX — начало XX века",  to: 1917 },
  { name: "Советская Россия и СССР",                   to: 1991 },
  { name: "Современная Россия",                        to: Infinity },
];

// Год начала события из строки даты: первое число («1650-е» → 1650,
// «964–966 годы» → 964). Без цифр («VI–VIII века») — самая ранняя эпоха.
function yearOf(card) {
  const m = String(card.date).match(/\d+/);
  return m ? Number(m[0]) : 0;
}
function epochIndexOf(card) {
  const y = yearOf(card);
  for (let i = 0; i < EPOCHS.length; i++) {
    if (y < EPOCHS[i].to) return i;
  }
  return EPOCHS.length - 1;
}
// Разложить список карточек по эпохам; пустые эпохи не показываем.
function groupByEpoch(cards) {
  const groups = EPOCHS.map((e, i) => ({ idx: i, name: e.name, cards: [] }));
  cards.forEach((c) => groups[epochIndexOf(c)].cards.push(c));
  return groups.filter((g) => g.cards.length);
}

// =================== ЭКРАН «МОЙ ПРОГРЕСС» ===================
let progressFilter = "all";     // "all" | "mastered" | "hard"
let openEpochs = new Set();      // индексы раскрытых секций-эпох

// Короткое пояснение механики под фильтрами.
const FILTER_HINTS = {
  all: "Нажми на любую дату — сразу откроется её карточка в обучении.",
  mastered: "«Выучено» — 3 верных ответа подряд без единой ошибки между ними.",
  hard: "«Сложная» — 2 ошибки подряд в квизе. Уходит после 2 верных подряд.",
};

function showProgress() {
  progressFilter = "all"; // при каждом входе начинаем с «Все»
  resetEpochDefaults();
  showScreen("progress");
  renderProgress();
}

// Переключение фильтра-тега.
function setFilter(f) {
  progressFilter = f;
  resetEpochDefaults();
  renderProgress();
}

// Из «Моего прогресса» сразу в тренировку по сложным датам: ставим пресет
// «Сложные» (тот же hardCards()), сохраняем и запускаем нужный режим — ученику
// не приходится второй раз вручную выбирать этот фильтр на экране диапазона.
function trainHard(target) {
  if (!hardCards().length) return; // страховка: кнопка и так видна только при наличии
  rangeSel = { mode: "hard", from: 0, to: CARDS.length - 1 };
  saveRange();
  if (target === "flip") runFlip();
  else runQuiz();
}

// Какие секции-эпохи раскрыть по умолчанию: если дат мало (≤15) — все сразу
// (чтобы не заставлять кликать), иначе всё свёрнуто ради компактности.
function resetEpochDefaults() {
  const list = filteredCards();
  openEpochs = new Set();
  if (list.length <= 15) groupByEpoch(list).forEach((g) => openEpochs.add(g.idx));
}

// Свернуть/раскрыть секцию-эпоху по её индексу.
function toggleEpoch(i) {
  if (openEpochs.has(i)) openEpochs.delete(i);
  else openEpochs.add(i);
  renderProgress();
}

// Список дат под выбранный фильтр.
function filteredCards() {
  if (progressFilter === "mastered") return CARDS.filter((c) => isMastered(c.id));
  if (progressFilter === "hard") return hardCards();
  return CARDS; // "all"
}

function renderProgress() {
  const total = CARDS.length;

  // Верхняя сводка.
  const learned = masteredCount(), hard = hardCards().length;
  $("prog-learned").textContent = learned;
  $("prog-total").textContent = total;
  $("prog-fill").style.width = total ? Math.round((learned / total) * 100) + "%" : "0%";
  $("prog-learned-cap").textContent = plural(learned, WORD.learned); // «5 дат выучено»
  $("prog-streak").textContent = progress.streakDays;
  // Подпись серии склоняется по числу: «1 день» / «3 дня» / «5 дней» подряд.
  $("prog-streak-cap").textContent = dayWord(progress.streakDays) + " подряд";
  $("prog-hard").textContent = hard;
  $("prog-hard-cap").textContent = plural(hard, WORD.hard);          // «4 сложные даты»

  // Активный тег + подсказка.
  document.querySelectorAll(".chip").forEach((ch) => {
    ch.classList.toggle("active", ch.dataset.filter === progressFilter);
  });
  $("filter-hint").textContent = FILTER_HINTS[progressFilter];

  // Кнопка «Тренировать эти даты» — только при активном теге «Сложные» и если
  // сложные даты реально есть. Пул для тренировки — те же hardCards().
  const cta = $("hard-train-cta");
  if (cta) cta.classList.toggle("hidden", !(progressFilter === "hard" && hard > 0));

  // Отфильтрованный список, сгруппированный по эпохам в сворачиваемые секции.
  const list = filteredCards();
  const emptyText = {
    all: "Пока нет дат.",
    mastered: "Пока нет выученных дат — всё впереди! 💪",
    hard: "Пока нет сложных дат — так держать! 🎉",
  };

  if (!list.length) {
    $("stats-list").innerHTML = `<div class="empty">${emptyText[progressFilter]}</div>`;
    return;
  }

  $("stats-list").innerHTML = groupByEpoch(list)
    .map((g) => {
      const open = openEpochs.has(g.idx);
      const rows = open ? g.cards.map(statItemHTML).join("") : "";
      return (
        `<div class="epoch">` +
        `<button class="epoch-head${open ? " open" : ""}" onclick="toggleEpoch(${g.idx})" aria-expanded="${open}">` +
        `<span class="epoch-name">${g.name}</span>` +
        `<span class="epoch-meta"><span class="epoch-count">${g.cards.length}</span>` +
        `<span class="epoch-chevron" aria-hidden="true">›</span></span>` +
        `</button>` +
        `<div class="epoch-body">${rows}</div>` +
        `</div>`
      );
    })
    .join("");
}

// Одна строка статистики по дате — кликабельная (ведёт в обучение по этой дате).
function statItemHTML(card) {
  const s = readStat(card.id);
  const st = statusOf(card.id);
  let badge = `<span class="badge in-progress">в процессе</span>`;
  if (st === "mastered") badge = `<span class="badge mastered">выучено</span>`;
  else if (st === "hard") badge = `<span class="badge hard">сложная</span>`;
  const event = eventsOf(card)[0];
  return (
    `<button class="stat-item" onclick="openLearnAt(${card.id})" aria-label="Открыть дату ${card.date} в обучении">` +
    `<div class="si-main">` +
    `<div class="si-date">${card.date}</div>` +
    `<div class="si-event">${event}</div>` +
    `</div>` +
    `<div class="si-side">` +
    `<span class="si-count ok">✓ ${s.correct}</span>` +
    `<span class="si-count no">✗ ${s.wrong}</span>` +
    badge +
    `<span class="si-chevron" aria-hidden="true">›</span>` +
    `</div>` +
    `</button>`
  );
}

// Открыть КОНКРЕТНУЮ дату в режиме обучения (не общий режим).
function openLearnAt(id) {
  const idx = CARDS.findIndex((c) => c.id === id);
  if (idx < 0) return;
  learnIndex = idx;
  showScreen("learn");
  renderLearnCard();
}

// ---------- Сброс прогресса (с подтверждением) ----------
function askReset() {
  openModal("reset-modal");
}
function closeReset() {
  closeModal("reset-modal");
}
function confirmReset() {
  progress = defaultProgress();
  saveProgress();
  renderStreak();       // обнуляем и подпись серии
  closeModal("reset-modal");
  renderProgress();
  updateHomeProgress();
}

// ---------- «Что нового» (журнал обновлений) ----------
// Данные лежат в changelog.js (массив CHANGELOG, свежее — сверху).
// «Непросмотренность» считаем по id самой свежей записи: храним в localStorage
// id последнего обновления, которое пользователь уже открывал. Пока свежий id
// не совпадает с сохранённым — на иконке в панели горит точка-бейдж.
const CHANGELOG_SEEN_KEY = "hq_changelog_seen_v1";

// id самой свежей записи журнала (первый элемент массива) или null, если пусто.
function latestChangelogId() {
  return (typeof CHANGELOG !== "undefined" && CHANGELOG.length) ? CHANGELOG[0].id : null;
}

// Сколько записей журнала пользователь ещё не открывал. Записи идут свежими
// сверху, поэтому непросмотренные — это все записи ВЫШЕ последней просмотренной.
// Если ничего не сохранено (первый визит) — непросмотрены все записи.
function unseenChangelogCount() {
  if (typeof CHANGELOG === "undefined" || !CHANGELOG.length) return 0;
  const seen = localStorage.getItem(CHANGELOG_SEEN_KEY);
  if (!seen) return CHANGELOG.length;
  const idx = CHANGELOG.findIndex((e) => e.id === seen);
  return idx === -1 ? CHANGELOG.length : idx; // idx = число записей над просмотренной
}

// Есть ли обновления, которые пользователь ещё не открывал.
function hasUnseenChangelog() {
  return unseenChangelogCount() > 0;
}

// Обновить бейдж-счётчик непросмотренных обновлений: показать число или скрыть.
function updateChangelogBadge() {
  const dot = $("changelog-dot");
  if (!dot) return;
  const n = unseenChangelogCount();
  dot.textContent = n > 9 ? "9+" : String(n); // не даём бейджу разрастаться
  dot.classList.toggle("hidden", n === 0);
}

// Отрисовать список записей в модалке (хронология: свежее сверху).
function renderChangelog() {
  const box = $("changelog-list");
  if (!box || typeof CHANGELOG === "undefined") return;
  box.innerHTML = CHANGELOG.map((entry) => {
    const items = (entry.items || []).map((t) => `<li>${t}</li>`).join("");
    const title = entry.title ? `<div class="news-entry-title">${entry.title}</div>` : "";
    return `<div class="news-entry">
        <div class="news-date">${entry.date}</div>
        ${title}
        <ul class="news-items">${items}</ul>
      </div>`;
  }).join("");
}

function openChangelog() {
  renderChangelog();
  openModal("changelog-modal");
  // Помечаем самую свежую запись как просмотренную — бейдж гаснет.
  const latest = latestChangelogId();
  if (latest) localStorage.setItem(CHANGELOG_SEEN_KEY, latest);
  updateChangelogBadge();
}
function closeChangelog() {
  closeModal("changelog-modal");
}

// ---------- Лента анонсов на главном экране ----------
// Разворачиваем CHANGELOG в плоский список коротких сообщений: по одному на
// каждый пункт каждой записи, вида «🎉 Обновление {дата}: {пункт}». Порядок —
// как в массиве (свежее → старое), затем цикл с начала.
function buildNewsMessages() {
  if (typeof CHANGELOG === "undefined") return [];
  const out = [];
  CHANGELOG.forEach((entry) => {
    (entry.items || []).forEach((item) => {
      out.push(`Обновление ${entry.date}: ${item}`);
    });
  });
  return out;
}

// Запускаем циклическую смену сообщений с плавным затуханием (fade).
function initNewsTicker() {
  const bar = $("news-ticker");
  const label = $("news-ticker-text");
  if (!bar || !label) return;

  const msgs = buildNewsMessages();
  if (!msgs.length) return;        // нечего показывать — полоска остаётся скрытой

  label.textContent = msgs[0];
  bar.classList.remove("hidden");  // показываем только когда есть что показать
  if (msgs.length === 1) return;   // одно сообщение — без цикла и анимации

  let i = 0;
  const HOLD = 7500;               // сколько сообщение висит статично, мс
  const FADE = 450;                // длительность затухания (совпадает с CSS), мс
  setInterval(() => {
    label.classList.add("fade");   // текущее плавно гаснет
    setTimeout(() => {
      i = (i + 1) % msgs.length;   // следующее (по кругу)
      label.textContent = msgs[i];
      label.classList.remove("fade"); // и плавно появляется
    }, FADE);
  }, HOLD);
}

// ---------- Запуск ----------
// Звук: показать состояние тумблера + тихий блип при наведении на карточки режимов.
updateSoundUI();
updateChangelogBadge(); // зажечь бейдж, если есть непросмотренные обновления
initNewsTicker();       // запустить ленту анонсов на главном экране
document.querySelectorAll(".mode-card, .progress-nav").forEach((el) => {
  el.addEventListener("mouseenter", () => Sound.hover());
});

updateStreak();       // посчитать серию дней (покажется на экране меню)
updateHomeProgress(); // подготовить сводку прогресса для меню
showScreen("hero");   // стартуем с посадочного экрана
playHero();           // «машина времени» — один раз при загрузке
