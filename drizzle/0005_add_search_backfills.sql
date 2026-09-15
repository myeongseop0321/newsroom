CREATE TABLE `search_backfills` (
	`query_key` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`days` integer NOT NULL,
	`article_count` integer NOT NULL DEFAULT 0,
	`completed_at` text NOT NULL
);
