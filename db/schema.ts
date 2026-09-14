import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id: text('id').primaryKey(), email: text('email').notNull().unique(), displayName: text('display_name').notNull(),
 passwordHash: text('password_hash').notNull(), passwordSalt: text('password_salt').notNull(), createdAt: text('created_at').notNull(),
});
export const sessions = sqliteTable('sessions', {
 tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
 expiresAt: integer('expires_at').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('idx_sessions_user_id').on(t.userId),index('idx_sessions_expires_at').on(t.expiresAt)]);
export const settings = sqliteTable('settings', {
 userId: text('user_id').primaryKey(), publishers: text('publishers').notNull().default('[]'),
 revision: integer('revision').notNull().default(0), refreshUntil: integer('refresh_until').notNull().default(0),
 topics: text('topics').notNull().default('[]'), analysisMode: text('analysis_mode').notNull().default('none'), analysisAt: text('analysis_at'),
});
export const articles = sqliteTable('articles', {
 id: text('id').primaryKey(), publisher: text('publisher').notNull(), title: text('title').notNull(), url: text('url').notNull(),
 section: text('section').notNull(), publishedAt: text('published_at'), collectedAt: text('collected_at').notNull(), image: text('image'),
}, t => [index('idx_articles_publisher_collected').on(t.publisher,t.collectedAt)]);
export const articleContents = sqliteTable('article_contents', {
 articleId: text('article_id').primaryKey().references(()=>articles.id,{onDelete:'cascade'}), body: text('body').notNull().default('[]'),
 author: text('author'), publishedAt: text('published_at'), image: text('image'), status: text('status').notNull(), fetchedAt: text('fetched_at').notNull(),
}, t => [index('idx_article_contents_fetched_at').on(t.fetchedAt)]);
export const scraps = sqliteTable('scraps', {
 userId: text('user_id').notNull(), articleId: text('article_id').notNull().references(()=>articles.id), createdAt: text('created_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.articleId]})]);
export const sources = sqliteTable('sources', {
 publisher: text('publisher').notNull(), section: text('section').notNull(), status: text('status').notNull(),
 count: integer('count').notNull(), checkedAt: text('checked_at').notNull(), message: text('message'),
}, t => [primaryKey({columns:[t.publisher,t.section]})]);
