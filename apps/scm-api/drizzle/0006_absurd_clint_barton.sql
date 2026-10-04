CREATE TABLE `shipment_corrections` (
	`id` varchar(36) NOT NULL,
	`shipment_id` varchar(36) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`actor` varchar(100) NOT NULL,
	`recorded_at` datetime(3) NOT NULL,
	CONSTRAINT `shipment_corrections_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_corrections_shipmentId_unique` UNIQUE(`shipment_id`)
);
--> statement-breakpoint
ALTER TABLE `shipment_corrections` ADD CONSTRAINT `shipment_corrections_shipment_id_shipments_id_fk` FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE no action ON UPDATE no action;