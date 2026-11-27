CREATE TABLE "mcp_rate" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_rate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mcp_rate" ADD CONSTRAINT "mcp_rate_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- служебная таблица: никаких прав у anon/authenticated, доступ только у сервера
REVOKE ALL ON public.mcp_rate FROM anon, authenticated;
