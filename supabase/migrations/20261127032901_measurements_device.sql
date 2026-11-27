ALTER TYPE "public"."entry_source" ADD VALUE 'device';--> statement-breakpoint
CREATE TABLE "skill_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"scale" text NOT NULL,
	"value_num" double precision,
	"value_text" text NOT NULL,
	"unit" text,
	"note" text,
	"measured_on" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "skill_measurements" ADD CONSTRAINT "skill_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_measurements" ADD CONSTRAINT "skill_measurements_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_measurements_skill_idx" ON "skill_measurements" USING btree ("skill_id","measured_on");--> statement-breakpoint
CREATE POLICY "skill_measurements_select_own" ON "skill_measurements" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("skill_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_measurements_insert_own" ON "skill_measurements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("skill_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_measurements_update_own" ON "skill_measurements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("skill_measurements"."user_id" = (select auth.uid())) WITH CHECK ("skill_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_measurements_delete_own" ON "skill_measurements" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("skill_measurements"."user_id" = (select auth.uid()));--> statement-breakpoint
-- облачный Supabase не выдаёт права на новые таблицы сам
REVOKE ALL ON public.skill_measurements FROM anon;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.skill_measurements TO authenticated;
