# Safety and Limitations

BloodFlow AI is a simulated operational decision-support prototype. It is not
a medical device or an autonomous clinical system.

- No transfusion, crossmatching, or clinical compatibility decisions are made.
- A transfer is never approved or dispatched automatically. An authorized
  manager/admin must review and approve; completion is a separate human action.
- The eligibility query excludes expired, unreleased, reserved, and
  cold-chain-breach units. A breach is forced to `quarantined` at unit creation.
- A reported temperature breach quarantines the unit and writes an audit event.
  The prototype intentionally has no quarantine-clear endpoint; a qualified
  person must review it outside the system. There is no real sensor integration.
- All seeded locations, demand, inventory, alerts, and forecasts are simulated.
  No donor or patient identifiers are included.
- Safety-stock values are editable planning inputs, not universal clinical
  thresholds. Qualified local staff are responsible for policy and decisions.
- There is no real Damu-KE integration, production security assessment, or
  claim of clinical effectiveness.

Before any real-world pilot, involve qualified transfusion-service staff,
validate facility data and local regulations, implement audited clinical and
operational review, independent security/privacy assessment, strong
provisioning and revocation, resilient database locking, and validated
deployment procedures.
