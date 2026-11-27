CREATE TABLE "app_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cron_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cron_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- служебные таблицы: никаких прав у anon/authenticated, доступ только у сервера
REVOKE ALL ON public.app_secrets FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public.cron_tokens FROM anon, authenticated;--> statement-breakpoint
-- планировщик: pg_cron вызывает эту функцию, она кладёт одноразовый токен и шлёт запрос к приложению
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.trigger_cron(url text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $fn$
DECLARE
  t text := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.cron_tokens WHERE created_at < now() - interval '1 hour';
  INSERT INTO public.cron_tokens (token) VALUES (t);
  RETURN net.http_post(
    url := url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('authorization', 'Bearer ' || t, 'content-type', 'application/json'),
    timeout_milliseconds := 30000
  );
END
$fn$;--> statement-breakpoint
-- иначе любой мог бы получить токен на свой адрес
REVOKE ALL ON FUNCTION public.trigger_cron(text) FROM PUBLIC, anon, authenticated;
