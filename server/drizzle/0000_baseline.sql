CREATE TABLE `judges_matches` (
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `judges_matches_user_id` ON `judges_matches` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `judges_matches_match_id_user_id` ON `judges_matches` (`match_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `judges_mats` (
	`mat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `judges_mats_user_id` ON `judges_mats` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `judges_mats_mat_id_user_id` ON `judges_mats` (`mat_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `mat_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`mat_id` text NOT NULL,
	`code` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mat_codes_code_unique` ON `mat_codes` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `mat_codes_mat_id_role` ON `mat_codes` (`mat_id`,`role`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`mat_id` text NOT NULL,
	`red_competitor_id` text NOT NULL,
	`blue_competitor_id` text NOT NULL,
	`red_score` integer DEFAULT 0 NOT NULL,
	`blue_score` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`break_started_at` text,
	`break_duration` integer
);
--> statement-breakpoint
CREATE INDEX `matches_mat_id` ON `matches` (`mat_id`);--> statement-breakpoint
CREATE INDEX `incomplete_matches_idx` ON `matches` (`mat_id`) WHERE `ended_at` IS NULL;--> statement-breakpoint
CREATE TABLE `mats` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`judge_count` integer DEFAULT 1 NOT NULL,
	`creator_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mats_viewers` (
	`mat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mats_viewers_user_id` ON `mats_viewers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mats_viewers_mat_id_user_id` ON `mats_viewers` (`mat_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `riding_time_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`judge_id` text NOT NULL,
	`competitor_id` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `riding_time_votes_round_id` ON `riding_time_votes` (`round_id`);--> statement-breakpoint
CREATE TABLE `round_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`paused_at` text NOT NULL,
	`resumed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `round_pauses_round_id` ON `round_pauses` (`round_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`declared_winner_id` text,
	`stoppage` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`api_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_api_token_unique` ON `users` (`api_token`);