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
- Переводы строк — LF (`.gitattributes`).

## Команды
| Команда | Что делает |
|---|---|
| `pnpm dev` | dev-сервер на :3000 (нужен `.env.local`, см. `.env.example`) |
| `pnpm build` | прод-сборка |
| `pnpm lint` / `pnpm typecheck` | ESLint / `next typegen` + tsc |
| `pnpm test` | юнит-тесты (vitest), в т.ч. игровая математика |
| `pnpm test:db` | тест RLS по всем таблицам, нужен запущенный локальный Supabase |
| `pnpm db:start` / `pnpm db:stop` | локальный Supabase в Docker |
| `pnpm db:reset` | пересоздать локальную БД из `supabase/migrations` |
| `pnpm db:generate` | сгенерировать миграцию из `lib/db/schema.ts` |
| `pnpm balance` | эталонные таблицы баланса |

## Архитектура
- `lib/game/` — чистые функции: `config.ts` (все константы, `FORMULA_VERSION`, эксперименты), `formulas.ts` (уровни, навыки, характеристики, раскрытие, калибровка, слоты), `hp.ts` (HP, статусы, день отдыха, «Второе дыхание»), `attributes.ts` + `data/attributes.json`.
- `lib/db/schema.ts` — Drizzle-схема и RLS-политики (попадают в миграции). Миграции — `supabase/migrations/` (drizzle-kit с префиксом supabase); ручные SQL — через `drizzle-kit generate --custom`.
- Доступ к данным:
  - `withUser(userId, fn)` из `lib/db` — запросы от имени пользователя, RLS действует;
  - `adminDb()` — только игровой движок и системные задачи (леджер `xp_events`, `user_titles`, `api_tokens` пользователю доступны только на чтение);
  - `lib/supabase/server.ts` / `client.ts` — auth и простые чтения через supabase-js с JWT пользователя.
- Новый пользователь: триггер `handle_new_user` создаёт profile, settings, character, notification_settings и 3 общие характеристики.
- Auth: magic link + Google (Supabase, PKCE), возврат на `/auth/callback`. `proxy.ts` обновляет сессию и пускает без входа только `/login`, `/auth/*`, `/api/*`.
- i18n: next-intl без префикса в URL, локаль из куки `NEXT_LOCALE`, по умолчанию `ru`. Тексты — `messages/{ru,en}.json`.
- `cacheComponents` выключен: страницы персональные. Вернуться к нему для публичных страниц (фаза 5).

## Сделано
- Подготовка: SPEC, план (`docs/PLAN.md`), эталон баланса.
- Фаза 0 (в работе): Next.js 16 + Tailwind 4, `lib/game` с тестами, схема БД со всеми таблицами и RLS, тест RLS, auth, i18n, CI. Осталось: облачный Supabase и деплой на Vercel (нужны аккаунты владелицы).
