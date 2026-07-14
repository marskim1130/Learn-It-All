ALTER TABLE "messages" ADD COLUMN "attachment_file_name" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachment_mime_type" text;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachment_size_bytes" integer;
