CREATE VIRTUAL TABLE `articles_fts` USING fts5(
	`title`,
	content='articles',
	content_rowid='rowid',
	tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `articles_fts_insert` AFTER INSERT ON `articles` BEGIN
	INSERT INTO `articles_fts`(`rowid`, `title`) VALUES (new.rowid, new.title);
END;
--> statement-breakpoint
CREATE TRIGGER `articles_fts_delete` AFTER DELETE ON `articles` BEGIN
	INSERT INTO `articles_fts`(`articles_fts`, `rowid`, `title`) VALUES ('delete', old.rowid, old.title);
END;
--> statement-breakpoint
CREATE TRIGGER `articles_fts_update` AFTER UPDATE OF `title` ON `articles` BEGIN
	INSERT INTO `articles_fts`(`articles_fts`, `rowid`, `title`) VALUES ('delete', old.rowid, old.title);
	INSERT INTO `articles_fts`(`rowid`, `title`) VALUES (new.rowid, new.title);
END;
--> statement-breakpoint
INSERT INTO `articles_fts`(`rowid`, `title`) SELECT rowid, title FROM `articles`;
--> statement-breakpoint
CREATE INDEX `idx_articles_published_collected` ON `articles` (`published_at`, `collected_at`);
