CREATE TABLE `stock_movements` (
	`id` varchar(36) NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`lot_no` varchar(100),
	`from_location_id` varchar(36),
	`to_location_id` varchar(36),
	`quantity` int NOT NULL,
	`stock_status` varchar(16) NOT NULL,
	`reason` varchar(32) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	`source_system` varchar(100) NOT NULL,
	`source_ref` varchar(200),
	`idempotency_key` varchar(200),
	`note` varchar(1000),
	`reverses_movement_id` varchar(36),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_movements_idempotencyKey_unique` UNIQUE(`idempotency_key`),
	CONSTRAINT `stock_movements_reversesMovementId_unique` UNIQUE(`reverses_movement_id`),
	CONSTRAINT `stock_movements_quantity_chk` CHECK(`stock_movements`.`quantity` > 0),
	CONSTRAINT `stock_movements_location_chk` CHECK(`stock_movements`.`from_location_id` is not null or `stock_movements`.`to_location_id` is not null)
);
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_from_location_id_locations_id_fk` FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_to_location_id_locations_id_fk` FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_reverses_movement_id_stock_movements_id_fk` FOREIGN KEY (`reverses_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;