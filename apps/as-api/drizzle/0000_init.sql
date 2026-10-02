CREATE TABLE `outbox_events` (
	`id` varchar(36) NOT NULL,
	`topic` varchar(100) NOT NULL,
	`key` varchar(200) NOT NULL,
	`payload` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`published_at` datetime(3),
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `public_id_counters` (
	`id` varchar(36) NOT NULL,
	`scope` varchar(32) NOT NULL,
	`last` int NOT NULL,
	CONSTRAINT `public_id_counters_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_id_counters_scope_unique` UNIQUE(`scope`)
);
--> statement-breakpoint
CREATE TABLE `service_cases` (
	`id` varchar(36) NOT NULL,
	`public_id` varchar(32) NOT NULL,
	`serial_number` varchar(100) NOT NULL,
	`origin` varchar(32) NOT NULL,
	`symptom` varchar(500) NOT NULL,
	`related_case_id` varchar(36),
	`status` varchar(32) NOT NULL,
	`disposition` varchar(32),
	`opened_at` datetime(3) NOT NULL,
	`confirmed_at` datetime(3),
	`scrapped_at` datetime(3),
	CONSTRAINT `service_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_cases_publicId_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE INDEX `outbox_unpublished_idx` ON `outbox_events` (`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `service_cases_serial_idx` ON `service_cases` (`serial_number`);