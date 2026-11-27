# Database Schema

The prototype has seven SQLAlchemy tables, with UUID-string primary keys,
foreign keys, and indexes on user email, unit facility/product and expiry, and
demand facility/date:

- `facilities`: simulated facility metadata and per-facility daily-demand and
  safety-stock settings.
- `users`: unique email, scrypt password hash, role, optional facility.
- `blood_units`: one unit per row, with blood group, component, collection and
  expiry dates, screening/reservation/cold-chain statuses, and optional
  transfer association.
- `demand_history`: daily synthetic demand per facility and product.
- `transfer_requests`: source/destination, product, requested units, workflow
  status, reason, creator, and approver.
- `audit_logs`: human approval/completion actions.
- `temperature_events`: reported cold-chain breach and required human review,
  linked to the affected unit and reporting user.

The startup path currently uses `Base.metadata.create_all`; it is suitable for
the fresh demo database only. Alembic migrations, inventory snapshots, and
first-class transfer-item tables are not yet implemented.
