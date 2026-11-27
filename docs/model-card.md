# Model Card

## Current prototype

The API uses a trailing mean of seeded synthetic demand history as a baseline
for 7–30 day demand estimates. It reports the baseline horizon total and
compares it with currently eligible unit stock. The demo history currently
covers 90 days and is generated with simple weekday/season-like variation.

## Intended use and limits

This is a user-interface and workflow demonstration only. It is not trained,
validated, or evaluated on real facility data and is not suitable for real
procurement, clinical decisions, or operational allocation. It does not report
MAE/RMSE/WAPE, confidence intervals, or clinical performance. Its results
must not be interpreted as evidence that shortages will occur.

Random Forest/XGBoost training, time-based validation, reproducible model
evaluation, explainability analysis, and model monitoring remain unimplemented.
