-- CreateTable
CREATE TABLE `CardFsrsState` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cardId` VARCHAR(191) NOT NULL,
    `due` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stability` DOUBLE NOT NULL DEFAULT 0,
    `difficulty` DOUBLE NOT NULL DEFAULT 0,
    `elapsedDays` INTEGER NOT NULL DEFAULT 0,
    `scheduledDays` INTEGER NOT NULL DEFAULT 0,
    `reps` INTEGER NOT NULL DEFAULT 0,
    `lapses` INTEGER NOT NULL DEFAULT 0,
    `learningSteps` INTEGER NOT NULL DEFAULT 0,
    `state` INTEGER NOT NULL DEFAULT 0,
    `lastReview` DATETIME(3) NULL,

    UNIQUE INDEX `CardFsrsState_userId_cardId_key`(`userId`, `cardId`),
    INDEX `CardFsrsState_userId_idx`(`userId`),
    INDEX `CardFsrsState_cardId_idx`(`cardId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
