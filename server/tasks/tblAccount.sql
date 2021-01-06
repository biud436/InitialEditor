CREATE TABLE `tblAccount` (
	`no` INT(4) NOT NULL AUTO_INCREMENT,
	`id` VARCHAR(30) NOT NULL COLLATE 'utf8mb4_general_ci',
	`email` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci',
	`name` VARCHAR(50) NOT NULL COLLATE 'utf8mb4_general_ci',
	PRIMARY KEY (`no`) USING BTREE,
	UNIQUE INDEX `id` (`id`) USING BTREE,
	UNIQUE INDEX `email` (`email`) USING BTREE
)
COLLATE='utf8mb4_general_ci'
ENGINE=InnoDB
AUTO_INCREMENT=1
;;