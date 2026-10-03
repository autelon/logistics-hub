CREATE TABLE `device_request_items` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`unit_id` varchar(36) NOT NULL,
	`serial_number` varchar(100) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`result` varchar(16) NOT NULL,
	`result_reason` varchar(500),
	`result_at` datetime(3),
	CONSTRAINT `device_request_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `device_request_items_request_unit_uq` UNIQUE(`request_id`,`unit_id`)
);
--> statement-breakpoint
CREATE TABLE `device_requests` (
	`id` varchar(36) NOT NULL,
	`type` varchar(16) NOT NULL,
	`reason` varchar(100) NOT NULL,
	`created_by` varchar(200) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`notified_at` datetime(3),
	CONSTRAINT `device_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `tracking_mode` varchar(16) DEFAULT 'SERIAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `units` ADD `registered_at` datetime(3);--> statement-breakpoint
ALTER TABLE `device_request_items` ADD CONSTRAINT `device_request_items_request_id_device_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `device_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_request_items` ADD CONSTRAINT `device_request_items_unit_id_units_id_fk` FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `device_request_items_page_idx` ON `device_request_items` (`request_id`,`id`);--> statement-breakpoint
CREATE INDEX `device_request_items_serial_idx` ON `device_request_items` (`request_id`,`serial_number`);