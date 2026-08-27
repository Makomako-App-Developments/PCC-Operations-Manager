-- Add Training as a supported team availability status.
-- Safe to run against databases where the value has already been added.

ALTER TYPE "availability_status" ADD VALUE IF NOT EXISTS 'training';