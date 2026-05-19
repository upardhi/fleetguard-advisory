# FleetGuard — ITC Seeded Credentials

**Project**: `fleetguard-f`
**Default password (all accounts)**: `Admin@123`
**Email convention**: `{role}[_{n}].itc[_{warehouseCode}]@fraudcheck.ai`

> ⚠️ Change passwords before any external use. This file documents seeded defaults only.

---

## Phase 2 — Super Admin (✅ created)

| Role        | Email                      | Password    | Scope  |
| ----------- | -------------------------- | ----------- | ------ |
| super_admin | `superadmin@fraudcheck.ai` | `Admin@123` | Global |

---

## Phase 3 — ITC accounts (pending)

### Company-level (no warehouse)

| Role          | Email                            | Password    |
| ------------- | -------------------------------- | ----------- |
| company_admin | `companyadmin.itc@fraudcheck.ai` | `Admin@123` |
| cso           | `cso.itc@fraudcheck.ai`          | `Admin@123` |

### Warehouse managers (1 per warehouse)

| Warehouse                   | Code   | Email                              |
| --------------------------- | ------ | ---------------------------------- |
| ITC Bengaluru Hub           | BLR-01 | `manager.itc_BLR-01@fraudcheck.ai` |
| ITC Kolkata DC              | KOL-01 | `manager.itc_KOL-01@fraudcheck.ai` |
| ITC Haridwar Plant          | HDW-01 | `manager.itc_HDW-01@fraudcheck.ai` |
| ITC Trichy Foods Factory    | TRY-01 | `manager.itc_TRY-01@fraudcheck.ai` |
| ITC Saharanpur Paperboard   | SPR-01 | `manager.itc_SPR-01@fraudcheck.ai` |
| ITC Munger Factory          | MNG-01 | `manager.itc_MNG-01@fraudcheck.ai` |
| ITC Bhadrachalam Paperboard | BDM-01 | `manager.itc_BDM-01@fraudcheck.ai` |

### Guards (2 per warehouse)

| Warehouse | Guard 1                            | Guard 2                            |
| --------- | ---------------------------------- | ---------------------------------- |
| BLR-01    | `guard_1.itc_BLR-01@fraudcheck.ai` | `guard_2.itc_BLR-01@fraudcheck.ai` |
| KOL-01    | `guard_1.itc_KOL-01@fraudcheck.ai` | `guard_2.itc_KOL-01@fraudcheck.ai` |
| HDW-01    | `guard_1.itc_HDW-01@fraudcheck.ai` | `guard_2.itc_HDW-01@fraudcheck.ai` |
| TRY-01    | `guard_1.itc_TRY-01@fraudcheck.ai` | `guard_2.itc_TRY-01@fraudcheck.ai` |
| SPR-01    | `guard_1.itc_SPR-01@fraudcheck.ai` | `guard_2.itc_SPR-01@fraudcheck.ai` |
| MNG-01    | `guard_1.itc_MNG-01@fraudcheck.ai` | `guard_2.itc_MNG-01@fraudcheck.ai` |
| BDM-01    | `guard_1.itc_BDM-01@fraudcheck.ai` | `guard_2.itc_BDM-01@fraudcheck.ai` |

---

## Summary

| Role          | Count  |
| ------------- | ------ |
| super_admin   | 1      |
| company_admin | 1      |
| cso           | 1      |
| wh_manager    | 7      |
| guard         | 14     |
| **Total**     | **24** |

## Warehouses (7) + Gates (14 = 2 × 7)

Each warehouse has 2 gates: `Gate_1`, `Gate_2`.

| #   | Name                        | Code   | City            | State         | Region |
| --- | --------------------------- | ------ | --------------- | ------------- | ------ |
| 1   | ITC Bengaluru Hub           | BLR-01 | Bengaluru       | Karnataka     | South  |
| 2   | ITC Kolkata DC              | KOL-01 | Kolkata         | West Bengal   | East   |
| 3   | ITC Haridwar Plant          | HDW-01 | Haridwar        | Uttarakhand   | North  |
| 4   | ITC Trichy Foods Factory    | TRY-01 | Tiruchirappalli | Tamil Nadu    | South  |
| 5   | ITC Saharanpur Paperboard   | SPR-01 | Saharanpur      | Uttar Pradesh | North  |
| 6   | ITC Munger Factory          | MNG-01 | Munger          | Bihar         | East   |
| 7   | ITC Bhadrachalam Paperboard | BDM-01 | Bhadrachalam    | Telangana     | South  |
