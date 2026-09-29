import {index,integer,primaryKey,sqliteTable,text} from 'drizzle-orm/sqlite-core';

export const posts=sqliteTable('posts',{
 id:text('id').primaryKey(),
 ownerId:text('owner_id').notNull(),
 language:text('language',{enum:['zu','en']}).notNull(),
 title:text('title').notNull(),
 caption:text('caption').notNull().default(''),
 videoUrl:text('video_url'),
 scheduledAt:text('scheduled_at').notNull(),
 timezone:text('timezone').notNull().default('Africa/Johannesburg'),
 status:text('status',{enum:['draft','ready','paused','publishing','published','failed']}).notNull().default('draft'),
 createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),
 updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},table=>[index('posts_owner_schedule_idx').on(table.ownerId,table.scheduledAt)]);

export const postTargets=sqliteTable('post_targets',{
 postId:text('post_id').notNull().references(()=>posts.id,{onDelete:'cascade'}),
 platform:text('platform',{enum:['Instagram','TikTok','Facebook','YouTube']}).notNull(),
 status:text('status',{enum:['draft','ready','queued','publishing','published','failed']}).notNull().default('draft'),
 externalId:text('external_id'),
 error:text('error'),
 updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},table=>[primaryKey({columns:[table.postId,table.platform]}),index('targets_status_idx').on(table.status)]);
