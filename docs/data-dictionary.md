# Data Dictionary

All seeded facility, unit, and demand values are simulated and contain no
patient or donor identifiers.

| Entity | Important fields | Meaning |
|---|---|---|
| `users` | `id`, `email`, `password_hash`, `role`, `facility_id` | UUID user, password hash, one of four operational roles, optional assigned facility |
| `facilities` | `id`, `name`, `county`, `facility_type`, `latitude`, `longitude`, `daily_demand`, `safety_stock`, `simulated` | Simulated facility metadata and locally configurable planning values |
| `blood_units` | `facility_id`, `blood_group`, `component`, `collection_date`, `expiry_date`, `screening_status`, `reservation_status`, `cold_chain_status`, `transfer_id` | One unit-level record; eligible stock must be released, available, in date, and cold-chain normal |
| `demand_history` | `facility_id`, `blood_group`, `component`, `demand_date`, `units_requested` | Simulated daily demand input to the baseline |
| `transfer_requests` | `source_facility_id`, `destination_facility_id`, product, `units`, `status`, `created_by`, `approved_by` | Human-reviewed transfer recommendation, approval, or completion |
| `audit_logs` | `user_id`, `action`, `entity_id`, `details`, `created_at` | Transfer approval/completion records |
| `temperature_events` | `unit_id`, `temperature_c`, `recorded_at`, `notes`, `status`, `recorded_by` | Reported breach, persisted with unit quarantine and a review-required status |

Quantities are counts of units. Dates are ISO calendar dates. Blood groups and
components use the enum values documented in the API schemas. Safety-stock
values are configurable prototype settings, not clinical standards.

Inventory snapshots, forecast persistence, and separate
transfer-item records are planned, not present in the current schema.
