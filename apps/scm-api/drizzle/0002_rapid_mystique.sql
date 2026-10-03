CREATE TABLE `location_policies` (
	`id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`reports_serials_on_receipt` boolean NOT NULL,
	`reports_serials_on_shipment` boolean NOT NULL,
	`reports_serials_on_outbound` boolean NOT NULL,
	`reports_inspection_result` boolean NOT NULL,
	`decides_disposition` boolean NOT NULL,
	`requires_hub_confirmation` boolean NOT NULL,
	`unit_receipt_trigger` varchar(32) NOT NULL,
	`auto_register_on_putaway` boolean NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`updated_by` varchar(100) NOT NULL,
	CONSTRAINT `location_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `location_policies_locationId_unique` UNIQUE(`location_id`)
);
--> statement-breakpoint
CREATE TABLE `location_policy_changes` (
	`id` varchar(36) NOT NULL,
	`location_id` varchar(36) NOT NULL,
	`actor` varchar(100) NOT NULL,
	`changed_at` datetime(3) NOT NULL,
	`before` json NOT NULL,
	`after` json NOT NULL,
	CONSTRAINT `location_policy_changes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `location_policies` ADD CONSTRAINT `location_policies_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location_policy_changes` ADD CONSTRAINT `location_policy_changes_location_id_locations_id_fk` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `location_policy_changes_location_idx` ON `location_policy_changes` (`location_id`,`changed_at`);