// ============ ХроноКвест — логика черновой версии ============
// Принципы игровой механики берём из CLAUDE.md:
// мгновенная реакция, короткие сессии, стрик, лёгкая случайность,
// прогресс-путь, низкая цена ошибки.

// ---------- Вспомогательное ----------
const $ = (id) => document.getElementById(id);
const show = (id) => $(id).classList.remove("hidden");
const hide = (id) => $(id).classList.add("hidden");

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
    "KOOOOOOOOOOK",
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

// Строки карты для нужного выражения мордочки.
function catRows(expr) {
  const r = CAT.base.slice();
  if (expr === "happy") { r[5] = "KOKKOOOOKKOK"; r[6] = "KOPOOPPOOPOK"; } // зажмуренные глазки + щёки
  if (expr === "think") { r[4] = "KOOEOOOOEOOK"; r[5] = "KOWWOOOOWWOK"; } // взгляд вверх (задумался)
  return r;
}

// Собираем SVG кота нужного размера (px — ширина).
function catSVG(expr, px) {
  const rows = catRows(expr);
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

// state: "idle" (спокойно ждёт) | "happy" (радость/танец) | "think" (задумался)
// bubbleText — необязательная прямая речь кота: рисуется в облачке над ним.
function renderMascot(state, bubbleText) {
  const expr = state === "happy" ? "happy" : state === "think" ? "think" : "idle";
  const bubble = bubbleText
    ? `<div class="bubble bubble--${state}">${bubbleText}</div>`
    : "";
  $("quiz-mascot").innerHTML =
    `<div class="mascot mascot--${state}">` +
    bubble +
    `<div class="cat-stage">${catSVG(expr, 84)}</div>` +
    `<div class="fx fx--happy"><span class="s1">✦</span><span class="s2">✦</span><span class="s3">✦</span></div>` +
    `<div class="fx fx--think">?</div>` +
    `</div>`;
}

// Прямая речь кота (от первого лица, без эмодзи) — показывается в облачке.
// Верный ответ:
const HAPPY_LINES = [
  "Ура, ты молодец!",
  "О, пожалуй, потанцую!",
  "Тебе суждено 100 баллов!",
  "Вот это память!",
  "Мяу! Точно в цель!",
  "Я знал, что ты сможешь!",
  "Блеск! Идём дальше!",
];
// Неверный ответ:
const THINK_LINES = [
  "Ничего страшного!",
  "Ой, что-то я призадумался...",
  "Бывает! Запомним на будущее.",
  "Не беда, идём дальше!",
  "Хм, в следующий раз получится!",
];

// =================== ЛОКАЛЬНЫЙ ПРОГРЕСС УЧЕНИКА ===================
// Всё хранится ТОЛЬКО в браузере (localStorage) — без сервера, базы и запросов.
// Один объект: статистика по каждой дате + серия дней.
const STORE_KEY = "hq_progress_v1";

function defaultProgress() {
  return { dates: {}, streakDays: 0, lastVisit: null };
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || defaultProgress();
  } catch (e) {
    return defaultProgress(); // если данные повреждены — начинаем заново
  }
}

let progress = loadProgress();

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

