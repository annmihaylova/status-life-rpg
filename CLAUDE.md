# CLAUDE.md

Проект Status: LitRPG-геймификация реальной жизни. Источник правды — `SPEC.md`, план и принятые решения — `docs/PLAN.md`. Если они расходятся, прав `docs/PLAN.md`: там решения, принятые после SPEC.

## Как работать
1. Перед любым кодом прочитай `SPEC.md` целиком и `docs/PLAN.md`. Код новой фазы пиши только после одобрения.
2. Работай строго по фазам. Каждая фаза заканчивается рабочим деплоем и зелёными тестами.
3. Игровая логика — только чистые функции в `lib/game/` с юнит-тестами. Таблицы баланса сверяй с `scripts/balance.py` (Приложение B в SPEC.md).
4. Если SPEC расходится с актуальной документацией библиотек или MCP — следуй документации и напиши, что изменил.
5. Полный рабочий код без заглушек. Не хватает решения или ключа — спроси.
6. После каждой фазы обнови этот файл: архитектура, команды, конвенции, что сделано.
7. Next.js 16 отличается от того, что в памяти модели (см. `AGENTS.md`): перед кодом читай гайды в `node_modules/next/dist/docs/`. Middleware теперь `proxy.ts`.

## Git и GitHub
- Владелица репозитория разрешила (2026-11-26) коммитить и пушить на GitHub без отдельного вопроса.
- Коммиты небольшие, по смыслу. Ветка `main`. Без `--force` и без переписывания опубликованной истории.
- Перед пушем: `pnpm lint && pnpm typecheck && pnpm test` (и `pnpm test:db`, если менялась схема).
- Никогда не коммить `.env*` (кроме `.env.example`), ключи и токены.

## Окружение
- Windows 11. Python: `python` (не `python3`). Node 24, pnpm 12, Docker Desktop (нужен для локального Supabase).
- Docker Desktop здесь ломается после аварийного выхода: остаются неудаляемые файлы-сокеты, и он падает при старте с «remove ...sock: The file cannot be accessed by the system». Лечится `scripts/windows/fix-docker-sockets.ps1`. Закрывать Docker — через Quit в трее, не убивать процесс.
- Локальный `.env.local` указывает на локальный Supabase (`pnpm db:start`). Почта magic link локально — Mailpit на http://127.0.0.1:54324.
- Переводы строк — LF (`.gitattributes`).

## Команды
| Команда | Что делает |
|---|---|
| `pnpm dev` | dev-сервер на :3000 (нужен `.env.local`, см. `.env.example`) |
| `pnpm build` | прод-сборка |
| `pnpm lint` / `pnpm typecheck` | ESLint / `next typegen` + tsc |
| `pnpm test` | юнит-тесты (vitest), в т.ч. игровая математика |
| `pnpm test:db` | тест RLS по всем таблицам и пересчёта, нужен запущенный локальный Supabase |
| `pnpm test:llm` | платный eval на настоящем Claude: фикстура SPEC 8 (нужен `ANTHROPIC_API_KEY`, без него тесты пропускаются) |
| `pnpm game:recompute [--user <id>] [--verify]` | пересчитать всё из сырых данных (`DATABASE_URL` из окружения или `.env.local`) |
| `pnpm db:start` / `pnpm db:stop` | локальный Supabase в Docker |
| `pnpm db:reset` | пересоздать локальную БД из `supabase/migrations` |
| `pnpm db:generate` | сгенерировать миграцию из `lib/db/schema.ts` |
| `pnpm balance` | эталонные таблицы баланса |

## Архитектура
- `lib/game/` — чистые функции: `config.ts` (все константы, `FORMULA_VERSION`, эксперименты), `formulas.ts` (уровни, навыки, характеристики, раскрытие, калибровка, слоты), `hp.ts` (HP, статусы, день отдыха, «Второе дыхание»), `attributes.ts` + `data/attributes.json`.
- `lib/game/engine/` — движок: `replay(input) → result`, чистая функция. Вход: подтверждённые записи, журнал решений (`game_decisions`), определения навыков, самочувствие по дням, эксперименты. Выход: персонаж, навыки, кандидаты, характеристики (+ скрытые пометки для раскрытия), HP по дням, леджер, события. Проходит дни от регистрации до сегодня: решения дня → записи дня (по `started_at`/`created_at`) → закрытие дня (звёзды/очки, уровень, предложения навыков, готовность к раскрытию, HP).
  - Решения пользователя (взять навык, калибровка, раскрытие, специализация…) влияют на пересчёт только через `game_decisions` — пиши решение туда, а не правь кэши.
  - Кластер → навык известен заранее из `take_skill.clusterKey`: опыт кандидата засчитывается навыку задним числом.
  - В характеристики идёт XP навыка без бонусов и без ×5 спящего навыка.
  - Теги навыков и эксперименты применяются ко всей истории (текущее значение).
