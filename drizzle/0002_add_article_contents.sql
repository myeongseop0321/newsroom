CREATE TABLE `article_contents` (
	`article_id` text PRIMARY KEY NOT NULL,
	`body` text DEFAULT '[]' NOT NULL,
	`author` text,
	`published_at` text,
	`image` text,
	`status` text NOT NULL,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_article_contents_fetched_at` ON `article_contents` (`fetched_at`);
