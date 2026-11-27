ALTER TYPE "public"."decision_kind" ADD VALUE 'choose_side_class';--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "last_sent_on" date;