- `lib/game/progression.ts` + `data/titles.json` (28 титулов) и `data/classes.json` (36 классов) — черновики конфигов (вопрос 14.5), владелица поправит. Движок проверяет титулы в конце каждого дня (`ProgressCounters`), класс открывается на 10 уровне и пересчитывается по понедельникам: две топ-характеристики (видимые сейчас) + области навыков за 28 дней. Область навыка — `skills.domain`, иначе по основной характеристике (`skillDomain`). Титулов за серии подряд и ночную работу нет (PLAN 2г). Справочник `titles` сидится миграцией, а `persistEngineResult` сам добавляет недостающие строки — прод не зависит от ручного применения сида. Носить титул — `wearTitle` в `app/actions/game.ts`, выбор на `/character`.
- `lib/game/chronicle.ts` — Хроника: итоги периода, счётчики, heatmap (пустые дни нейтральны), «ты 30 дней назад и сейчас» (тот же `replay` по данным до даты), письмо Системы по шаблону (`chronicle.letter.*`). Экран `app/(app)/chronicle/`, данные — `lib/server/game/chronicle.ts`. Живое письмо пишет Claude через MCP: `get_week_summary` → текст → `save_week_letter` (в `weekly_chronicles.letter_text`), в Хронике оно заменяет шаблон.
- Таймер: `app/(app)/log/timer.tsx` (состояние в localStorage `status.timer`, переживает перезагрузку), `logTimer` в `app/actions/log.ts` — длительность по меткам, фокус — доля (по умолчанию 85%), источник `timer`.
- Смежный класс: после открытия класса Система предлагает до 4 классов, которые подходят персонажу и делят характеристику с основным (`sideClassOptions`). Выбор — решение `choose_side_class`, применяется после закрытия дня (чтобы работало в день открытия). Экран — `/character`, на «Статусе» «Класс: основной · смежный».
- Напоминания (фаза 3b): PWA (`app/manifest.ts`, `public/icons/`, `public/sw.js` — только push, без офлайн-кэша), подписка и настройки в `app/(app)/settings/reminders.tsx` + `app/actions/notifications.ts`. Когда напоминать — `lib/notifications/schedule.ts` (окно 2 часа после выбранного времени, раз в день, для 13–17 не позже 22:00, не напоминаем, если отчёт за день уже есть). Отправка — `lib/server/push` (web-push). Ключи VAPID сервер создаёт сам в `app_secrets` (служебная, без прав у пользователей) — в env их нет.
  - Планировщик: Vercel Hobby запускает cron раз в сутки, поэтому pg_cron в Supabase каждые 15 минут вызывает `public.trigger_cron(url)`: функция кладёт одноразовый токен в `cron_tokens` и шлёт запрос через pg_net на `/api/cron/checkins`; сервер сжигает токен (живёт 10 минут). Общий секрет вручную не нужен. Задание в облаке: `select cron.schedule('checkin-reminders', '*/15 * * * *', $$select public.trigger_cron('https://status-life-rpg.vercel.app/api/cron/checkins')$$);`
  - Локально проверено: `select public.trigger_cron('http://host.docker.internal:3000/api/cron/checkins')`, ответ — в `net._http_response`.
