CREATE TABLE `shipment_line_serials` (
	`id` varchar(36) NOT NULL,
	`shipment_line_id` varchar(36) NOT NULL,
	`serial_number` varchar(100) NOT NULL,
	CONSTRAINT `shipment_line_serials_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_line_serials_line_serial_uq` UNIQUE(`shipment_line_id`,`serial_number`)
);
--> statement-breakpoint
CREATE TABLE `shipment_lines` (
	`id` varchar(36) NOT NULL,
	`shipment_id` varchar(36) NOT NULL,
	`line_no` int NOT NULL,
	`purchase_order_line_id` varchar(36),
	`product_id` varchar(36) NOT NULL,
	`shipped_qty` int NOT NULL,
	`lot_no` varchar(100),
	CONSTRAINT `shipment_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_lines_shipment_line_uq` UNIQUE(`shipment_id`,`line_no`),
	CONSTRAINT `shipment_lines_qty_chk` CHECK(`shipment_lines`.`shipped_qty` > 0)
);
--> statement-breakpoint
CREATE TABLE `shipment_links` (
	`id` varchar(36) NOT NULL,
	`shipment_id` varchar(36) NOT NULL,
	`purchase_order_id` varchar(36) NOT NULL,
	`previous_shipment_no` varchar(64) NOT NULL,
	`shipment_no` varchar(64) NOT NULL,
	`actor` varchar(100) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`linked_at` datetime(3) NOT NULL,
	`line_links` json NOT NULL,
	`anomalies` json NOT NULL,
	CONSTRAINT `shipment_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_links_shipmentId_unique` UNIQUE(`shipment_id`),
	CONSTRAINT `shipment_links_previousShipmentNo_unique` UNIQUE(`previous_shipment_no`)
);
--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` varchar(36) NOT NULL,
	`shipment_no` varchar(64) NOT NULL,
	`purchase_order_id` varchar(36),
	`reported_po_number` varchar(100) NOT NULL,
	`bl_number` varchar(100) NOT NULL,
	`invoice_number` varchar(100),
	`shipper` varchar(200) NOT NULL,
	`mode` varchar(8) NOT NULL,
	`ship_date` date,
	`eta` date,
	`source_system` varchar(100) NOT NULL,
	`source_ref` varchar(200),
	`idempotency_key` varchar(200),
	`reported_at` datetime(3) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	`note` varchar(500),
	`anomalies` json NOT NULL,
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipments_shipmentNo_unique` UNIQUE(`shipment_no`),
	CONSTRAINT `shipments_idempotencyKey_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
ALTER TABLE `shipment_line_serials` ADD CONSTRAINT `shipment_line_serials_shipment_line_id_shipment_lines_id_fk` FOREIGN KEY (`shipment_line_id`) REFERENCES `shipment_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_purchase_order_line_id_purchase_order_lines_id_fk` FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_lines` ADD CONSTRAINT `shipment_lines_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_links` ADD CONSTRAINT `shipment_links_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipment_links` ADD CONSTRAINT `shipment_links_purchase_order_id_purchase_orders_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_purchase_order_id_purchase_orders_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shipment_line_serials_serial_idx` ON `shipment_line_serials` (`serial_number`);--> statement-breakpoint
CREATE INDEX `shipment_lines_po_line_idx` ON `shipment_lines` (`purchase_order_line_id`);--> statement-breakpoint
CREATE INDEX `shipment_links_po_idx` ON `shipment_links` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `shipments_po_idx` ON `shipments` (`purchase_order_id`);