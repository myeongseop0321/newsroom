CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`publisher` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`section` text NOT NULL,
	`published_at` text,
	`collected_at` text NOT NULL,
	`image` text
);
--> statement-breakpoint
CREATE INDEX `idx_articles_publisher_collected` ON `articles` (`publisher`,`collected_at`);--> statement-breakpoint
CREATE TABLE `scraps` (
	`user_id` text NOT NULL,
	`article_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `article_id`),
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`publishers` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`refresh_until` integer DEFAULT 0 NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`analysis_mode` text DEFAULT 'none' NOT NULL,
	`analysis_at` text
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`publisher` text NOT NULL,
	`section` text NOT NULL,
	`status` text NOT NULL,
	`count` integer NOT NULL,
	`checked_at` text NOT NULL,
	`message` text,
	PRIMARY KEY(`publisher`, `section`)
);