- Голосовой отчёт (фаза 3c): `components/game/voice-input.tsx` — распознавание речи браузера (Web Speech API, бесплатно; на Android короткие сессии с перезапуском, иначе дублируются фразы), склейка — `lib/checkin/voice.ts`. Без `ANTHROPIC_API_KEY` форма отчёта не прячется: кнопка «Скопировать для Claude» кладёт в буфер готовую просьбу + текст, Claude разбирает и пишет день через MCP (`claudePrompt`).
- `lib/game/messages.ts` — события движка → ключи `system.*` в `messages/*.json` (+ тон: normal / rare / epic).
- `lib/server/game/` — `loadEngineInput` (БД → вход движка, часовой пояс из профиля), `persistEngineResult` (кэши + леджер), `recomputeUser(db, userId)` — всё в одной транзакции с advisory lock. После любого изменения записей или решений пользователя вызывай `recomputeUser`.
- `lib/server/game/mutate.ts` — `mutateAndRecompute(userId, fn)`: изменение через `withUser` → пересчёт → системные сообщения о новых событиях (diff событий до/после). Все серверные действия, меняющие игру, идут через него.
- `lib/server/game/queries.ts` — данные для экранов: `getGameView` (движок «на лету» + имена из таблиц), `getJournal`, `getOnboardingState`.
- `app/actions/` — серверные действия (`onboarding.ts`, `game.ts`, `log.ts`), вход валидируется zod, ошибки — ключи `common.errors.*`.
- UI: `app/(app)/` — экраны с нижней навигацией (Статус, Навыки, Записать, Журнал), проверка онбординга в `layout.tsx`; `app/onboarding/` — мастер из 8 шагов. `components/game/system-messages.tsx` — провайдер «окна Системы»: `useSystem().run(action)` вызывает действие и показывает сообщения построчно. `components/ui/primitives.tsx` — Button, Chip, Panel, Bar, Stars (свои, в стиле shadcn).
- `lib/game/avatar.ts` + `components/game/avatar.tsx` / `avatar-editor.tsx` — 2D-персонаж (SVG-слои), конфиг в `characters.avatar_config`, `parseAvatar` защищает от битых данных. Страница `/character`, шаг внешности в онбординге.
- `components/game/attribute-card.tsx` — карточка характеристики с панелью описания (тексты `game.attrInfo.*`, `attrSheet.*`).
- `lib/game/onboarding.ts` + `data/presets.json` — опросник, 14 категорий, 63 группы, 103 обобщённых навыка с описаниями и тегами, подсказки по возрасту, оценка прошлых часов и стартовая оценка характеристик (формула, без LLM).
- Вечерний отчёт (фаза 1c): `app/(app)/checkin/` (форма и разбор `/checkin/[id]`), `app/actions/checkin.ts`. Поток: текст → `parseCheckinWithLlm` (`lib/server/llm/checkin.ts`, Claude через structured outputs + серверный fallback при отказе) → `normalizeCheckin` (`lib/checkin/normalize.ts`, чистая, с тестами) → черновики `activity_entries` (source `checkin`, status `draft`) + кандидаты + самочувствие в `hp_days`. В модель уходят только текст, названия навыков и записи дня с локальными метками `s1/e1`, без id из БД. Черновик с `merge_with` при подтверждении обновляет существующую запись (`lib/server/game/drafts.ts`). Промпт — `lib/checkin/prompt.ts`; модель и лимиты — `lib/server/llm/config.ts` (`LLM_MODEL`, `LLM_MONTHLY_LIMIT`).
  - ТЗ просило structured output через tool use; у Claude Opus 5.5 принудительный `tool_choice` запрещён, документация рекомендует `output_config.format` — сделано так.
- MCP (фаза 2): `app/api/mcp/route.ts` → `lib/server/mcp/server.ts` (`handleMcpRequest`: токен → лимит → `McpServer` без сессий, JSON-ответы) и `tools.ts` (7 инструментов SPEC 7.3 + `get_week_summary`/`save_week_letter`, всё через `withUserTx`, пересчёт при автоподтверждении). Токены: `tokens.ts` (`sts_…`, SHA-256 в `api_tokens`, создаёт/отзывает сервер в `app/actions/settings.ts`). Лимит 60/мин — `rate-limit.ts` + служебная `mcp_rate` (RLS без политик и прав). Источник записи — по User-Agent (`mcp_claude`/`mcp_chatgpt`/`mcp_other`).
  - OAuth 2.1 (перенесён из фазы 5: у владелицы в Claude нет Request headers). Сервер авторизации — OAuth Server Supabase Auth (бета, Authentication → OAuth Server: включён, путь `/oauth/consent`, динамическая регистрация клиентов). Status — защищённый ресурс: 401 из `/api/mcp` с `WWW-Authenticate: Bearer resource_metadata=…`, метаданные `app/.well-known/oauth-protected-resource/` (RFC 9728). Страница согласия `app/oauth/consent/` + `app/actions/oauth.ts`.
  - `lib/server/mcp/oauth.ts`: проверка access token Supabase через JWKS (`jose`), issuer `<SUPABASE_URL>/auth/v1`, нужен `client_id` (обычные сессионные JWT не принимаются). Каждому клиенту пользователя — строка в `api_tokens` с `token_hash = oauth:<user>:<client>`: записи помечаются клиентом, отзыв в Настройках даёт 401, новое согласие снимает отзыв.
  - Вход с возвратом: `proxy.ts` добавляет `?next=` при редиректе на `/login`, дальше `next` идёт через письмо (`/auth/finish?next=`), код и Google (`lib/safe-next.ts` — только пути сайта).
  - Локально OAuth-сервер включён в `supabase/config.jsonc`; RFC 8414 адрес с вставкой пути локально отдаёт 404, но `<issuer>/.well-known/oauth-authorization-server` работает. Dev-сервер пускает `127.0.0.1` (`allowedDevOrigins`), т. к. локальный site_url — 127.0.0.1.
