CREATE TABLE `public_id_counters` (
	`id` varchar(36) NOT NULL,
	`scope` varchar(32) NOT NULL,
	`last` int NOT NULL,
	CONSTRAINT `public_id_counters_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_id_counters_scope_unique` UNIQUE(`scope`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_lines` (
	`id` varchar(36) NOT NULL,
	`purchase_order_id` varchar(36) NOT NULL,
	`line_no` int NOT NULL,
	`product_id` varchar(36) NOT NULL,
	`ordered_qty` int NOT NULL,
	`requested_delivery_date` date NOT NULL,
	`unit_price` decimal(18,4),
	`over_tolerance_pct` decimal(5,2),
	`under_tolerance_pct` decimal(5,2),
	`closed` boolean NOT NULL,
	`closed_at` datetime(3),
	`closed_by` varchar(100),
	`close_reason` varchar(500),
	`cancelled` boolean NOT NULL,
	CONSTRAINT `purchase_order_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_order_lines_po_line_uq` UNIQUE(`purchase_order_id`,`line_no`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_revisions` (
	`id` varchar(36) NOT NULL,
	`purchase_order_id` varchar(36) NOT NULL,
	`revised_at` datetime(3) NOT NULL,
	`actor` varchar(100) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`before` json NOT NULL,
	`after` json NOT NULL,
	CONSTRAINT `purchase_order_revisions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` varchar(36) NOT NULL,
	`po_number` varchar(32) NOT NULL,
	`supplier` varchar(200) NOT NULL,
	`order_date` date NOT NULL,
	`status` varchar(16) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`destination_location_id` varchar(36) NOT NULL,
	`incoterm` varchar(8),
	`incoterm_place` varchar(100),
	`supplier_order_ref` varchar(100),
	`payment_terms` varchar(200),
	`remarks` varchar(1000),
	`created_at` datetime(3) NOT NULL,
	`created_by` varchar(100) NOT NULL,
	`issued_at` datetime(3),
	`issued_by` varchar(100),
	CONSTRAINT `purchase_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_orders_poNumber_unique` UNIQUE(`po_number`)
);
--> statement-breakpoint
ALTER TABLE `purchase_order_lines` ADD CONSTRAINT `purchase_order_lines_purchase_order_id_purchase_orders_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_lines` ADD CONSTRAINT `purchase_order_lines_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_revisions` ADD CONSTRAINT `purchase_order_revisions_purchase_order_id_purchase_orders_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD CONSTRAINT `purchase_orders_destination_location_id_locations_id_fk` FOREIGN KEY (`destination_location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_order_lines_product_idx` ON `purchase_order_lines` (`product_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_revisions_po_idx` ON `purchase_order_revisions` (`purchase_order_id`,`revised_at`);--> statement-breakpoint
CREATE INDEX `purchase_orders_recent_idx` ON `purchase_orders` (`created_at`);