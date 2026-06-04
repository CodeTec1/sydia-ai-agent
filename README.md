# Sydia AI Agent

Production-grade WhatsApp AI agent built for a Nairobi real estate company.

The system automates lead qualification, property discovery, viewing bookings, reminders, and agent handoff using Claude, Twilio, Supabase, Google Calendar, and Node.js.

## Key Features

* Natural WhatsApp conversations powered by Claude
* AI-driven lead qualification
* Property search and recommendations
* Google Calendar viewing bookings
* Automated reminders and follow-ups
* Human agent escalation workflows
* Persistent conversational memory

## Tech Stack

* Node.js
* Express
* Claude (Anthropic)
* Supabase
* Twilio WhatsApp API
* Google Calendar API
* React
* Render

## Engineering Decisions

### UUID Isolation

Properties are shown as **"Property 1"**, **"Property 2"**, etc. Claude never sees real database UUIDs, preventing hallucinated identifiers during bookings.

### Deterministic Booking Logic

Time expressions such as **"Monday morning"** are resolved by backend logic before reaching the AI, ensuring consistent booking behavior.

### Persistent Property Snapshots

Search fingerprints allow property results to remain stable across conversations while reducing token usage and database queries.

### Self-Healing Agent Loop

The system detects silent tool-call failures and automatically recovers without exposing errors to users.

## Repository Structure

* server.js – Application entry point
* webhook.js – WhatsApp message handling
* aiAgent.js – Claude orchestration loop
* tools.js – Integrations and business logic
* notifications.js – Reminders and follow-ups

## Author

Built by Tecla as part of an AI systems engineering journey focused on production AI agents, orchestration systems, and workflow automation.
