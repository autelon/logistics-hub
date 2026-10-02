CREATE TABLE `fulfillment_items` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`order_line_id` varchar(36) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`status` varchar(16) NOT NULL,
	`reason` varchar(32) NOT NULL,
	`replaces_item_id` varchar(36),
	`serial_number` varchar(100),
	`shipped_at` datetime(3),
	`delivered_at` datetime(3),
	`doa_case_id` varchar(100),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `fulfillment_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` varchar(36) NOT NULL,
	`order_id` varchar(36) NOT NULL,
	`line_no` int NOT NULL,
	`sellable_code` varchar(64) NOT NULL,
	`sellable_name` varchar(200) NOT NULL,
	`sellable_kind` varchar(16) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(36) NOT NULL,
	`public_id` varchar(32) NOT NULL,
	`channel` varchar(50) NOT NULL,
	`channel_order_no` varchar(100) NOT NULL,
	`ordered_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_publicId_unique` UNIQUE(`public_id`),
	CONSTRAINT `orders_channel_order_uq` UNIQUE(`channel`,`channel_order_no`)
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
CREATE TABLE `processed_messages` (
	`id` varchar(36) NOT NULL,
	`consumer_group` varchar(100) NOT NULL,
	`message_id` varchar(36) NOT NULL,
	`processed_at` datetime(3) NOT NULL,
	CONSTRAINT `processed_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `processed_messages_group_message_uq` UNIQUE(`consumer_group`,`message_id`)
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
CREATE TABLE `sellable_components` (
	`id` varchar(36) NOT NULL,
	`sellable_id` varchar(36) NOT NULL,
	`sku` varchar(64) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `sellable_components_id` PRIMARY KEY(`id`),
	CONSTRAINT `sellable_components_sellable_sku_uq` UNIQUE(`sellable_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `sellables` (
	`id` varchar(36) NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`kind` varchar(16) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `sellables_id` PRIMARY KEY(`id`),
	CONSTRAINT `sellables_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `fulfillment_items` ADD CONSTRAINT `fulfillment_items_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fulfillment_items` ADD CONSTRAINT `fulfillment_items_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sellable_components` ADD CONSTRAINT `sellable_components_sellable_id_sellables_id_fk` FOREIGN KEY (`sellable_id`) REFERENCES `sellables`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `fulfillment_items_order_idx` ON `fulfillment_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `fulfillment_items_serial_idx` ON `fulfillment_items` (`serial_number`);--> statement-breakpoint
CREATE INDEX `order_lines_order_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `outbox_unpublished_idx` ON `outbox_events` (`published_at`,`id`);