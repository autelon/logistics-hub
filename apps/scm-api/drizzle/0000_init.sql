CREATE TABLE `locations` (
	`code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`type` varchar(32) NOT NULL,
	`partner` varchar(100) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `locations_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
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
CREATE TABLE `products` (
	`sku` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `products_sku` PRIMARY KEY(`sku`)
);
--> statement-breakpoint
CREATE TABLE `unit_event_corrections` (
	`id` varchar(36) NOT NULL,
	`target_event_id` varchar(36) NOT NULL,
	`replacement_event_id` varchar(36),
	`reason` varchar(500) NOT NULL,
	`actor` varchar(100) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	CONSTRAINT `unit_event_corrections_id` PRIMARY KEY(`id`),
	CONSTRAINT `unit_event_corrections_targetEventId_unique` UNIQUE(`target_event_id`)
);
--> statement-breakpoint
CREATE TABLE `unit_events` (
	`id` varchar(36) NOT NULL,
	`unit_id` varchar(36) NOT NULL,
	`type` varchar(32) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	`location_code` varchar(64),
	`order_id` varchar(100),
	`fulfillment_item_id` varchar(100),
	`case_id` varchar(100),
	`source_system` varchar(100) NOT NULL,
	`source_ref` varchar(200),
	`idempotency_key` varchar(200),
	`note` varchar(500),
	CONSTRAINT `unit_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `unit_events_idempotencyKey_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` varchar(36) NOT NULL,
	`serial_number` varchar(100) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`location_code` varchar(64),
	`order_id` varchar(100),
	`fulfillment_item_id` varchar(100),
	`anomalies` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `units_id` PRIMARY KEY(`id`),
	CONSTRAINT `units_serialNumber_unique` UNIQUE(`serial_number`)
);
--> statement-breakpoint
ALTER TABLE `unit_event_corrections` ADD CONSTRAINT `unit_event_corrections_target_event_id_unit_events_id_fk` FOREIGN KEY (`target_event_id`) REFERENCES `unit_events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_event_corrections` ADD CONSTRAINT `unit_event_corrections_replacement_event_id_unit_events_id_fk` FOREIGN KEY (`replacement_event_id`) REFERENCES `unit_events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_events` ADD CONSTRAINT `unit_events_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `unit_events` ADD CONSTRAINT `unit_events_location_code_locations_code_fk` FOREIGN KEY (`location_code`) REFERENCES `locations`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_sku_products_sku_fk` FOREIGN KEY (`sku`) REFERENCES `products`(`sku`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_location_code_locations_code_fk` FOREIGN KEY (`location_code`) REFERENCES `locations`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `outbox_unpublished_idx` ON `outbox_events` (`published_at`,`id`);--> statement-breakpoint
CREATE INDEX `unit_events_unit_idx` ON `unit_events` (`unit_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `units_stock_idx` ON `units` (`sku`,`location_code`,`status`);