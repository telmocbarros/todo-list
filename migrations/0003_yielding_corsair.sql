-- Hand-written, replacing what drizzle-kit generated. Its ALTER TABLE ... ADD user_id NOT NULL fails on
-- any table that has rows, and created the foreign keys without ON DELETE CASCADE. SQLite cannot add a
-- NOT NULL foreign key in place, so the tables are rebuilt.
-- Existing todos and labels are discarded: they have no owner to move to. Nothing was deployed, and the
-- local database was reset for this phase. Later schema changes must copy rows across instead.
DROP TABLE `todo_labels`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
DROP TABLE `labels`;--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `labels_user_name_unique` ON `labels` (`user_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`completed` integer NOT NULL,
	`priority` text NOT NULL,
	`due_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `todo_labels` (
	`todo_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`todo_id`, `label_id`),
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
