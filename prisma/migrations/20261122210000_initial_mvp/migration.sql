-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QrCodeType" AS ENUM ('PERSONAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('FAKTURA', 'RACHUNEK', 'PARAGON_Z_NIP', 'INNE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ZAPISANY', 'PRZEKAZANY', 'PRZYJETY', 'DO_POPRAWY', 'ARCHIWALNY');

-- CreateEnum
CREATE TYPE "PermissionCode" AS ENUM ('DOCUMENT_UPLOAD', 'DOCUMENT_VIEW_OWN', 'DOCUMENT_VIEW_ALL', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_STATUS_MANAGE', 'DOCUMENT_EXPORT', 'EMPLOYEE_MANAGE', 'QR_MANAGE', 'ENTITY_MANAGE', 'ACCESS_MANAGE');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('EMPLOYEE', 'USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('PENDING', 'SUCCESS', 'REJECTED', 'BLOCKED', 'ERROR');

-- CreateTable
CREATE TABLE "Entity" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "storageFolderName" VARCHAR(120) NOT NULL,
    "numberingPrefix" VARCHAR(8) NOT NULL,
    "taxId" VARCHAR(20),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "phoneNumber" VARCHAR(20) NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeEntity" (
    "employeeId" UUID NOT NULL,
    "entityId" UUID NOT NULL,

    CONSTRAINT "EmployeeEntity_pkey" PRIMARY KEY ("employeeId","entityId")
);

-- CreateTable
CREATE TABLE "QrCode" (
    "id" UUID NOT NULL,
    "type" "QrCodeType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "tokenHash" CHAR(64) NOT NULL,
    "tokenEncrypted" TEXT NOT NULL,
    "employeeId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "referenceNumber" VARCHAR(32) NOT NULL,
    "entityId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "qrCodeId" UUID,
    "category" "DocumentCategory" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ZAPISANY',
    "note" VARCHAR(1000),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageYear" INTEGER NOT NULL,
    "storageMonth" INTEGER NOT NULL,
    "receiptTokenHash" CHAR(64) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "storedName" VARCHAR(255) NOT NULL,
    "relativePath" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "oldStatus" "DocumentStatus",
    "newStatus" "DocumentStatus" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "note" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadAttempt" (
    "id" UUID NOT NULL,
    "ipHash" CHAR(64) NOT NULL,
    "clientHash" CHAR(64) NOT NULL,
    "employeeId" UUID,
    "result" "AttemptResult" NOT NULL,
    "documentId" UUID,
    "idempotencyKey" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitState" (
    "scope" VARCHAR(30) NOT NULL,
    "subjectHash" CHAR(64) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitState_pkey" PRIMARY KEY ("scope","subjectHash")
);

-- CreateTable
CREATE TABLE "ApplicationMembership" (
    "id" UUID NOT NULL,
    "wbAuthUserId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(200),
    "roleTemplate" VARCHAR(30),
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationInvitation" (
    "id" UUID NOT NULL,
    "membershipId" UUID,
    "wbAuthInviteId" UUID,
    "tenantId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "roleTemplate" VARCHAR(30),
    "plannedPermissions" "PermissionCode"[],
    "plannedEntityIds" UUID[],
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPermission" (
    "membershipId" UUID NOT NULL,
    "permission" "PermissionCode" NOT NULL,

    CONSTRAINT "MembershipPermission_pkey" PRIMARY KEY ("membershipId","permission")
);

-- CreateTable
CREATE TABLE "MembershipEntity" (
    "membershipId" UUID NOT NULL,
    "entityId" UUID NOT NULL,

    CONSTRAINT "MembershipEntity_pkey" PRIMARY KEY ("membershipId","entityId")
);

-- CreateTable
CREATE TABLE "AccountingExport" (
    "id" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "entityId" UUID,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "status" "ExportStatus" NOT NULL DEFAULT 'PROCESSING',
    "relativePath" VARCHAR(500),
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AccountingExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceSession" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "employeeId" UUID NOT NULL,
    "qrCodeId" UUID,
    "ipHash" CHAR(64) NOT NULL,
    "clientHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "entityId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("entityId","year")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "wbAuthSessionId" UUID NOT NULL,
    "wbAuthUserId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entity_code_key" ON "Entity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_storageFolderName_key" ON "Entity"("storageFolderName");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_numberingPrefix_key" ON "Entity"("numberingPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_phoneNumber_key" ON "Employee"("phoneNumber");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "EmployeeEntity_entityId_idx" ON "EmployeeEntity"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_tokenHash_key" ON "QrCode"("tokenHash");

-- CreateIndex
CREATE INDEX "QrCode_employeeId_isActive_idx" ON "QrCode"("employeeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Document_referenceNumber_key" ON "Document"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_receiptTokenHash_key" ON "Document"("receiptTokenHash");

-- CreateIndex
CREATE INDEX "Document_entityId_receivedAt_idx" ON "Document"("entityId", "receivedAt");

-- CreateIndex
CREATE INDEX "Document_employeeId_receivedAt_idx" ON "Document"("employeeId", "receivedAt");

-- CreateIndex
CREATE INDEX "Document_status_receivedAt_idx" ON "Document"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_storedName_key" ON "DocumentFile"("storedName");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_relativePath_key" ON "DocumentFile"("relativePath");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_documentId_sequence_key" ON "DocumentFile"("documentId", "sequence");

-- CreateIndex
CREATE INDEX "DocumentEvent_documentId_createdAt_idx" ON "DocumentEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "UploadAttempt_ipHash_clientHash_createdAt_idx" ON "UploadAttempt"("ipHash", "clientHash", "createdAt");

-- CreateIndex
CREATE INDEX "UploadAttempt_employeeId_result_createdAt_idx" ON "UploadAttempt"("employeeId", "result", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadAttempt_clientHash_idempotencyKey_key" ON "UploadAttempt"("clientHash", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ApplicationMembership_tenantId_status_idx" ON "ApplicationMembership"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationMembership_wbAuthUserId_tenantId_key" ON "ApplicationMembership"("wbAuthUserId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationInvitation_wbAuthInviteId_key" ON "ApplicationInvitation"("wbAuthInviteId");

-- CreateIndex
CREATE INDEX "ApplicationInvitation_tenantId_status_idx" ON "ApplicationInvitation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MembershipEntity_entityId_idx" ON "MembershipEntity"("entityId");

-- CreateIndex
CREATE INDEX "AccountingExport_requestedById_createdAt_idx" ON "AccountingExport"("requestedById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSession_tokenHash_key" ON "DeviceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DeviceSession_employeeId_expiresAt_idx" ON "DeviceSession"("employeeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_wbAuthUserId_tenantId_idx" ON "PortalSession"("wbAuthUserId", "tenantId");

-- CreateIndex
CREATE INDEX "PortalSession_expiresAt_idx" ON "PortalSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "EmployeeEntity" ADD CONSTRAINT "EmployeeEntity_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEntity" ADD CONSTRAINT "EmployeeEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QrCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadAttempt" ADD CONSTRAINT "UploadAttempt_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadAttempt" ADD CONSTRAINT "UploadAttempt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationInvitation" ADD CONSTRAINT "ApplicationInvitation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ApplicationMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPermission" ADD CONSTRAINT "MembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ApplicationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEntity" ADD CONSTRAINT "MembershipEntity_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "ApplicationMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEntity" ADD CONSTRAINT "MembershipEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExport" ADD CONSTRAINT "AccountingExport_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "ApplicationMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingExport" ADD CONSTRAINT "AccountingExport_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceSession" ADD CONSTRAINT "DeviceSession_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QrCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
