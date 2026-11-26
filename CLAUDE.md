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
- `lib/game/messages.ts` — события движка → ключи `system.*` в `messages/*.json` (+ тон: normal / rare / epic).
- `lib/server/game/` — `loadEngineInput` (БД → вход движка, часовой пояс из профиля), `persistEngineResult` (кэши + леджер), `recomputeUser(db, userId)` — всё в одной транзакции с advisory lock. После любого изменения записей или решений пользователя вызывай `recomputeUser`.
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
  - Google: кнопка скрыта, пока `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` не `true`; `/auth/callback` (PKCE) остаётся для OAuth.
- i18n: next-intl без префикса в URL, локаль из куки `NEXT_LOCALE`, по умолчанию `ru`. Тексты — `messages/{ru,en}.json`.
- `cacheComponents` выключен: страницы персональные. Вернуться к нему для публичных страниц (фаза 5).

## Прод
- Supabase: проект `status`, ref `jfrkugrsfiehgxvtckyb`, регион ca-central-1, бесплатный тариф. URL `https://jfrkugrsfiehgxvtckyb.supabase.co`.
- Vercel: проект `status-life-rpg` (команда ann-mikhailova, Hobby), деплой на каждый пуш в `main`. В env только `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `DATABASE_URL` добавит владелица, когда серверу понадобится прямой доступ к БД (фаза 1).
- Миграции в облако: Supabase CLI (`supabase link --project-ref jfrkugrsfiehgxvtckyb`, затем `supabase db push`) требует входа владелицы (`supabase login`, в отдельном окне PowerShell — CLI не работает без TTY). Первые три миграции применены вручную через SQL Editor и записаны в `supabase_migrations.schema_migrations`.
- Облачный Supabase не выдаёт права на новые таблицы автоматически: каждую новую таблицу явно добавляй в миграцию с GRANT (см. `*_table_grants.sql`).

## Сделано
- Подготовка: SPEC, план (`docs/PLAN.md`), эталон баланса.
- Фаза 0 (закрыта 2026-11-26, вход на проде проверен владелицей): Next.js 16 + Tailwind 4, `lib/game` с тестами, схема БД со всеми таблицами, RLS и явными GRANT, тест RLS (95), auth, i18n, CI. Прод: https://status-life-rpg.vercel.app (Supabase Auth: Site URL и redirect URLs для прода, localhost и превью Vercel настроены).
- Фаза 1a: игровой движок `replay()` (24 сценарных теста), системные сообщения ru/en, загрузка/запись в БД, `pnpm game:recompute` с `--verify`, интеграционный тест пересчёта (повтор и порядок строк не меняют результат).
- Следующее: фаза 1b (онбординг, Status, Skills, Journal, ручной лог, системные сообщения в UI).
