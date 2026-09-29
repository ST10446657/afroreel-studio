CREATE TABLE `post_targets` (
	`post_id` text NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`external_id` text,
	`error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `platform`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `targets_status_idx` ON `post_targets` (`status`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`video_url` text,
	`scheduled_at` text NOT NULL,
	`timezone` text DEFAULT 'Africa/Johannesburg' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_owner_schedule_idx` ON `posts` (`owner_id`,`scheduled_at`);