CREATE TYPE "public"."attribute_state" AS ENUM('general', 'unfolded', 'part');--> statement-breakpoint
CREATE TYPE "public"."calibration_kind" AS ENUM('start', 'unfold');--> statement-breakpoint
CREATE TYPE "public"."checkin_status" AS ENUM('pending', 'parsed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."decision_kind" AS ENUM('take_skill', 'snooze_skill', 'decline_skill', 'archive_skill', 'restore_skill', 'move_slot', 'add_sleeping_skill', 'update_sleeping_estimate', 'choose_specialization', 'set_skill_tags', 'assessment', 'calibration_move', 'calibration_finish', 'unfold', 'decline_unfold', 'wear_title', 'set_experiments');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('mcp_claude', 'mcp_chatgpt', 'mcp_other', 'checkin', 'manual', 'timer');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('draft', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('accruing', 'offered', 'snoozed', 'declined', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."skill_slot" AS ENUM('main', 'secondary', 'none');--> statement-breakpoint
CREATE TYPE "public"."skill_status" AS ENUM('active', 'sleeping', 'archived');--> statement-breakpoint
CREATE TYPE "public"."xp_target" AS ENUM('character', 'skill', 'candidate', 'attribute');--> statement-breakpoint
CREATE TABLE "activity_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"started_at" timestamp with time zone,
	"focus_minutes" integer NOT NULL,
	"intensity" real DEFAULT 1 NOT NULL,
	"novelty" real DEFAULT 1 NOT NULL,
	"description" text NOT NULL,
	"source" "entry_source" NOT NULL,
	"status" "entry_status" DEFAULT 'draft' NOT NULL,
	"is_rest" boolean DEFAULT false NOT NULL,
	"attribute_tags" jsonb,
	"confidence" real,
	"evidence" text,
	"client_ref" text,
	"checkin_id" uuid,
	"created_by_token" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attribute_assessment" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"values" jsonb NOT NULL,
	"explanations" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribute_assessment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attribute_xp_tags" (
	"user_id" uuid NOT NULL,
	"general_key" text NOT NULL,
	"part_key" text NOT NULL,
	"xp" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "attribute_xp_tags_user_id_general_key_part_key_pk" PRIMARY KEY("user_id","general_key","part_key")
);
--> statement-breakpoint
ALTER TABLE "attribute_xp_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attributes" (
	"key" text PRIMARY KEY NOT NULL,
	"parent_key" text,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"description_ru" text,
	"description_en" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attributes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "calibration_kind" NOT NULL,
	"general_key" text,
	"points_total" integer NOT NULL,
	"points_used" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calibrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "characters" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"game_name" text,
	"title_key" text,
	"class_key" text,
	"avatar_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"avatar_vrm_path" text,
	"level_cache" integer DEFAULT 1 NOT NULL,
	"total_xp_cache" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"transcript" text NOT NULL,
	"audio_path" text,
	"llm_raw" jsonb,
	"status" "checkin_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "entry_skill_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"skill_id" uuid,
	"activity_cluster" text,
	"share" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_skill_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "game_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "decision_kind" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hp_days" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"hp_max" integer NOT NULL,
	"hp_morning" integer NOT NULL,
	"hp_current" integer NOT NULL,
	"sleep_hours" real,
	"mood_1_5" integer,
	"sick" boolean DEFAULT false NOT NULL,
	"manual_rest" boolean DEFAULT false NOT NULL,
	"effects" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "hp_days_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "hp_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"checkin_local_time" text DEFAULT '21:00' NOT NULL,
	"channels" jsonb DEFAULT '{"push":true,"email":false}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "onboarding_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"age_band" text,
	"occupations" text[] DEFAULT '{}'::text[] NOT NULL,
	"groups" text[] DEFAULT '{}'::text[] NOT NULL,
	"goals" text[] DEFAULT '{}'::text[] NOT NULL,
	"about_text" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cluster_key" text NOT NULL,
	"suggested_name" text,
	"scope" text DEFAULT '' NOT NULL,
	"attribute_tags" jsonb,
	"is_work_shift" boolean DEFAULT false NOT NULL,
	"requested" boolean DEFAULT false NOT NULL,
	"xp_pool" double precision DEFAULT 0 NOT NULL,
	"minutes_total" integer DEFAULT 0 NOT NULL,
	"days_seen" integer DEFAULT 0 NOT NULL,
	"first_seen" date,
	"last_seen" date,
	"offer_status" "offer_status" DEFAULT 'accruing' NOT NULL,
	"offered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skill_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skill_specializations" (
	"skill_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"milestone_level" integer NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"chosen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_specializations_skill_id_milestone_level_pk" PRIMARY KEY("skill_id","milestone_level")
);
--> statement-breakpoint
ALTER TABLE "skill_specializations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"domain" text,
	"cluster_key" text,
	"is_work_shift" boolean DEFAULT false NOT NULL,
	"is_rest" boolean DEFAULT false NOT NULL,
	"primary_attr_key" text,
	"secondary_attr_key" text,
	"slot" "skill_slot" DEFAULT 'none' NOT NULL,
	"status" "skill_status" DEFAULT 'active' NOT NULL,
	"sleeping_past_hours" real,
	"sleeping_target_level" integer,
	"awakened_at" timestamp with time zone,
	"taken_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"slot_changed_at" timestamp with time zone,
	"xp_cache" double precision DEFAULT 0 NOT NULL,
	"level_cache" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "titles" (
	"key" text PRIMARY KEY NOT NULL,
	"name_ru" text NOT NULL,
	"name_en" text NOT NULL,
	"rule" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_attributes" (
	"user_id" uuid NOT NULL,
	"attribute_key" text NOT NULL,
	"value" integer DEFAULT 10 NOT NULL,
	"xp_pool" double precision DEFAULT 0 NOT NULL,
	"active_days_since_point" integer DEFAULT 0 NOT NULL,
	"xp_total" double precision DEFAULT 0 NOT NULL,
	"active_days_total" integer DEFAULT 0 NOT NULL,
	"state" "attribute_state" DEFAULT 'general' NOT NULL,
	"unfold_offered_at" timestamp with time zone,
	"unfolded_at" timestamp with time zone,
	CONSTRAINT "user_attributes_user_id_attribute_key_pk" PRIMARY KEY("user_id","attribute_key")
);
--> statement-breakpoint
ALTER TABLE "user_attributes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auto_confirm_ai" boolean DEFAULT false NOT NULL,
	"experiments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"large_text" boolean DEFAULT false NOT NULL,
	"sound_enabled" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_titles" (
	"user_id" uuid NOT NULL,
	"title_key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_titles_user_id_title_key_pk" PRIMARY KEY("user_id","title_key")
);
--> statement-breakpoint
ALTER TABLE "user_titles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_chronicles" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"stats" jsonb NOT NULL,
	"letter_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_chronicles_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
