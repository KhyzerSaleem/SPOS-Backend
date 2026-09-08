# Operations Data Readiness Notes

This folder contains the full-system `Dummy.json` dataset used to validate migration, reporting, inventory, accounting, notifications, and multi-currency behavior.

## Existing Capabilities Audited

- Migration already supported products, customers, categories, and inventory with preview jobs.
- Warehouse transfers already deducted source warehouse stock on shipment and credited destination stock on completion through `StockLedgerService`.
- Scheduled automations already tracked automation runs and covered inventory, onboarding, billing, maintenance, support SLA, sales summary, plan limits, and data hygiene.
- Reports already exposed 14+ report calculations, but exports were mostly browser-side CSV/SpreadsheetML.
- Notifications existed but needed wider event coverage and recipient targeting.

## Dataset Coverage

`Dummy.json` includes tenants, stores, users, warehouses, products, variants, suppliers, customers, purchases, invoices, sales, returns, expenses, stock movements, transfers, accounts, journals, notifications, exchange rates, and expected values for dashboard/report validation.

