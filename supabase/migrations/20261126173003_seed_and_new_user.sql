-- Справочник характеристик (из lib/game/data/attributes.json) и стартовые строки нового пользователя.
INSERT INTO "attributes" ("key", "parent_key", "name_ru", "name_en", "description_ru", "description_en", "sort_order") VALUES
  ('body', NULL, 'Тело', 'Body', NULL, NULL, 1),
  ('mind', NULL, 'Разум', 'Mind', NULL, NULL, 2),
  ('spirit', NULL, 'Дух', 'Spirit', NULL, NULL, 3),
  ('strength', 'body', 'Сила', 'Strength', 'Атлетика, тяжёлый физический труд, силовой спорт', 'Athletics, heavy physical work, strength sports', 1),
  ('dexterity', 'body', 'Ловкость', 'Dexterity', 'Спорт с техникой, танцы, инструменты, ремонт руками, кулинария, лабораторная техника', 'Technical sports, dance, instruments, manual repair, cooking, lab technique', 2),
  ('endurance', 'body', 'Выносливость', 'Endurance', 'Смены на ногах, кардио, долгие нагрузки. Увеличивает максимум HP', 'Long shifts on your feet, cardio, sustained effort. Raises max HP', 3),
  ('intellect', 'mind', 'Интеллект', 'Intellect', 'Учёба, наука, программирование, языки, анализ', 'Study, science, programming, languages, analysis', 4),
  ('perception', 'mind', 'Восприятие', 'Perception', 'Вождение, диагностика, наблюдения, контроль качества, рисование с натуры', 'Driving, diagnostics, observation, quality control, drawing from life', 5),
  ('will', 'mind', 'Воля', 'Will', 'Дисциплина и фокус: длинные сессии, тяжёлые задачи, регулярность', 'Discipline and focus: long sessions, hard tasks, consistency', 6),
  ('charisma', 'spirit', 'Харизма', 'Charisma', 'Преподавание, выступления, переговоры, торговля, лидерство', 'Teaching, public speaking, negotiation, sales, leadership', 7),
  ('empathy', 'spirit', 'Эмпатия', 'Empathy', 'Психология, медицинский уход, воспитание, поддержка людей', 'Psychology, care work, parenting, supporting people', 8),
  ('creativity', 'spirit', 'Творчество', 'Creativity', 'Искусство, музыка, тексты, дизайн, изобретательство', 'Art, music, writing, design, invention', 9)
ON CONFLICT ("key") DO UPDATE SET
  "parent_key" = EXCLUDED."parent_key",
  "name_ru" = EXCLUDED."name_ru",
  "name_en" = EXCLUDED."name_en",
  "description_ru" = EXCLUDED."description_ru",
  "description_en" = EXCLUDED."description_en",
  "sort_order" = EXCLUDED."sort_order";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.characters (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.notification_settings (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.user_attributes (user_id, attribute_key)
    SELECT NEW.id, a.key FROM public.attributes a WHERE a.parent_key IS NULL
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
