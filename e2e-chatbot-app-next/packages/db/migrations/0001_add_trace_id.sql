-- Migration: Add traceId column to Message for MLflow trace linkage
ALTER TABLE "ai_chatbot_app"."Message" ADD COLUMN "traceId" text;
