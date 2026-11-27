# Demo walkthrough

1. Start the frontend/API and sign in as `manager@bloodflow.demo`.
2. The command center shows seeded facilities, synthetic stock, projected
   shortage signals, a demand-baseline chart, and an OpenStreetMap view.
3. Generate a recommendation. The seeded scenario has a projected Kisumu
   shortage for O+ red blood cells, while Nairobi has stock above its configured
   safety stock.
4. Review the recommended number and route. No inventory is reserved while the
   recommendation is pending.
5. Explicitly approve as a manager or network administrator. The backend
   reserves eligible units, records the approver, and writes an audit event.
6. To complete the transfer, call `POST /api/transfers/{id}/complete` with an
   authorized bearer token. This moves the reserved unit records to the
   destination and writes a completion audit event.

All data in this walkthrough is simulated and must not be used for real
allocation decisions.