ALTER TABLE "weekly_chronicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_id" uuid,
	"target_type" "xp_target" NOT NULL,
	"target_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"multipliers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"formula_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "xp_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_checkin_id_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_assessment" ADD CONSTRAINT "attribute_assessment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_xp_tags" ADD CONSTRAINT "attribute_xp_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_xp_tags" ADD CONSTRAINT "attribute_xp_tags_general_key_attributes_key_fk" FOREIGN KEY ("general_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_xp_tags" ADD CONSTRAINT "attribute_xp_tags_part_key_attributes_key_fk" FOREIGN KEY ("part_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_parent_key_attributes_key_fk" FOREIGN KEY ("parent_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calibrations" ADD CONSTRAINT "calibrations_general_key_attributes_key_fk" FOREIGN KEY ("general_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_title_key_titles_key_fk" FOREIGN KEY ("title_key") REFERENCES "public"."titles"("key") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_skill_allocations" ADD CONSTRAINT "entry_skill_allocations_entry_id_activity_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."activity_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_skill_allocations" ADD CONSTRAINT "entry_skill_allocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_skill_allocations" ADD CONSTRAINT "entry_skill_allocations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_decisions" ADD CONSTRAINT "game_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hp_days" ADD CONSTRAINT "hp_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_profiles" ADD CONSTRAINT "onboarding_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_candidates" ADD CONSTRAINT "skill_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_specializations" ADD CONSTRAINT "skill_specializations_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_specializations" ADD CONSTRAINT "skill_specializations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_primary_attr_key_attributes_key_fk" FOREIGN KEY ("primary_attr_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_secondary_attr_key_attributes_key_fk" FOREIGN KEY ("secondary_attr_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_attributes" ADD CONSTRAINT "user_attributes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_attributes" ADD CONSTRAINT "user_attributes_attribute_key_attributes_key_fk" FOREIGN KEY ("attribute_key") REFERENCES "public"."attributes"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_titles" ADD CONSTRAINT "user_titles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_titles" ADD CONSTRAINT "user_titles_title_key_titles_key_fk" FOREIGN KEY ("title_key") REFERENCES "public"."titles"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_chronicles" ADD CONSTRAINT "weekly_chronicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_entry_id_activity_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."activity_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_entries_user_date_idx" ON "activity_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_entries_client_ref_uq" ON "activity_entries" USING btree ("user_id","date","client_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_uq" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "calibrations_user_idx" ON "calibrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "checkins_user_date_idx" ON "checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "entry_skill_allocations_entry_idx" ON "entry_skill_allocations" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "game_decisions_user_idx" ON "game_decisions" USING btree ("user_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_candidates_user_cluster_uq" ON "skill_candidates" USING btree ("user_id","cluster_key");--> statement-breakpoint
CREATE INDEX "skills_user_idx" ON "skills" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xp_events_user_created_idx" ON "xp_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE POLICY "activity_entries_select_own" ON "activity_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("activity_entries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_entries_insert_own" ON "activity_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("activity_entries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_entries_update_own" ON "activity_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("activity_entries"."user_id" = (select auth.uid())) WITH CHECK ("activity_entries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "activity_entries_delete_own" ON "activity_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("activity_entries"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "api_tokens_select_own" ON "api_tokens" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("api_tokens"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_assessment_select_own" ON "attribute_assessment" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("attribute_assessment"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_assessment_insert_own" ON "attribute_assessment" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("attribute_assessment"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_assessment_update_own" ON "attribute_assessment" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("attribute_assessment"."user_id" = (select auth.uid())) WITH CHECK ("attribute_assessment"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_assessment_delete_own" ON "attribute_assessment" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("attribute_assessment"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_xp_tags_select_own" ON "attribute_xp_tags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("attribute_xp_tags"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_xp_tags_insert_own" ON "attribute_xp_tags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("attribute_xp_tags"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_xp_tags_update_own" ON "attribute_xp_tags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("attribute_xp_tags"."user_id" = (select auth.uid())) WITH CHECK ("attribute_xp_tags"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attribute_xp_tags_delete_own" ON "attribute_xp_tags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("attribute_xp_tags"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "attributes_select_all" ON "attributes" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "calibrations_select_own" ON "calibrations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("calibrations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "calibrations_insert_own" ON "calibrations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("calibrations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "calibrations_update_own" ON "calibrations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("calibrations"."user_id" = (select auth.uid())) WITH CHECK ("calibrations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "calibrations_delete_own" ON "calibrations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("calibrations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "characters_select_own" ON "characters" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("characters"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "characters_insert_own" ON "characters" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("characters"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "characters_update_own" ON "characters" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("characters"."user_id" = (select auth.uid())) WITH CHECK ("characters"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "characters_delete_own" ON "characters" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("characters"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "checkins_select_own" ON "checkins" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "checkins_insert_own" ON "checkins" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "checkins_update_own" ON "checkins" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("checkins"."user_id" = (select auth.uid())) WITH CHECK ("checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "checkins_delete_own" ON "checkins" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("checkins"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "entry_skill_allocations_select_own" ON "entry_skill_allocations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("entry_skill_allocations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "entry_skill_allocations_insert_own" ON "entry_skill_allocations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("entry_skill_allocations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "entry_skill_allocations_update_own" ON "entry_skill_allocations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("entry_skill_allocations"."user_id" = (select auth.uid())) WITH CHECK ("entry_skill_allocations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "entry_skill_allocations_delete_own" ON "entry_skill_allocations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("entry_skill_allocations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "game_decisions_select_own" ON "game_decisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("game_decisions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "game_decisions_insert_own" ON "game_decisions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("game_decisions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "game_decisions_update_own" ON "game_decisions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("game_decisions"."user_id" = (select auth.uid())) WITH CHECK ("game_decisions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "game_decisions_delete_own" ON "game_decisions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("game_decisions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "hp_days_select_own" ON "hp_days" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("hp_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "hp_days_insert_own" ON "hp_days" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("hp_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "hp_days_update_own" ON "hp_days" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("hp_days"."user_id" = (select auth.uid())) WITH CHECK ("hp_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "hp_days_delete_own" ON "hp_days" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("hp_days"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notification_settings_select_own" ON "notification_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("notification_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notification_settings_insert_own" ON "notification_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("notification_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notification_settings_update_own" ON "notification_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("notification_settings"."user_id" = (select auth.uid())) WITH CHECK ("notification_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "notification_settings_delete_own" ON "notification_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("notification_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "onboarding_profiles_select_own" ON "onboarding_profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("onboarding_profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "onboarding_profiles_insert_own" ON "onboarding_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("onboarding_profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "onboarding_profiles_update_own" ON "onboarding_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("onboarding_profiles"."user_id" = (select auth.uid())) WITH CHECK ("onboarding_profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "onboarding_profiles_delete_own" ON "onboarding_profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("onboarding_profiles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_insert_own" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = (select auth.uid())) WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_delete_own" ON "profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_select_own" ON "push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_insert_own" ON "push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_update_own" ON "push_subscriptions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid())) WITH CHECK ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "push_subscriptions_delete_own" ON "push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("push_subscriptions"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_candidates_select_own" ON "skill_candidates" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("skill_candidates"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_candidates_insert_own" ON "skill_candidates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("skill_candidates"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_candidates_update_own" ON "skill_candidates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("skill_candidates"."user_id" = (select auth.uid())) WITH CHECK ("skill_candidates"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_candidates_delete_own" ON "skill_candidates" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("skill_candidates"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_specializations_select_own" ON "skill_specializations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("skill_specializations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_specializations_insert_own" ON "skill_specializations" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("skill_specializations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_specializations_update_own" ON "skill_specializations" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("skill_specializations"."user_id" = (select auth.uid())) WITH CHECK ("skill_specializations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skill_specializations_delete_own" ON "skill_specializations" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("skill_specializations"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skills_select_own" ON "skills" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("skills"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skills_insert_own" ON "skills" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("skills"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skills_update_own" ON "skills" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("skills"."user_id" = (select auth.uid())) WITH CHECK ("skills"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "skills_delete_own" ON "skills" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("skills"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "titles_select_all" ON "titles" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);--> statement-breakpoint
CREATE POLICY "user_attributes_select_own" ON "user_attributes" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_attributes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_attributes_insert_own" ON "user_attributes" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_attributes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_attributes_update_own" ON "user_attributes" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_attributes"."user_id" = (select auth.uid())) WITH CHECK ("user_attributes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_attributes_delete_own" ON "user_attributes" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_attributes"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_settings_select_own" ON "user_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_settings_insert_own" ON "user_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("user_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_settings_update_own" ON "user_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("user_settings"."user_id" = (select auth.uid())) WITH CHECK ("user_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_settings_delete_own" ON "user_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("user_settings"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "user_titles_select_own" ON "user_titles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("user_titles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_chronicles_select_own" ON "weekly_chronicles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("weekly_chronicles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_chronicles_insert_own" ON "weekly_chronicles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("weekly_chronicles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_chronicles_update_own" ON "weekly_chronicles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("weekly_chronicles"."user_id" = (select auth.uid())) WITH CHECK ("weekly_chronicles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "weekly_chronicles_delete_own" ON "weekly_chronicles" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("weekly_chronicles"."user_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "xp_events_select_own" ON "xp_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("xp_events"."user_id" = (select auth.uid()));