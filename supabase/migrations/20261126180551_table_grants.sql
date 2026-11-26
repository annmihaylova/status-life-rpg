-- Явные права доступа к таблицам. В облачном Supabase новые таблицы больше не получают
-- права для anon/authenticated автоматически, а локальный стек их выдаёт — фиксируем одинаково.
-- RLS по-прежнему решает, какие строки видны; права решают, какие операции вообще возможны.

-- Сначала снимаем всё, что могло быть выдано по умолчанию.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO anon, authenticated;
--> statement-breakpoint

-- Справочники: читают все.
GRANT SELECT ON public.attributes, public.titles TO anon, authenticated;
--> statement-breakpoint

-- Обычные пользовательские таблицы: полный доступ к своим строкам (RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.user_settings,
  public.onboarding_profiles,
  public.characters,
  public.user_attributes,
  public.attribute_xp_tags,
  public.calibrations,
  public.attribute_assessment,
  public.skills,
  public.skill_specializations,
  public.skill_candidates,
  public.checkins,
  public.activity_entries,
  public.entry_skill_allocations,
  public.game_decisions,
  public.hp_days,
  public.notification_settings,
  public.push_subscriptions,
  public.weekly_chronicles
TO authenticated;
--> statement-breakpoint

-- Выданное Системой: только чтение. Пишет игровой движок привилегированным подключением.
GRANT SELECT ON public.xp_events, public.user_titles, public.api_tokens TO authenticated;
