ALTER TABLE "entry_skill_allocations" ADD COLUMN "matches_specialization" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hp_days" ADD COLUMN "llm_rest_day" boolean;