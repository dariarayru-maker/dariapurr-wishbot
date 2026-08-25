/* ============================================
   ДЕНЕЖНЫЙ СТОП-КРАН — Quiz Logic
   ============================================ */

(function () {
  'use strict';

  // ---------- THEME TOGGLE ----------
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  root.setAttribute('data-theme', theme);

  if (toggle) {
    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      toggle.setAttribute('aria-label', 'Переключить на ' + (theme === 'dark' ? 'светлую' : 'тёмную') + ' тему');
      toggle.innerHTML = theme === 'dark'
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    });
  }

  // ---------- SCROLL REVEAL FOR PROGRAM CARDS ----------
  (function initProgramReveal() {
    const cards = document.querySelectorAll('.program-day');
    if (!cards.length) return;
    if (!('IntersectionObserver' in window)) {
      cards.forEach(function (c) { c.classList.add('is-visible'); });
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    cards.forEach(function (c) { observer.observe(c); });
  })();

  // ---------- DISCOUNT COUNTDOWN (real, tied to visitor IP on the server) ----------
  (function initTimer() {
    const clock = document.getElementById('timer-clock');
    if (!clock) return;

    const priceEl = document.querySelector('.offer-price-tag');
    const payBtn = document.getElementById('get-plan-btn');
    const RAISED_PRICE_HTML = '2 490 ₽ <span>· 5 дней</span>';
    const RAISED_LINK = 'https://app.lava.top/products/6debdf7b-740a-45bb-b1c8-93bbff7a736f';

    function applyExpired() {
      clock.textContent = '00:00';
      if (priceEl) priceEl.innerHTML = RAISED_PRICE_HTML;
      if (payBtn) {
        payBtn.href = RAISED_LINK;
        payBtn.textContent = '🐾 Забрать деньги на практикуме за 2490 ₽ →';
      }
    }

    function tick(deadlineMs) {
      const left = deadlineMs - Date.now();
      if (left <= 0) { applyExpired(); return; }
      const m = Math.floor(left / 60000);
      const s = Math.floor((left % 60000) / 1000);
      clock.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      setTimeout(function () { tick(deadlineMs); }, 1000);
    }

    fetch('/timer-state')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.expired) { applyExpired(); return; }
        tick(Date.now() + data.secondsLeft * 1000);
      })
      .catch(function () {
        clock.textContent = '15:00'; // API unreachable, fail open without raising the price
      });
  })();

  // ---------- QUIZ DATA ----------
  const questions = [
    {
      text: 'Что ты чувствуешь, когда смотришь на свой доход?',
      options: [
        { text: 'Цифра нормальная, но денег нет. Куда утекают, непонятно', type: 0 },
        { text: 'Деньги есть, но застряли: в вещах, в долгах мне, в неиспользованном', type: 1 },
        { text: 'Знаю, что беру меньше, чем нужно, но поднять цену страшно', type: 2 },
        { text: 'Честно, боюсь туда смотреть. Не знаю точно, сколько у меня', type: 3 },
      ],
    },
    {
      text: 'Что ты уже пробовала, чтобы изменить ситуацию?',
      options: [
        { text: 'Вела учёт расходов, качала финграмотность, но не помогло', type: 0 },
        { text: 'Собиралась продать ненужное и напомнить про долги, но руки не дошли', type: 1 },
        { text: 'Пробовала поднять цены. Страшно, что клиенты уйдут', type: 2 },
        { text: 'Пыталась вести бюджет, но бросала', type: 3 },
      ],
    },
    {
      text: 'Что происходит в теле, когда ты думаешь о деньгах?',
      options: [
        { text: 'Напряжение в челюсти, плечи к ушам, ком в горле', type: 0 },
        { text: 'Тяжесть, будто сижу на куче всего и не могу это сдвинуть', type: 1 },
        { text: 'Сжимается внутри, стыдно хотеть больше', type: 2 },
        { text: 'Тревога. Хочется закрыть глаза и не думать про это', type: 3 },
      ],
    },
    {
      text: 'Что ты делаешь вечером после тяжёлого дня?',
      options: [
        { text: 'Рука тянется что-нибудь купить: кофе, сладости, доставка, ненужные штуки', type: 0 },
        { text: 'Хочу разобрать вещи на продажу, но вечером сил уже нет', type: 1 },
        { text: 'Прокручиваю в голове, что могла бы взять больше за эту работу', type: 2 },
        { text: 'Заедаю стресс или зависаю в телефоне, лишь бы заглушить стресс', type: 3 },
      ],
    },
    {
      text: 'Какая фраза ближе всего к твоему внутреннему голосу?',
      options: [
        { text: '«Да ладно, это же мелочь, можно и купить»', type: 0 },
        { text: '«Да, есть что продать и с кого получить, но займусь этим потом, не сейчас»', type: 1 },
        { text: '«Я ещё не дотягиваю, рано брать дорого»', type: 2 },
        { text: '«Лучше не смотреть сколько осталось, а то станет только хуже»', type: 3 },
      ],
    },
    {
      text: 'Что ты чувствуешь, когда кто-то из знакомых зарабатывает больше, работая меньше?',
      options: [
        { text: 'Злюсь на себя: я же могу тоже, но деньги уходят', type: 0 },
        { text: 'Думаю: у неё всё разложено, а у меня всё где-то валяется', type: 1 },
        { text: 'Чувствую, что я недостаточно хороша для таких денег', type: 2 },
        { text: 'Трачу на себя, чтобы стало не так обидно', type: 3 },
      ],
    },
    {
      text: 'Если бы ты могла изменить одно прямо сейчас, что бы это было?',
      options: [
        { text: 'Остановить утечку денег, которую я не контролирую', type: 0 },
        { text: 'Собрать все зависшие деньги: вещи, долги, кешбэки, забытые бонусы', type: 1 },
        { text: 'Назвать свою цену без дрожи в голосе', type: 2 },
        { text: 'Перестать бояться цифр и понять, где я на самом деле', type: 3 },
      ],
    },
  ];

  // ---------- RESULTS ----------
  const results = [
    {
      title: 'Кошка подсветила: у тебя дырявый карман',
      badge: '🃏 Твоя карта: «Дырявый карман»',
      quote: '«Человек, у тебя в кармане решето. Сначала латаем дыры, потом качаем объёмы.»',
      body: `
        <p>Кошка вытащила тебе <strong>«Дырявый карман»</strong>. Кэш утекает не крупными суммами, а тихой струйкой. 500 рублей тут, тысяча там, и за месяц набегает 10-15 тысяч, ушедших в никуда.</p>
        <p>Где застряли твои деньги: забытые подписки на сервисы, которыми ты не пользуешься, невыгодные тарифы на связь и интернет, банковские комиссии и мелкие покупки на автомате, кофе и такси там, где можно было пройтись.</p>
        <p><strong>Почему это горит:</strong> дыры протекают каждый день, прямо сейчас. Пока их не залатать, любые новые деньги будут утекать туда же, и ты снова окажешься в конце месяца с нулём.</p>
      `,
      practiceTitle: 'Кэш-практика «Ревизия за 15 минут»',
      practicePreview: 'Первый шаг, чтобы залатать дыры уже сегодня. Без силы воли, просто по факту.',
      practiceMini: `
        <ol>
          <li>Открой приложение банка и выгрузи выписку за прошлый месяц.</li>
          <li>Подсвети все регулярные списания: подписки, сервисы, автопродления.</li>
          <li>Отмени прямо сейчас минимум три штуки, которыми ты не пользуешься.</li>
        </ol>
        <p class="mini-hint">Это первые шаги. Дальше по тарифам и комиссиям, ниже.</p>
      `,
      practiceFull: `
        <div class="practice-time">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          15 минут · с телефоном в руке
        </div>
        <h4>Что делать</h4>
        <ol>
          <li>Открой приложение банка и выгрузи выписку за прошлый месяц.</li>
          <li>Подсвети все регулярные списания: подписки, сервисы, автопродления, страховки.</li>
          <li>Отмени минимум три подписки, которыми ты не пользуешься, прямо сейчас.</li>
          <li>Проверь тариф на связь и интернет. Часто есть план дешевле за те же деньги.</li>
          <li>Поставь на завтра напоминание, чтобы досмотреть остальные списания на свежую голову.</li>
        </ol>
        <h4>Почему это работает</h4>
        <p>Мелкие утечки не болят по одной, поэтому их и не замечаешь. Собранные вместе, они и есть твой потерянный отпуск раз в год. Как только дыры залатаны, следующая зарплата остаётся с тобой, а не утекает по привычке.</p>
      `,
    },
    {
      title: 'Кошка подсветила: у тебя забытая заначка',
      badge: '🃏 Твоя карта: «Забытая заначка»',
      quote: '«Ты сидишь на куче кэша и жалуешься, что денег нет. Раскрой глаза.»',
      body: `
        <p>Кошка вытащила тебе <strong>«Забытую заначку»</strong>. Деньги у тебя уже есть прямо сейчас, но они заморожены в вещах, услугах и чужих долгах, про которые ты забыла или стесняешься напомнить.</p>
        <p>Где застрял твой кэш: одежда, техника и гаджеты, которые пылятся на балконе, люди, которые тебе должны, неиспользованные сертификаты, кешбэки, баллы на картах и налоговые вычеты.</p>
        <p><strong>Почему это горит:</strong> это живые деньги, до которых можно дотянуться за пару дней. Пока вещи лежат, а долги висят, ты сидишь на кэше и чувствуешь себя без денег.</p>
      `,
      practiceTitle: 'Кэш-практика «Расхламление в кэш»',
      practicePreview: 'Первый шаг, чтобы достать живые деньги за пару дней.',
      practiceMini: `
        <ol>
          <li>Пройдись по дому и найди три вещи, которыми не пользовалась полгода.</li>
          <li>Сфотографируй их при дневном свете, без лишнего хлама в кадре.</li>
          <li>Выставь на Авито или в профильный чат по адекватной цене.</li>
        </ol>
        <p class="mini-hint">Это первые шаги. Дальше про долги и забытые бонусы, ниже.</p>
      `,
      practiceFull: `
        <div class="practice-time">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          20 минут · дома
        </div>
        <h4>Что делать</h4>
        <ol>
          <li>Найди три вещи, которыми не пользовалась полгода, и сфотографируй при дневном свете.</li>
          <li>Выставь их на Авито или в профильный чат по адекватной цене, без долгих раздумий.</li>
          <li>Вспомни, кто тебе должен, и напиши спокойно: «привет, напомни, пожалуйста, про возврат, мне сейчас актуально».</li>
          <li>Проверь кешбэки, баллы и сертификаты на картах. Часто там лежит забытая сумма.</li>
          <li>Загляни, положены ли тебе налоговые вычеты за лечение, обучение или квартиру.</li>
        </ol>
        <h4>Почему это работает</h4>
        <p>Заначка не приходит сама, потому что напомнить и выставить бывает неловко. Как только ты продала первую вещь и вернула первый долг, тело чувствует: брать своё безопасно. Дальше идёт легче.</p>
      `,
    },
    {
      title: 'Кошка подсветила: у тебя невидимый чек',
      badge: '🃏 Твоя карта: «Невидимый чек»',
      quote: '«Я не мурчу бесплатно просто так. И ты не отдавай своё время за копейки.»',
      body: `
        <p>Кошка вытащила тебе <strong>«Невидимый чек»</strong>. Твой кэш застрял в горле. Ты работаешь много и делаешь круто, а когда доходит до цены, сжимаешься, стесняешься и раздаёшь бонусы бесплатно.</p>
        <p>Где застрял твой кэш: старые цены для новых клиентов из страха, что уйдут, бесплатные доработки и консультации по дружбе, и вечное «мне надо ещё десять курсов, прежде чем поднять чек хоть немного».</p>
        <p><strong>Почему это горит:</strong> каждый клиент по старой цене это деньги, которые ты отдаёшь прямо сейчас. Чем дольше тянешь, тем крепче сидит «я недостаточно хороша».</p>
      `,
      practiceTitle: 'Кэш-практика «Плюс 20 без стыда»',
      practicePreview: 'Первый шаг, чтобы вернуть себе цену, которую ты давно переросла.',
      practiceMini: `
        <ol>
          <li>Встань ровно, стопы на полу, спина прямая. Это поза хозяйки.</li>
          <li>Назови вслух свою нынешнюю цену и заметь, где тело сжимается.</li>
          <li>Назови цену на 20-30% выше и подыши в это сжатие.</li>
        </ol>
        <p class="mini-hint">Это первые шаги. Дальше как закрепить новую цену в теле, ниже.</p>
      `,
      practiceFull: `
        <div class="practice-time">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          2 минуты · перед разговором о цене
        </div>
        <h4>Что делать</h4>
        <ol>
          <li>Встань ровно, стопы на полу, спина прямая. Это поза хозяйки.</li>
          <li>Назови вслух свою нынешнюю цену и заметь, где тело сжимается.</li>
          <li>Назови цену на 20-30% выше. Скорее всего, поднимется паника, голос станет тише.</li>
          <li>Расправь плечи, подними подбородок, подыши. Скажи вслух: «Разрешаю себе называть свою цену без дрожи в голосе».</li>
          <li>Повтори новую цену три раза спокойно, пока тело к ней привыкает. Дальше убери один бонус, который ты раньше отдавала бесплатно.</li>
        </ol>
        <h4>Почему это работает</h4>
        <p>Страх цены живёт в теле, а не в прайсе. Практика показывает телу, что назвать сумму больше можно без опасности. Голос перестаёт дрожать, и следующий чек ты озвучиваешь спокойно.</p>
      `,
    },
    {
      title: 'Кошка подсветила: у тебя денежный туман',
      badge: '🃏 Твоя карта: «Денежный туман»',
      quote: '«Страх исчезает, когда появляется ясность. Сними лапы с глаз и посмотри цифрам в лицо.»',
      body: `
        <p>Кошка вытащила тебе <strong>«Денежный туман»</strong>. Кэш сливается из состояния хаоса и тревоги. Ты либо боишься открывать приложение банка, либо тратишь, чтобы заглушить стресс.</p>
        <p>Где застрял твой кэш: нет ясной картины, сколько ты зарабатываешь и сколько тратишь, покупки из серии «я устала, имею право», и страх остаться без денег, который парализует и мешает делать шаги, приносящие доход.</p>
        <p><strong>Почему это горит:</strong> в тумане деньги утекают незаметно, а тревога только растёт. Ясность снимает панику быстрее любой мотивации, и решения сразу становятся проще.</p>
      `,
      practiceTitle: 'Кэш-практика «Заземление кэша»',
      practicePreview: 'Первый шаг, чтобы выйти из тумана и перестать бояться цифр.',
      practiceMini: `
        <ol>
          <li>Возьми лист или заметки в телефоне. Дыши ровно, это просто цифры.</li>
          <li>Выпиши обязательные расходы на месяц, без которых никак: жильё, еда, связь, транспорт.</li>
          <li>Сложи их. Это твоя точка безопасности, сумма, ниже которой ты не падаешь.</li>
        </ol>
        <p class="mini-hint">Это первые шаги. Дальше как снять паническую трату, ниже.</p>
      `,
      practiceFull: `
        <div class="practice-time">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          10 минут · в спокойный момент
        </div>
        <h4>Что делать</h4>
        <ol>
          <li>Сделай длинный выдох, вдвое длиннее вдоха, шесть раз. Это выключает панику в теле.</li>
          <li>Выпиши обязательные расходы на месяц: жильё, еда, связь, транспорт.</li>
          <li>Сложи их. Это твоя точка безопасности, сумма, ниже которой ты не падаешь.</li>
          <li>Прикинь примерный доход за месяц и сравни. Туман рассеивается уже от одного этого сравнения.</li>
          <li>Когда потянет купить, чтобы заглушить стресс, сначала повтори выдохи и спроси себя: мне сейчас нужна вещь или покой.</li>
        </ol>
        <h4>Почему это работает</h4>
        <p>Тревога всегда рисует хуже, чем есть на самом деле. Как только цифры перед глазами, страх теряет силу, и ты снова видишь, где твои деньги и что с ними делать.</p>
      `,
    },
  ];

  // ---------- QUIZ STATE ----------
  let currentQuestion = 0;
  let advanceTimer = null;
  const answers = new Array(questions.length).fill(null);
  const scores = [0, 0, 0, 0];

  // ---------- DOM ----------
  const heroEl = document.getElementById('hero');
  const heroInner = heroEl.querySelector('.hero-inner');
  const heroContent = document.getElementById('hero-content');
  const heroCat = document.getElementById('hero-cat');
  const quizEl = document.getElementById('quiz');
  const quizContainer = quizEl.querySelector('.quiz-container');
  const resultEl = document.getElementById('result');
  const resultContainer = resultEl.querySelector('.result-container');
  const quizContent = document.getElementById('quiz-content');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const btnNext = document.getElementById('quiz-next');
  const btnBack = document.getElementById('quiz-back');
  const startBtn = document.getElementById('start-quiz');

  // ---------- START QUIZ (opens in place, inside hero) ----------
  startBtn.addEventListener('click', () => {
    heroContent.hidden = true;
    if (heroCat) heroCat.hidden = true;
    var authorEl = document.getElementById('author');
    if (authorEl) authorEl.hidden = true;
    heroEl.classList.add('hero--flow');
    heroInner.appendChild(quizContainer);   // move quiz card into the hero block
    quizContainer.hidden = false;
    renderQuestion();
    window.scrollTo({ top: 0 });
  });

  // ---------- RENDER QUESTION ----------
  function renderQuestion() {
    const q = questions[currentQuestion];
    const progress = ((currentQuestion + 1) / questions.length) * 100;

    progressFill.style.width = progress + '%';
    progressText.textContent = `Карта ${currentQuestion + 1} из ${questions.length}`;

    const optionsHtml = q.options.map((opt, i) => `
      <button class="quiz-option ${answers[currentQuestion] === i ? 'selected' : ''}" data-index="${i}">
        <span class="quiz-option-marker"></span>
        <span class="quiz-option-text">${opt.text}</span>
      </button>
    `).join('');

    quizContent.innerHTML = `
      <div class="quiz-question">
        <h2 class="quiz-question-text">${q.text}</h2>
        <div class="quiz-options">${optionsHtml}</div>
      </div>
    `;

    // Attach option handlers (auto-advance after a short beat)
    quizContent.querySelectorAll('.quiz-option').forEach(btn => {
      btn.addEventListener('click', () => {
        if (advanceTimer) return; // ignore double taps mid-advance
        const idx = parseInt(btn.dataset.index);
        answers[currentQuestion] = idx;
        quizContent.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        advanceTimer = setTimeout(() => {
          advanceTimer = null;
          if (currentQuestion < questions.length - 1) {
            currentQuestion++;
            renderQuestion();
          } else {
            showResult();
          }
        }, 300);
      });
    });

    btnBack.style.visibility = currentQuestion === 0 ? 'hidden' : 'visible';
    btnNext.style.display = 'none'; // selection auto-advances

    // Show quiz intro only on first question
    const quizIntro = document.getElementById('quiz-intro');
    if (quizIntro) {
      quizIntro.style.display = currentQuestion === 0 ? 'block' : 'none';
    }
  }

  // ---------- NAVIGATION ----------
  btnNext.addEventListener('click', () => {
    if (answers[currentQuestion] === null) return;

    if (currentQuestion < questions.length - 1) {
      currentQuestion++;
      renderQuestion();
    } else {
      showResult();
    }
  });

  btnBack.addEventListener('click', () => {
    if (currentQuestion > 0) {
      currentQuestion--;
      renderQuestion();
    }
  });

  // ---------- EXPRESS ADVICE (per winning card) ----------
  const adviceByType = [
    {
      title: 'Перекрой утечки за 15 минут',
      steps: [
        '📱 Открой настройки телефона → «Подписки». Отмени все, которыми не пользовалась в этом месяце.',
        '💳 Приложение банка → «Автоплатежи». Отключи всё, что списывается на автомате и не нужно.',
        '📞 Позвони своему оператору связи и скажи: «Хочу тариф выгоднее». Почти всегда предлагают дешевле.',
      ],
    },
    {
      title: 'Достань живые деньги за 48 часов',
      steps: [
        '🔎 Пройди по дому и собери три вещи, которыми не пользовалась полгода.',
        '📸 Сними при дневном свете и выставь на Авито сегодня, цену ставь чуть ниже рынка, чтобы ушло быстро.',
        '💬 Напиши тем, кто должен: «Привет! Напомни, пожалуйста, про возврат, сейчас актуально». Проверь кешбэки и забытые бонусы на картах.',
      ],
    },
    {
      title: 'Подними чек уже на следующем клиенте',
      steps: [
        '📝 Возьми свою нынешнюю цену и подними её на 20%. Это твоя новая цена, точка.',
        '🚫 Найди две вещи, которые делаешь бесплатно «по дружбе», и вынеси их в отдельную платную опцию.',
        '🗣 Перед разговором о цене: встань ровно, выдохни и назови сумму спокойно, без «но если что, подвину».',
      ],
    },
    {
      title: 'Наведи ясность и найди второй доход',
      steps: [
        '🧮 Выпиши на бумагу две цифры: сколько пришло за месяц и сколько ушло. Просто факты, без оценок.',
        '🎯 Обведи три самые крупные траты. По каждой реши одно: оставить, урезать или убрать совсем.',
        '💡 Вспомни навык, за который тебе уже платили, и предложи его ещё одному человеку сегодня.',
      ],
    },
  ];

  // ---------- SHOW RESULT ----------
  function showResult() {
    // Calculate scores
    answers.forEach((ans, i) => {
      if (ans !== null) scores[questions[i].options[ans].type]++;
    });

    // Find winner (first in case of tie)
    let winner = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[winner]) winner = i;
    }

    const r = results[winner];
    const cardNo = winner + 1;

    heroEl.hidden = true;          // collapse hero (holds the quiz)
    resultEl.hidden = false;       // show the full-width result spread

    document.querySelectorAll('.tarot-card').forEach(card => {
      if (card.getAttribute('data-card') === String(cardNo)) {
        card.classList.add('active-result');
        card.classList.remove('dimmed');
      } else {
        card.classList.add('dimmed');
        card.classList.remove('active-result');
      }
    });

    const ea = document.getElementById('express-advice');
    if (ea && adviceByType[winner]) {
      const a = adviceByType[winner];
      ea.innerHTML =
        '<div class="ea-label">💡 Забери первый результат прямо сейчас</div>' +
        '<h3 class="ea-title">' + a.title + '</h3>' +
        '<ol class="ea-steps">' + a.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>';
    }

    window.scrollTo({ top: 0 });
  }

})();