- `/settings` — инструкция подключения Claude (OAuth), список подключённых ИИ и токенов с отзывом, ручной токен, автоподтверждение записей от ИИ, язык.
- `lib/server/llm/sleeping.ts` — онбординг: свободный рассказ → предложения спящих навыков с оценкой часов.
- `lib/db/client.ts` — подключение без `server-only` (для скриптов и тестов); `lib/db/index.ts` — серверные `adminDb()` и `withUser()`.
- `lib/db/schema.ts` — Drizzle-схема и RLS-политики (попадают в миграции). Миграции — `supabase/migrations/` (drizzle-kit с префиксом supabase); ручные SQL — через `drizzle-kit generate --custom`.
- Доступ к данным:
  - `withUser(userId, fn)` из `lib/db` — запросы от имени пользователя, RLS действует;
  - `adminDb()` — только игровой движок и системные задачи (леджер `xp_events`, `user_titles`, `api_tokens` пользователю доступны только на чтение);
  - `lib/supabase/server.ts` / `client.ts` — auth и простые чтения через supabase-js с JWT пользователя.
- Новый пользователь: триггер `handle_new_user` создаёт profile, settings, character, notification_settings и 3 общие характеристики.
- Auth: вход по письму + Google. `proxy.ts` обновляет сессию и пускает без входа только `/login`, `/auth/*`, `/api/*`.
  - Письмо отправляется implicit-клиентом → ссылка возвращает на `/auth/finish#access_token=…`, страница ставит сессию в браузере. Так ссылка работает в любом браузере/на телефоне (PKCE ломался, если письмо открыто не там, где запрошено).
  - В облаке шаблоны писем стандартные (менять можно только со своим SMTP): в письме только ссылка. Локально шаблон `supabase/templates/sign-in.html` с кодом и ссылкой на `/auth/confirm` (token_hash); поле кода включается `NEXT_PUBLIC_AUTH_EMAIL_CODE=true`.
  - Встроенная почта Supabase шлёт письма только на адреса участников организации и с жёстким лимитом в час. Для других людей нужен свой SMTP (Resend, фаза 3/5).
  - Google: кнопка скрыта, пока `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` не `true` (на проде `true` с 2026-11-26; локально провайдер не настроен); `/auth/callback` (PKCE) остаётся для OAuth. OAuth-клиент «Status web» в Google Cloud (проект `status-516001`, аккаунт владелицы), redirect URI — `https://jfrkugrsfiehgxvtckyb.supabase.co/auth/v1/callback`; Client ID и секрет вписаны в Supabase → Sign In / Providers → Google.
  - Ошибки Supabase Auth на форме входа переводятся в понятный текст (`lib/supabase/auth-errors.ts`: часовой лимит почты, повтор раньше минуты, адрес не разрешён, код устарел).
  - `/privacy` — публичная политика конфиденциальности (тексты `privacy.*`), нужна Google для экрана согласия; ссылка со страницы входа.
- i18n: next-intl без префикса в URL, локаль из куки `NEXT_LOCALE`, по умолчанию `ru`. Тексты — `messages/{ru,en}.json`.
- `cacheComponents` выключен: страницы персональные. Вернуться к нему для публичных страниц (фаза 5).

