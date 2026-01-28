-- Set default debt limit to 5000 and normalize existing masters
ALTER TABLE "master_profiles" ALTER COLUMN "debtLimit" SET DEFAULT 5000;

UPDATE "master_profiles"
SET "debtLimit" = 5000
WHERE "debtLimit" = 0;