function showScreen(name) {
  ["hero", "menu", "learn", "quiz", "done", "progress"].forEach((s) => hide("screen-" + s));
  show("screen-" + name);
  // Точки-путь не нужны на посадочном экране — прячем их там.
  const path = $("path");
  if (path) path.style.display = name === "hero" ? "none" : "flex";
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

// Правильное склонение слова «день» (1 день, 2 дня, 5 дней).
function dayWord(n) {
  const a = Math.abs(n) % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return "дней";
  if (b === 1) return "день";
  if (b >= 2 && b <= 4) return "дня";
  return "дней";
}

// Понятная подпись серии: «🔥 3 дня подряд».
function renderStreak() {
  const el = $("streak-badge");
  if (el) el.textContent = `🔥 ${progress.streakDays} ${dayWord(progress.streakDays)} подряд`;
}

// ---------- Путь по эпохам (визуальный прогресс) ----------
// doneSet — множество id уже пройденных карточек; currentId — текущая.
function renderPath(doneSet, currentId) {
  const path = $("path");
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

function renderLearnCard() {
  const card = CARDS[learnIndex];
  const forms = eventsOf(card);
  // Авторская иллюстрация-обложка: показываем, только если у даты есть картинка.
  const ill = $("learn-illustration");
  ill.innerHTML = card.image
    ? `<img src="${card.image}" alt="${card.imageAlt || forms[0]}" loading="lazy">`
    : "";
  // В обучении маскота нет — только дата и её ассоциация.
  $("learn-date").textContent = card.date;
  // Показываем основную формулировку...
  $("learn-event").textContent = forms[0];
  // ...а под ней — прочие варианты, как это же событие спросят иначе на ЕГЭ.
  const alts = forms.slice(1);
  $("learn-event-alts").textContent = alts.length
    ? "Также встречается как: " + alts.join("; ")
    : "";
  $("learn-context").textContent = card.context;
  $("learn-lifehack").textContent = card.lifehack;

  // путь: пройденными считаем все карточки до текущей
  const done = new Set(CARDS.slice(0, learnIndex).map((c) => c.id));
  renderPath(done, card.id);

  $("learn-next").textContent =
    learnIndex === CARDS.length - 1 ? "Завершить ✓" : "Далее →";
}

function learnNext() {
  if (learnIndex < CARDS.length - 1) {
    learnIndex++;
    renderLearnCard();
  } else {
    finish("Все 3 карточки изучены!", "Теперь попробуй режим квиза 🎯");
  }
}

// =================== РЕЖИМ КВИЗА ===================
let quizQueue = [];      // очередь карточек (перемешанная — лёгкая случайность)
let quizCard = null;     // текущая карточка
let solved = new Set();  // id карточек, отвеченных верно

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startQuiz() {
  quizQueue = shuffle(CARDS);
  solved = new Set();
  showScreen("quiz");
  nextQuizCard();
}

function nextQuizCard() {
  if (quizQueue.length === 0) {
    finish("Квиз пройден!", "Все даты отвечены верно. Отличная серия побед! 🎉");
    return;
  }
  quizCard = quizQueue.shift();
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

  renderPath(solved, quizCard.id);
}

function answer(choice, btn) {
  // блокируем повторные нажатия
  document.querySelectorAll(".option").forEach((o) => (o.onclick = null));
  const fb = $("quiz-feedback");
  show("quiz-feedback");

  if (choice === quizCard.answer) {
    // ✅ Кот увеличивается и танцует, а его реплика — в облачке (прямая речь).
    //    Никаких подписей от третьего лица: область фидбэка — только кнопка.
    btn.classList.add("correct");
    solved.add(quizCard.id);
    recordAnswer(quizCard.id, true); // сохраняем прогресс по дате
    renderMascot("happy", pickFresh(HAPPY_LINES, "happy"));
    fb.className = "feedback";
    fb.innerHTML = "";
    renderPath(solved, quizCard.id);
    addContinueButton(fb, "Дальше →");
  } else {
    // 🟠 Мягкая ошибка: реплика кота — в облачке (прямая речь, без объяснений
    //    от третьего лица). Подсвечиваем верный вариант и возвращаемся к лайфхаку.
    btn.classList.add("wrong");
    recordAnswer(quizCard.id, false); // сохраняем прогресс по дате
    document.querySelectorAll(".option").forEach((o) => {
      if (o.textContent === quizCard.answer) o.classList.add("correct");
    });
    renderMascot("think", pickFresh(THINK_LINES, "think"));
    fb.className = "feedback soft";
    fb.innerHTML =
      `Правильно: <b>${quizCard.answer}</b>. Вернёмся к лайфхаку:` +
      `<div class="assoc-reminder">💡 ${quizCard.lifehack}</div>`;
    // spaced repetition (упрощённо): карточку с ошибкой покажем ещё раз позже
    quizQueue.push(quizCard);
    addContinueButton(fb, "Понятно, дальше →");
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

// =================== ОБЩЕЕ ===================
function finish(title, text) {
  $("done-title").textContent = title;
  $("done-text").textContent = text;
  renderPath(new Set(CARDS.map((c) => c.id)), null);
  showScreen("done");
}

// Функциональный хаб (второй экран): режимы, серия, сводка прогресса.
function goMenu() {
  showScreen("menu");
  renderPath(new Set(), null);
  updateHomeProgress();
  renderStreak();
  renderMenuTiles();
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
  set("tile-streak", progress.streakDays);
  set("tile-learned", masteredCount());
  set("tile-total", CARDS.length);
  set("tile-hard", hardCards().length);
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
    `<div class="peek-cat"><div class="peek-inner">${catSVG("idle", 190)}</div></div>`;

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

// =================== ЭКРАН «МОЙ ПРОГРЕСС» ===================
let progressFilter = "all"; // "all" | "mastered" | "hard"

// Короткое пояснение механики под фильтрами.
const FILTER_HINTS = {
  all: "Нажми на любую дату — сразу откроется её карточка в обучении.",
  mastered: "«Выучено» — 3 верных ответа подряд без единой ошибки между ними.",
  hard: "«Сложная» — 2 ошибки подряд в квизе. Уходит после 2 верных подряд.",
};

function showProgress() {
  progressFilter = "all"; // при каждом входе начинаем с «Все»
  showScreen("progress");
  renderProgress();
}

// Переключение фильтра-тега.
function setFilter(f) {
  progressFilter = f;
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
  $("prog-learned").textContent = masteredCount();
  $("prog-total").textContent = total;
  $("prog-fill").style.width = total ? Math.round((masteredCount() / total) * 100) + "%" : "0%";
  $("prog-streak").textContent = progress.streakDays;
  $("prog-hard").textContent = hardCards().length;

  // Активный тег + подсказка.
  document.querySelectorAll(".chip").forEach((ch) => {
    ch.classList.toggle("active", ch.dataset.filter === progressFilter);
  });
  $("filter-hint").textContent = FILTER_HINTS[progressFilter];

  // Отфильтрованный список.
  const list = filteredCards();
  const emptyText = {
    all: "Пока нет дат.",
    mastered: "Пока нет выученных дат — всё впереди! 💪",
    hard: "Пока нет сложных дат — так держать! 🎉",
  };
  $("stats-list").innerHTML = list.length
    ? list.map(statItemHTML).join("")
    : `<div class="empty">${emptyText[progressFilter]}</div>`;
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
  show("reset-modal");
}
function closeReset() {
  hide("reset-modal");
}
function confirmReset() {
  progress = defaultProgress();
  saveProgress();
  renderStreak();       // обнуляем и подпись серии
  hide("reset-modal");
  renderProgress();
  updateHomeProgress();
}

// ---------- Запуск ----------
updateStreak();       // посчитать серию дней (покажется на экране меню)
updateHomeProgress(); // подготовить сводку прогресса для меню
showScreen("hero");   // стартуем с посадочного экрана
playHero();           // «машина времени» — один раз при загрузке