## Прод
- Supabase: проект `status`, ref `jfrkugrsfiehgxvtckyb`, регион ca-central-1, бесплатный тариф. URL `https://jfrkugrsfiehgxvtckyb.supabase.co`.
- Vercel: проект `status-life-rpg` (команда ann-mikhailova, Hobby), деплой на каждый пуш в `main`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Production + Preview) и `DATABASE_URL` (только Production; Supabase transaction pooler, порт 6543; вписала владелица). Превью-деплои без `DATABASE_URL` не работают с данными.
- `GET /api/health` — `{ ok, db }`: проверка, что прод видит базу.
- `ANTHROPIC_API_KEY` (Production) нужен для отчёта и разбора текста в онбординге; без него экраны показывают, что разбор не подключён.
- Миграции в облако: Supabase CLI (`supabase link --project-ref jfrkugrsfiehgxvtckyb`, затем `supabase db push`) требует входа владелицы (`supabase login`, в отдельном окне PowerShell — CLI не работает без TTY). Пока CLI не подключён, миграции применяются вручную через SQL Editor и записываются в `supabase_migrations.schema_migrations` (применены все, кроме `titles_seed`: его заменяет самовосстановление справочника в пересчёте). В облаке включены pg_net и pg_cron, задание `checkin-reminders` (`*/15 * * * *`) вызывает `public.trigger_cron('https://status-life-rpg.vercel.app/api/cron/checkins')`; ответы — в `net._http_response`.
- Облачный Supabase не выдаёт права на новые таблицы автоматически: каждую новую таблицу явно добавляй в миграцию с GRANT (см. `*_table_grants.sql`).

## Сделано
- Подготовка: SPEC, план (`docs/PLAN.md`), эталон баланса.
- Фаза 0 (закрыта 2026-11-26, вход на проде проверен владелицей): Next.js 16 + Tailwind 4, `lib/game` с тестами, схема БД со всеми таблицами, RLS и явными GRANT, тест RLS (95), auth, i18n, CI. Прод: https://status-life-rpg.vercel.app (Supabase Auth: Site URL и redirect URLs для прода, localhost и превью Vercel настроены).
- Фаза 1a: игровой движок `replay()` (24 сценарных теста), системные сообщения ru/en, загрузка/запись в БД, `pnpm game:recompute` с `--verify`, интеграционный тест пересчёта (повтор и порядок строк не меняют результат).
- Фаза 1b: онбординг (8 шагов, спящие навыки с калькулятором часов, стартовые навыки по слотам, оценка + калибровка), экраны Статус / Навыки / Журнал / Записать, окно Системы с анимацией, ввод сна и самочувствия, предложения навыков, специализации (название вручную), раскрытие и калибровка после него, теги для навыков без тегов. Проверено вручную в браузере на тестовом пользователе. Lighthouse пока не мерили.
- Отложено до 1c (нужен `ANTHROPIC_API_KEY`): разбор свободного текста в спящие навыки, оценка характеристик через LLM, варианты специализаций, теги для навыков из кандидатов.
- Отзыв после 1b: 2D-редактор персонажа, описания характеристик, каталог на все возрасты и профессии (PLAN 2в).
- Фаза 1c: вечерний отчёт → черновики через Claude, разбор с правкой/разделением/слиянием дублей, распознавание спящих навыков из текста. Поток проверен в браузере на имитированном разборе; живой вызов Claude и фикстура SPEC 8 (`pnpm test:llm`) ждут ключа API.
- Фаза 3c: голосовой ввод в отчёте, отчёт через Claude без ключа API. Фаза 3 закрыта. Тесты: 175 юнит. Распознавание речи на реальном устройстве проверяет владелица (встроенный браузер блокирует микрофон).
- Фаза 3b: PWA, web push, время напоминания и часовой пояс в настройках, планировщик pg_cron → `/api/cron/checkins`, смежные классы. Тесты: 170 юнит, 128 на БД. Push на устройстве владелицы проверен на проде 2026-11-26.
- Фаза 3a: титулы, классы, Хроника (сравнение, итоги недели и месяца, счётчики, heatmap, письмо Системы шаблоном и от Claude через MCP), таймер. Тесты: 160 юнит, 122 на БД. Проверено в браузере локально. Миграция `titles_seed` в облако не применялась вручную (не обязательна: пересчёт сам добавляет титулы).
- Фаза 2: MCP-сервер `/api/mcp` с токенами и OAuth 2.1 (Supabase OAuth Server), 7 инструментов, идемпотентность, лимит, страница согласия, настройки с инструкциями. Тесты: 119 на БД (вкл. MCP и OAuth). Локально проверен весь поток: DCR → вход → согласие → токен → вызов MCP. Подключение в Claude через OAuth проверено на проде 2026-11-26 (get_status, list_skills).
