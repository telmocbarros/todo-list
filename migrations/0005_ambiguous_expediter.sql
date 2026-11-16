ALTER TABLE `todos` ADD `completed_at` text;--> statement-breakpoint
-- Todos completed before this column existed: their last update is the best guess for when
UPDATE `todos` SET `completed_at` = `updated_at` WHERE `completed` = 1;
