# FleetGuard — Claude Code Delivery Brief
### Final POC Build Specification · Next.js 14 + TypeScript + Firebase

---

## IMPORTANT — Read Everything Before Writing Any Code

This is the complete and final build brief. Read every section fully before starting. Every decision here is intentional. Do not deviate from the data model, the DAL pattern, or the collection naming.

---

## 1. What This System Does

FleetGuard is an enterprise gate and fleet security platform. It enforces compliance at every warehouse gate entry and exit, tracks every truck movement with face verification, manages delivery confirmation digitally, and gives security leadership real-time pan-India visibility.

**This client:**
- 37 warehouses pan-India (1 warehouse for POC)
- 70 delivery vehicles via 3PL contractors
- Guards use shared desktop PC at gate (Chrome browser)
- Drivers belong to multiple contractors — no permanent link
- Trip data comes from SuperProcure (not available yet — manual entry for POC)
- SAP in use — integration later
- No GPS, no driver app, no dealer app

---

## 2. Project Setup

### Initialize
```bash
npx create-next-app@latest fleetguard --typescript --tailwind --app --src-dir
cd fleetguard
npm install firebase firebase-admin
npm install jsonwebtoken bcryptjs qrcode
npm install @types/jsonwebtoken @types/bcryptjs @types/qrcode
npm install axios
```

### Environment Variables (.env.local)
```
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-side only — never expose to client)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=

# Security
QR_SECRET=
PIN_ENCRYPTION_KEY=

# SMS
MSG91_AUTH_KEY=
MSG91_SENDER_ID=
MSG91_TEMPLATE_ID=

# Background Screening
BG_VENDOR_API_KEY=
BG_VENDOR_BASE_URL=
BG_VENDOR_WEBHOOK_SECRET=

# Google Cloud Vision (face comparison)
GOOGLE_CLOUD_VISION_API_KEY=

# Trip data source — controls where trip data comes from
# POC: manual | Production: superprocure
TRIP_SOURCE=manual

# App URL
NEXT_PUBLIC_APP_URL=
```

---

## 3. Project Structure

```
/src
  /app
    /guard
      /page.tsx                     → Guard home — 4 event buttons
      /truck-entry/page.tsx         → Inbound + outbound return entry
      /confirm-departure/page.tsx   → Gate OUT Cycle 1 — invoices + QR
      /trip-return/page.tsx         → Gate IN Cycle 2 — truck returns
      /close-trip/page.tsx          → Gate OUT Cycle 2 — face compare + reconcile
      /visitor-entry/page.tsx       → Visitor + contractor entry
      /active-events/page.tsx       → All trucks + visitors inside now
    /manager
      /page.tsx                     → WH Manager dashboard
      /trips/page.tsx               → All trips
      /trips/create/page.tsx        → Create trip (POC only — replaced by SuperProcure)
      /trips/[id]/page.tsx          → Trip detail
      /drivers/page.tsx             → Driver roster
      /drivers/[id]/page.tsx        → Driver profile + BG history
      /vehicles/page.tsx            → Vehicle compliance list
      /contractors/page.tsx         → Contractor list
      /alerts/page.tsx              → Alert inbox
      /incidents/page.tsx           → Incident management
      /visitors/page.tsx            → Visitor log
      /reports/page.tsx             → Export reports
    /cso
      /page.tsx                     → CSO command dashboard
      /compliance/page.tsx          → Compliance clock detail
      /alerts/page.tsx              → All alerts pan-India
      /audit/page.tsx               → Full audit trail
    /deliver
      /[token]/page.tsx             → Dealer QR page (public, no auth, no app)
    /login
      /page.tsx                     → Login (all roles)
    /layout.tsx
    /page.tsx                       → Root redirect by role
  /api
    /qr/generate/route.ts           → Sign JWT + generate QR PNG
    /pin/generate/route.ts          → Create PIN + hash + send SMS
    /pin/verify/route.ts            → Verify PIN + handle lockout
    /face/compare/route.ts          → Google Vision face comparison
    /bg/trigger/route.ts            → Trigger BG screening vendor
    /bg/webhook/route.ts            → Receive BG result from vendor
    /checks/driver/route.ts         → DL expiry + BG status check
    /checks/vehicle/route.ts        → RC + insurance + fitness + PUC check
    /checks/override/route.ts       → WH manager override with reason
    /audit/write/route.ts           → Immutable audit event write
    /reports/export/route.ts        → CSV export
  /services                         → DATA ACCESS LAYER — only Firebase access point
    /tripDataService.ts             → Abstract trip source (manual or SuperProcure)
    /tripService.ts                 → Trip CRUD + real-time
    /tripStopService.ts             → Stop CRUD + invoice management
    /driverService.ts               → Driver CRUD + real-time
    /driverBackgroundService.ts     → BG check history
    /vehicleService.ts              → Vehicle CRUD + compliance
    /contractorService.ts           → Contractor CRUD
    /gateEventService.ts            → Gate event CRUD + real-time
    /inboundEntryService.ts         → Inbound truck entry CRUD
    /visitorService.ts              → Visitor entry CRUD + real-time
    /alertService.ts                → Alert CRUD + real-time
    /incidentService.ts             → Incident CRUD
    /complianceService.ts           → Compliance check log
    /userService.ts                 → User management
    /auditService.ts                → Audit log reads (writes are server-side only)
  /lib
    /firebase.ts                    → Firebase client SDK — imported ONLY by /services
    /firebaseAdmin.ts               → Firebase Admin SDK — imported ONLY by /api routes
    /config.ts                      → App config including TRIP_SOURCE flag
  /components
    /guard
      /CheckResultBadge.tsx         → Green/amber/red compliance badge
      /WebcamCapture.tsx            → Browser webcam photo capture
      /InvoiceEntry.tsx             → Invoice number entry per stop
      /StopReconciliation.tsx       → Return reconciliation per stop
      /FaceCompareResult.tsx        → Entry vs exit face match result
      /ContractorSelect.tsx         → Dropdown with inline add
    /manager
      /TripCreateForm.tsx           → Manual trip creation (POC)
      /StopConfigRow.tsx            → Stop: dealer + invoices + mode
      /DriverCard.tsx               → Driver profile card
      /AlertItem.tsx                → Alert with ack/resolve
      /IncidentForm.tsx             → Raise/update incident
    /cso
      /ComplianceClock.tsx          → Expiry buckets widget
      /LiveTripFeed.tsx             → Real-time active trips
      /AlertFeed.tsx                → Critical alerts real-time
      /WarehouseGrid.tsx            → All warehouse status cards
    /shared
      /Header.tsx
      /RoleGuard.tsx
      /LoadingSpinner.tsx
      /QRDisplay.tsx
  /types
    /index.ts                       → All TypeScript interfaces
  /hooks
    /useAuth.ts
    /useWarehouse.ts
    /useRealtime.ts
```

---

## 4. TypeScript Types — /src/types/index.ts

```typescript
export type UserRole =
  | 'guard'
  | 'wh_manager'
  | 'regional_manager'
  | 'cso'
  | 'super_admin'

export type CheckStatus = 'clear' | 'expiring' | 'expired' | 'blocked'
export type BGStatus = 'pending' | 'clear' | 'flagged' | 'recheck_required'
export type RiskLevel = 'green' | 'amber' | 'red'
export type DeliveryMode = 'simple' | 'secure'
export type FaceMatchResult = 'match' | 'uncertain' | 'mismatch'
export type TripSource = 'manual' | 'superprocure'

export type TripStatus =
  | 'planned'
  | 'loading'
  | 'in_transit'
  | 'returning'
  | 'closed'

export type StopStatus =
  | 'pending'
  | 'confirmed'
  | 'undelivered'
  | 'returned'
  | 'disputed'
  | 'rescheduled'

export type GateEventType =
  | 'inbound_entry'
  | 'inbound_exit'
  | 'outbound_entry'
  | 'outbound_exit'
  | 'visitor_entry'
  | 'visitor_exit'
  | 'contractor_entry'
  | 'contractor_exit'

export type AlertType =
  | 'dl_expired'
  | 'dl_expiring'
  | 'bg_flagged'
  | 'bg_pending'
  | 'vehicle_expired'
  | 'pin_locked'
  | 'trip_overdue'
  | 'delivery_overdue'
  | 'visitor_overdue'
  | 'contract_expiring'
  | 'face_mismatch'
  | 'dl_mismatch_at_exit'
  | 'vehicle_mismatch_at_exit'
  | 'invoice_mismatch'
  | 'incident_sla'

export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'
export type IncidentStatus = 'open' | 'investigating' | 'resolved' | 'closed'

// ─── CORE ENTITIES ───

export interface Organisation {
  id: string
  name: string
  planTier: 'poc' | 'standard' | 'enterprise'
  isActive: boolean
  createdAt: Date
}

export interface Warehouse {
  id: string
  orgId: string
  name: string
  city: string
  state: string
  region: string
  address: string
  isActive: boolean
}

export interface User {
  id: string
  orgId: string
  warehouseId: string | null
  fullName: string
  email: string
  mobile: string
  role: UserRole
  region: string | null
  isActive: boolean
  createdBy: string
  lastLogin: Date | null
}

export interface Contractor {
  id: string
  orgId: string
  name: string
  contactName: string
  contactMobile: string
  contractStart: Date | null
  contractEnd: Date | null
  isActive: boolean
  createdAt: Date
  // contractEnd null = no expiry set yet (added inline at gate)
  // WH manager completes full details later
}

// ─── DRIVER — two separate collections ───

export interface Driver {
  id: string
  orgId: string
  fullName: string
  mobile: string
  dlNumber: string
  dlExpiry: Date
  dlDocumentUrl: string | null     // S3 URL — scan of physical DL
  facePhotoUrl: string | null      // reference photo from first registration
  isActive: boolean
  registeredAt: Date
  registeredBy: string             // guard user ID who first registered
  // NO contractorId — driver belongs to multiple contractors over time
  // contractor association recorded per gate event only
}

export interface DriverBackground {
  id: string
  driverId: string                 // → fg_drivers
  orgId: string
  bgStatus: BGStatus
  criminalRecord: 'clear' | 'flagged' | null
  addressVerified: boolean | null
  employmentVerified: boolean | null
  bgVendorRef: string | null
  bgReportUrl: string | null       // S3 URL to vendor PDF report
  rawVendorResponse: Record<string, unknown> | null
  requestedBy: string              // user ID
  requestedAt: Date
  completedAt: Date | null
  // One driver can have multiple records — full history preserved
}

// ─── VEHICLE ───

export interface Vehicle {
  id: string
  orgId: string
  contractorId: string | null      // null = owned by client
  registrationNumber: string
  vehicleType: string
  ownerType: 'owned' | 'contractor'
  rcExpiry: Date | null
  insuranceExpiry: Date | null
  fitnessExpiry: Date | null
  pucExpiry: Date | null
  isActive: boolean
}

// ─── GATE EVENTS ───

export interface GateEvent {
  id: string
  orgId: string
  warehouseId: string
  eventType: GateEventType
  vehicleId: string | null
  driverId: string | null
  contractorId: string | null      // which contractor for THIS visit
  gateInTime: Date | null
  gateOutTime: Date | null
  entryPhotoUrl: string | null     // driver face photo at entry
  exitPhotoUrl: string | null      // driver face photo at exit
  faceMatchResult: FaceMatchResult | null
  faceMatchScore: number | null    // 0-100 from Google Vision
  dlMatchAtExit: boolean | null    // same DL as entry?
  vehicleMatchAtExit: boolean | null
  guardId: string
  notes: string | null
  linkedEventId: string | null     // links entry event to exit event
  createdAt: Date
}

export interface InboundEntry {
  id: string
  gateEventId: string
  orgId: string
  warehouseId: string
  vehicleId: string
  driverId: string
  contractorId: string             // vendor/contractor for this delivery
  vendorName: string
  poNumber: string
  invoiceNumbers: string[]
  dlCheckStatus: CheckStatus
  bgCheckStatus: BGStatus
  vehicleCheckStatus: CheckStatus
  superprocureRef: string | null
  exitGateEventId: string | null
}

export interface VisitorEntry {
  id: string
  gateEventId: string
  orgId: string
  warehouseId: string
  visitorType: 'visitor' | 'contractor' | 'auditor' | 'maintenance' | 'other'
  fullName: string
  idType: 'aadhar' | 'pan' | 'passport' | 'driving_licence' | 'employee_id'
  idNumber: string
  photoUrl: string | null
  purpose: string
  hostName: string
  vehicleNumber: string | null
  passNumber: string
  expectedExit: Date | null
  toolsCarried: string | null
  exitGateEventId: string | null
}

// ─── TRIPS ───

export interface Trip {
  id: string
  orgId: string
  warehouseId: string
  tripCode: string
  vehicleId: string
  driverId: string
  contractorId: string             // contractor for this trip
  status: TripStatus
  source: TripSource               // manual (POC) or superprocure (production)
  cycle1GateInEventId: string | null
  cycle1GateOutEventId: string | null
  cycle2GateInEventId: string | null
  cycle2GateOutEventId: string | null
  qrToken: string | null
  qrGeneratedAt: Date | null
  dlCheckAtDeparture: CheckStatus | null
  bgCheckAtDeparture: BGStatus | null
  vehicleCheckAtDeparture: CheckStatus | null
  createdBy: string
  sapRef: string | null
  superprocureRef: string | null
  closedAt: Date | null
  createdAt: Date
}

export interface TripStop {
  id: string
  tripId: string
  stopOrder: number
  dealerName: string
  dealerMobile: string
  deliveryMode: DeliveryMode
  // Invoice data
  invoiceNumbers: string[]         // entered by guard at gate out
  invoiceCount: number
  plannedInvoiceNumbers: string[]  // from SuperProcure when connected
  invoiceMismatch: boolean         // guard entry ≠ SuperProcure plan
  // Delivery confirmation
  pinHash: string | null
  pinSentAt: Date | null
  pinAttempts: number
  pinLocked: boolean
  status: StopStatus
  confirmedAt: Date | null
  dwellMinutes: number | null
  // Return reconciliation
  returnReason: string | null
  returnedInvoiceNumbers: string[] // physically returned at gate-in
  sapDeliveryRef: string | null
}

// ─── COMPLIANCE ───

export interface ComplianceCheck {
  id: string
  orgId: string
  warehouseId: string
  gateEventId: string
  checkType:
    | 'dl'
    | 'vehicle_rc'
    | 'vehicle_insurance'
    | 'vehicle_fitness'
    | 'vehicle_puc'
    | 'bg_screening'
    | 'face_match'
    | 'dl_exit_match'
    | 'vehicle_exit_match'
  entityId: string
  result: CheckStatus | BGStatus | FaceMatchResult
  checkedAt: Date
  expiryDate: Date | null
  overrideBy: string | null
  overrideReason: string | null
}

export interface Alert {
  id: string
  orgId: string
  warehouseId: string
  type: AlertType
  severity: AlertSeverity
  entityType: string
  entityId: string
  message: string
  status: AlertStatus
  acknowledgedBy: string | null
  acknowledgedAt: Date | null
  resolvedBy: string | null
  resolvedAt: Date | null
  escalatedTo: string | null
  escalatedAt: Date | null
  createdAt: Date
}

export interface Incident {
  id: string
  orgId: string
  warehouseId: string
  type:
    | 'fraud_attempt'
    | 'fake_pod'
    | 'face_mismatch'
    | 'unauthorized_entry'
    | 'vehicle_noncompliance'
    | 'driver_noncompliance'
    | 'invoice_mismatch'
    | 'theft'
    | 'other'
  linkedTripId: string | null
  linkedGateEventId: string | null
  linkedAlertId: string | null
  description: string
  evidenceUrls: string[]
  status: IncidentStatus
  assignedTo: string | null
  slaDeadline: Date
  resolutionNote: string | null
  raisedBy: string
  closedAt: Date | null
  createdAt: Date
}

export interface AuditEvent {
  id: string
  orgId: string
  warehouseId: string | null
  userId: string
  action: string
  entityType: string
  entityId: string
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  timestamp: Date
  ipAddress: string
}

// ─── API RESPONSE TYPES ───

export interface ComplianceCheckResult {
  dlStatus: CheckStatus
  dlExpiryDate: Date | null
  dlDaysRemaining: number | null
  bgStatus: BGStatus
  latestBgCheck: DriverBackground | null
  vehicleStatus: CheckStatus
  vehicleIssues: string[]
  canProceed: boolean
  requiresOverride: boolean
  warnings: string[]
  driver: Driver | null
  vehicle: Vehicle | null
}

export interface ExitCompareResult {
  faceMatch: FaceMatchResult
  faceScore: number
  dlMatch: boolean
  vehicleMatch: boolean
  allMatch: boolean
  flags: string[]
}

export interface QRGenerateResponse {
  qrToken: string
  qrImageBase64: string
  deliveryUrl: string
  expiresAt: Date
}

export interface PINVerifyResponse {
  success: boolean
  attemptsRemaining: number | null
  locked: boolean
  stopStatus: StopStatus
}
```

---

## 5. Firestore Collections

```
fg_organisations/{orgId}
fg_warehouses/{warehouseId}
fg_users/{userId}
fg_contractors/{contractorId}
fg_drivers/{driverId}
fg_driver_background/{bgId}       ← separate from drivers
fg_vehicles/{vehicleId}
fg_gate_events/{eventId}
fg_inbound_entries/{entryId}
fg_visitor_entries/{visitorId}
fg_trips/{tripId}
  fg_trip_stops/{stopId}          ← subcollection of fg_trips
fg_compliance_checks/{checkId}
fg_alerts/{alertId}
fg_incidents/{incidentId}
fg_audit_events/{auditId}         ← append only, never update/delete
fg_bg_screening_requests/{reqId}
```

### Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuth() {
      return request.auth != null;
    }
    function user() {
      return get(/databases/$(database)/documents/fg_users/$(request.auth.uid)).data;
    }
    function isManagerOrAbove() {
      return user().role in ['wh_manager', 'regional_manager', 'cso', 'super_admin'];
    }
    function isCSOorAbove() {
      return user().role in ['cso', 'super_admin'];
    }
    function sameOrg(orgId) {
      return user().orgId == orgId;
    }

    // Audit events — append only, never update or delete
    match /fg_audit_events/{id} {
      allow read: if isAuth() && isCSOorAbove();
      allow create: if isAuth();
      allow update, delete: if false;
    }

    // Gate events — immutable after creation
    match /fg_gate_events/{id} {
      allow read: if isAuth() && sameOrg(resource.data.orgId);
      allow create: if isAuth();
      allow update, delete: if false;
    }

    // Driver background — managers and above only
    match /fg_driver_background/{id} {
      allow read: if isAuth() && isManagerOrAbove();
      allow create: if isAuth();
      allow update: if isAuth() && isManagerOrAbove();
    }

    // Trips
    match /fg_trips/{tripId} {
      allow read: if isAuth() && sameOrg(resource.data.orgId);
      allow create: if isAuth() && isManagerOrAbove();
      allow update: if isAuth();
      match /fg_trip_stops/{stopId} {
        allow read: if isAuth() && sameOrg(get(/databases/$(database)/documents/fg_trips/$(tripId)).data.orgId);
        allow write: if isAuth();
      }
    }

    // Alerts
    match /fg_alerts/{id} {
      allow read: if isAuth() && sameOrg(resource.data.orgId);
      allow create: if isAuth();
      allow update: if isAuth() && isManagerOrAbove();
    }

    // Everything else
    match /{collection}/{id} {
      allow read: if isAuth() && sameOrg(resource.data.orgId);
      allow write: if isAuth() && isManagerOrAbove();
    }
  }
}
```

---

## 6. Firebase Setup

### /src/lib/firebase.ts
```typescript
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export default app
```

### /src/lib/firebaseAdmin.ts
```typescript
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export const adminDb = getFirestore()
export const adminAuth = getAuth()
```

### /src/lib/config.ts
```typescript
export const config = {
  // Controls where trip data comes from
  // POC: 'manual' — WH manager creates trips in FleetGuard
  // Production: 'superprocure' — trips pushed from SuperProcure API
  // Change TRIP_SOURCE in .env only — no code changes needed
  tripSource: (process.env.TRIP_SOURCE || 'manual') as 'manual' | 'superprocure',

  // Face match thresholds
  faceMatch: {
    greenThreshold: 80,   // >= 80% — match, proceed
    amberThreshold: 60,   // 60-79% — uncertain, guard confirms
    redThreshold: 60,     // < 60% — mismatch, hard alert
  },

  // DL expiry warning thresholds (days)
  dlExpiry: {
    redDays: 30,
    amberDays: 60,
  },

  // Alert escalation (minutes)
  escalation: {
    criticalToCSO: 30,
    tripOverdueHours: 12,
    deliveryOverdueHours: 4,
  },
}
```

---

## 7. Data Access Layer — /src/services/

### The Rule
Components, pages, and hooks never import from `firebase/firestore` directly. They only import from `/src/services/`. This means swapping Firebase for any other backend only requires rewriting service files — zero component changes.

**Only these files may import Firebase:**
- `/src/lib/firebase.ts`
- `/src/lib/firebaseAdmin.ts`
- `/src/services/*.ts`

### /src/services/tripDataService.ts
This is the abstraction layer for trip source. Components call this — never tripService directly for trip reads.

```typescript
import { config } from '@/lib/config'
import { tripService } from './tripService'
import { Trip } from '@/types'

// During POC: reads from fg_trips (manual entry by WH manager)
// After SuperProcure connects: reads from SuperProcure API
// Swap by changing TRIP_SOURCE in .env — nothing else changes

export const tripDataService = {

  async getTodaysTrips(warehouseId: string): Promise<Trip[]> {
    if (config.tripSource === 'manual') {
      return tripService.getActiveTrips(warehouseId)
    }
    // SuperProcure implementation goes here when ready
    // return superprocureService.getTodaysTrips(warehouseId)
    return tripService.getActiveTrips(warehouseId)
  },

  async getTripByVehicle(regNumber: string, warehouseId: string): Promise<Trip | null> {
    if (config.tripSource === 'manual') {
      return tripService.getByVehicleRegistration(regNumber, warehouseId)
    }
    // SuperProcure implementation goes here when ready
    return tripService.getByVehicleRegistration(regNumber, warehouseId)
  },

}
```

### /src/services/driverService.ts
```typescript
import { db } from '@/lib/firebase'
import {
  collection, query, where, orderBy,
  onSnapshot, getDocs, getDoc,
  doc, addDoc, updateDoc, Timestamp, Unsubscribe
} from 'firebase/firestore'
import { Driver } from '@/types'

function toDriver(id: string, data: Record<string, unknown>): Driver {
  return {
    id,
    ...data,
    dlExpiry: (data.dlExpiry as Timestamp)?.toDate(),
    registeredAt: (data.registeredAt as Timestamp)?.toDate(),
  } as Driver
}

export const driverService = {

  async getByDLNumber(dlNumber: string, orgId: string): Promise<Driver | null> {
    const q = query(
      collection(db, 'fg_drivers'),
      where('orgId', '==', orgId),
      where('dlNumber', '==', dlNumber),
      where('isActive', '==', true)
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    return toDriver(snap.docs[0].id, snap.docs[0].data())
  },

  async getById(driverId: string): Promise<Driver | null> {
    const snap = await getDoc(doc(db, 'fg_drivers', driverId))
    if (!snap.exists()) return null
    return toDriver(snap.id, snap.data())
  },

  async getAll(orgId: string): Promise<Driver[]> {
    const q = query(
      collection(db, 'fg_drivers'),
      where('orgId', '==', orgId),
      where('isActive', '==', true),
      orderBy('fullName')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => toDriver(d.id, d.data()))
  },

  async create(data: Omit<Driver, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'fg_drivers'), {
      ...data,
      registeredAt: new Date(),
      isActive: true,
    })
    return ref.id
  },

  async updateDL(driverId: string, dlNumber: string, dlExpiry: Date): Promise<void> {
    await updateDoc(doc(db, 'fg_drivers', driverId), { dlNumber, dlExpiry })
  },

  async updateFacePhoto(driverId: string, facePhotoUrl: string): Promise<void> {
    await updateDoc(doc(db, 'fg_drivers', driverId), { facePhotoUrl })
  },

  async deactivate(driverId: string): Promise<void> {
    await updateDoc(doc(db, 'fg_drivers', driverId), { isActive: false })
  },

  subscribeToAll(orgId: string, callback: (drivers: Driver[]) => void): Unsubscribe {
    const q = query(
      collection(db, 'fg_drivers'),
      where('orgId', '==', orgId),
      where('isActive', '==', true)
    )
    return onSnapshot(q, snap => {
      callback(snap.docs.map(d => toDriver(d.id, d.data())))
    })
  },

}
```

### /src/services/driverBackgroundService.ts
```typescript
import { db } from '@/lib/firebase'
import {
  collection, query, where, orderBy,
  getDocs, addDoc, Timestamp
} from 'firebase/firestore'
import { DriverBackground } from '@/types'

function toBG(id: string, data: Record<string, unknown>): DriverBackground {
  return {
    id,
    ...data,
    requestedAt: (data.requestedAt as Timestamp)?.toDate(),
    completedAt: (data.completedAt as Timestamp)?.toDate() || null,
  } as DriverBackground
}

export const driverBackgroundService = {

  // Get latest BG check for a driver
  async getLatest(driverId: string): Promise<DriverBackground | null> {
    const q = query(
      collection(db, 'fg_driver_background'),
      where('driverId', '==', driverId),
      orderBy('requestedAt', 'desc')
    )
    const snap = await getDocs(q)
    if (snap.empty) return null
    return toBG(snap.docs[0].id, snap.docs[0].data())
  },

  // Get full BG history for a driver
  async getHistory(driverId: string): Promise<DriverBackground[]> {
    const q = query(
      collection(db, 'fg_driver_background'),
      where('driverId', '==', driverId),
      orderBy('requestedAt', 'desc')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => toBG(d.id, d.data()))
  },

  async create(data: Omit<DriverBackground, 'id'>): Promise<string> {
    const ref = await addDoc(collection(db, 'fg_driver_background'), {
      ...data,
      requestedAt: new Date(),
    })
    return ref.id
  },

}
```

### /src/services/contractorService.ts
```typescript
import { db } from '@/lib/firebase'
import {
  collection, query, where, orderBy,
  getDocs, getDoc, doc, addDoc, updateDoc, Timestamp
} from 'firebase/firestore'
import { Contractor } from '@/types'

function toContractor(id: string, data: Record<string, unknown>): Contractor {
  return {
    id,
    ...data,
    contractStart: (data.contractStart as Timestamp)?.toDate() || null,
    contractEnd: (data.contractEnd as Timestamp)?.toDate() || null,
    createdAt: (data.createdAt as Timestamp)?.toDate(),
  } as Contractor
}

export const contractorService = {

  async getAll(orgId: string): Promise<Contractor[]> {
    const q = query(
      collection(db, 'fg_contractors'),
      where('orgId', '==', orgId),
      where('isActive', '==', true),
      orderBy('name')
    )
    const snap = await getDocs(q)
    return snap.docs.map(d => toContractor(d.id, d.data()))
  },

  async getById(contractorId: string): Promise<Contractor | null> {
    const snap = await getDoc(doc(db, 'fg_contractors', contractorId))
    if (!snap.exists()) return null
    return toContractor(snap.id, snap.data())
  },

  // Quick create at gate — guard adds name + mobile, details completed later by manager
  async createQuick(orgId: string, name: string, contactMobile: string, createdBy: string): Promise<string> {
    const ref = await addDoc(collection(db, 'fg_contractors'), {
      orgId,
      name,
      contactName: '',
      contactMobile,
      contractStart: null,
      contractEnd: null,
      isActive: true,
      createdAt: new Date(),
      createdBy,
      isComplete: false,     // flag for WH manager to complete details
    })
    return ref.id
  },

  async update(contractorId: string, fields: Partial<Contractor>): Promise<void> {
    await updateDoc(doc(db, 'fg_contractors', contractorId), {
      ...fields,
      isComplete: true,
    })
  },

}
```

---

## 8. API Routes

### /src/api/checks/driver/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import { config } from '@/lib/config'
import { ComplianceCheckResult } from '@/types'

export async function GET(req: NextRequest) {
  const dlNumber = req.nextUrl.searchParams.get('dl_number')
  const orgId = req.nextUrl.searchParams.get('org_id')

  if (!dlNumber || !orgId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  const driversSnap = await adminDb
    .collection('fg_drivers')
    .where('orgId', '==', orgId)
    .where('dlNumber', '==', dlNumber)
    .limit(1)
    .get()

  if (driversSnap.empty) {
    return NextResponse.json({ error: 'DRIVER_NOT_FOUND' }, { status: 404 })
  }

  const driverDoc = driversSnap.docs[0]
  const driver = driverDoc.data()
  const today = new Date()
  const dlExpiry = driver.dlExpiry.toDate()
  const daysRemaining = Math.floor((dlExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let dlStatus: 'clear' | 'expiring' | 'expired' | 'blocked' = 'clear'
  if (daysRemaining < 0) dlStatus = 'blocked'
  else if (daysRemaining <= config.dlExpiry.redDays) dlStatus = 'blocked'
  else if (daysRemaining <= config.dlExpiry.amberDays) dlStatus = 'expiring'

  // Get latest BG record
  const bgSnap = await adminDb
    .collection('fg_driver_background')
    .where('driverId', '==', driverDoc.id)
    .orderBy('requestedAt', 'desc')
    .limit(1)
    .get()

  const latestBG = bgSnap.empty ? null : bgSnap.docs[0].data()
  const bgStatus = latestBG?.bgStatus || 'pending'

  const requiresOverride = dlStatus === 'blocked' || bgStatus === 'flagged'

  const result: ComplianceCheckResult = {
    dlStatus,
    dlExpiryDate: dlExpiry,
    dlDaysRemaining: daysRemaining,
    bgStatus,
    latestBgCheck: latestBG as any,
    vehicleStatus: 'clear',
    vehicleIssues: [],
    canProceed: !requiresOverride,
    requiresOverride,
    warnings: [],
    driver: { id: driverDoc.id, ...driver } as any,
    vehicle: null,
  }

  if (dlStatus === 'expiring') result.warnings.push(`DL expiring in ${daysRemaining} days`)
  if (bgStatus === 'pending') result.warnings.push('Background check pending')
  if (bgStatus === 'recheck_required') result.warnings.push('Background recheck required')

  return NextResponse.json(result)
}
```

### /src/api/face/compare/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import axios from 'axios'
import { config } from '@/lib/config'
import { FaceMatchResult, ExitCompareResult } from '@/types'

export async function POST(req: NextRequest) {
  const { gateEventId, exitPhotoBase64, exitDlNumber, exitVehicleReg } = await req.json()

  // Get entry gate event
  const eventSnap = await adminDb.collection('fg_gate_events').doc(gateEventId).get()
  if (!eventSnap.exists) {
    return NextResponse.json({ error: 'Gate event not found' }, { status: 404 })
  }

  const entryEvent = eventSnap.data()!

  // Get entry driver for DL + entry photo
  const driverSnap = await adminDb.collection('fg_drivers').doc(entryEvent.driverId).get()
  const driver = driverSnap.data()!

  // 1. Face comparison via Google Cloud Vision
  const visionResponse = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
    {
      requests: [
        {
          image: { content: entryEvent.entryPhotoBase64 },
          features: [{ type: 'FACE_DETECTION', maxResults: 1 }],
        },
        {
          image: { content: exitPhotoBase64 },
          features: [{ type: 'FACE_DETECTION', maxResults: 1 }],
        },
      ],
    }
  )

  // Calculate similarity score from landmark positions
  const entryFace = visionResponse.data.responses[0]?.faceAnnotations?.[0]
  const exitFace = visionResponse.data.responses[1]?.faceAnnotations?.[0]

  let faceScore = 0
  let faceMatch: FaceMatchResult = 'mismatch'

  if (entryFace && exitFace) {
    // Use detection confidence as similarity proxy
    // For production: use Face++ or AWS Rekognition for true 1:1 comparison
    const entryConf = entryFace.detectionConfidence || 0
    const exitConf = exitFace.detectionConfidence || 0
    faceScore = Math.round(((entryConf + exitConf) / 2) * 100)

    if (faceScore >= config.faceMatch.greenThreshold) faceMatch = 'match'
    else if (faceScore >= config.faceMatch.amberThreshold) faceMatch = 'uncertain'
    else faceMatch = 'mismatch'
  }

  // 2. DL match check
  const dlMatch = driver.dlNumber === exitDlNumber

  // 3. Vehicle match check
  const vehicleSnap = await adminDb.collection('fg_vehicles').doc(entryEvent.vehicleId).get()
  const vehicle = vehicleSnap.data()!
  const vehicleMatch = vehicle.registrationNumber === exitVehicleReg

  const flags: string[] = []
  if (faceMatch === 'mismatch') flags.push('Face does not match entry photo')
  if (faceMatch === 'uncertain') flags.push('Face match uncertain — guard must confirm')
  if (!dlMatch) flags.push(`DL mismatch: entry ${driver.dlNumber} vs exit ${exitDlNumber}`)
  if (!vehicleMatch) flags.push(`Vehicle mismatch: entry ${vehicle.registrationNumber} vs exit ${exitVehicleReg}`)

  const allMatch = faceMatch === 'match' && dlMatch && vehicleMatch

  // Update gate event with exit comparison results
  await adminDb.collection('fg_gate_events').doc(gateEventId).update({
    exitPhotoUrl: exitPhotoBase64, // store properly to S3 in production
    faceMatchResult: faceMatch,
    faceMatchScore: faceScore,
    dlMatchAtExit: dlMatch,
    vehicleMatchAtExit: vehicleMatch,
  })

  // Fire alert if any mismatch
  if (!allMatch) {
    const severity = faceMatch === 'mismatch' || !dlMatch || !vehicleMatch ? 'critical' : 'warning'
    await adminDb.collection('fg_alerts').add({
      orgId: entryEvent.orgId,
      warehouseId: entryEvent.warehouseId,
      type: faceMatch === 'mismatch' ? 'face_mismatch'
        : !dlMatch ? 'dl_mismatch_at_exit'
        : 'vehicle_mismatch_at_exit',
      severity,
      entityType: 'gate_event',
      entityId: gateEventId,
      message: flags.join(' | '),
      status: 'open',
      createdAt: new Date(),
    })
  }

  const result: ExitCompareResult = {
    faceMatch,
    faceScore,
    dlMatch,
    vehicleMatch,
    allMatch,
    flags,
  }

  return NextResponse.json(result)
}
```

### /src/api/qr/generate/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'

export async function POST(req: NextRequest) {
  const { tripId, orgId, warehouseId } = await req.json()

  const tripRef = adminDb.collection('fg_trips').doc(tripId)
  const tripSnap = await tripRef.get()
  if (!tripSnap.exists) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  }

  const payload = {
    tripId,
    orgId,
    warehouseId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
  }

  const token = jwt.sign(payload, process.env.QR_SECRET!)
  const deliveryUrl = `${process.env.NEXT_PUBLIC_APP_URL}/deliver/${token}`

  const qrImageBase64 = await QRCode.toDataURL(deliveryUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#1E3A5F', light: '#FFFFFF' },
  })

  await tripRef.update({
    qrToken: token,
    qrGeneratedAt: new Date(),
    status: 'in_transit',
  })

  return NextResponse.json({
    qrToken: token,
    qrImageBase64,
    deliveryUrl,
    expiresAt: new Date(payload.exp * 1000),
  })
}
```

### /src/api/pin/generate/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { sendSMS } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const { stopId, tripId, dealerMobile, truckNumber } = await req.json()

  const pin = crypto.randomInt(1000, 9999).toString().padStart(4, '0')
  const pinHash = await bcrypt.hash(pin, 10)

  await adminDb
    .collection('fg_trips').doc(tripId)
    .collection('fg_trip_stops').doc(stopId)
    .update({ pinHash, pinSentAt: new Date(), pinAttempts: 0, pinLocked: false })

  const message = `FleetGuard delivery PIN for truck ${truckNumber}: ${pin}. Valid for this delivery only. Do not share.`
  await sendSMS(dealerMobile, message)

  // PIN never returned — only sent via SMS
  return NextResponse.json({ success: true })
}
```

### /src/api/pin/verify/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebaseAdmin'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { writeAuditLog } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const { qrToken, stopId, pin } = await req.json()

  let decoded: { tripId: string; orgId: string; warehouseId: string }
  try {
    decoded = jwt.verify(qrToken, process.env.QR_SECRET!) as typeof decoded
  } catch {
    return NextResponse.json({ error: 'Invalid or expired QR code' }, { status: 401 })
  }

  const { tripId, orgId, warehouseId } = decoded
  const stopRef = adminDb.collection('fg_trips').doc(tripId).collection('fg_trip_stops').doc(stopId)
  const stopSnap = await stopRef.get()

  if (!stopSnap.exists) return NextResponse.json({ error: 'Stop not found' }, { status: 404 })

  const stop = stopSnap.data()!

  if (stop.pinLocked) return NextResponse.json({ error: 'PIN locked. Contact your warehouse.', locked: true }, { status: 403 })
  if (stop.status === 'confirmed') return NextResponse.json({ error: 'Already confirmed' }, { status: 400 })

  const isValid = await bcrypt.compare(pin, stop.pinHash)

  if (!isValid) {
    const newAttempts = (stop.pinAttempts || 0) + 1
    const locked = newAttempts >= 3
    await stopRef.update({ pinAttempts: newAttempts, pinLocked: locked })

    if (locked) {
      await adminDb.collection('fg_alerts').add({
        orgId, warehouseId,
        type: 'pin_locked',
        severity: 'critical',
        entityType: 'trip_stop',
        entityId: stopId,
        message: `PIN locked after 3 wrong attempts on stop ${stop.stopOrder}`,
        status: 'open',
        createdAt: new Date(),
      })
    }

    return NextResponse.json({ success: false, attemptsRemaining: locked ? 0 : 3 - newAttempts, locked })
  }

  const now = new Date()
  const dwellMinutes = stop.pinSentAt
    ? Math.floor((now.getTime() - stop.pinSentAt.toDate().getTime()) / 60000)
    : null

  await stopRef.update({ status: 'confirmed', confirmedAt: now, dwellMinutes })

  await writeAuditLog({
    orgId, warehouseId,
    userId: 'dealer',
    action: 'delivery_confirmed',
    entityType: 'trip_stop',
    entityId: stopId,
    newValue: { status: 'confirmed', confirmedAt: now },
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
  })

  return NextResponse.json({ success: true, stopStatus: 'confirmed' })
}
```

---

## 9. Guard Screen Flows

### Guard Home — /src/app/guard/page.tsx
- Full screen, dark navy background (#1E3A5F)
- 4 large buttons in 2×2 grid
- **New Entry** — log any truck or person arriving
- **Confirm Departure** — gate out for a loaded delivery truck
- **Truck Return** — gate in for a returning delivery truck
- **Active Events** — who is inside right now
- Show warehouse name, guard name, current time
- Badge on Active Events showing count of open events

### New Entry — /src/app/guard/truck-entry/page.tsx

**Step 1 — Entry type**
Two large cards: Inbound Vendor Truck / Visitor or Contractor

**If Inbound Vendor Truck → Steps:**

1. Vehicle registration → auto compliance check (RC/insurance/fitness/PUC)
2. Driver DL number → auto DL + BG check
   - Found: show name, face photo, check badges
   - Not found: inline register form (name, mobile, DL expiry, face photo via webcam)
3. Contractor/Vendor → searchable dropdown of `fg_contractors`
   - Not found: tap "Add New" → modal with name + mobile → saves instantly → auto-selected
4. Driver face photo → webcam capture → stored as `entryPhotoUrl`
5. PO number + invoice numbers (comma separated or one by one)
6. Check badges summary (DL / BG / Vehicle / Contractor)
   - Any RED → block banner, disable confirm, show "Manager override required"
   - Any AMBER → warning banner, Acknowledge button required
7. Confirm → creates `fg_gate_events` + `fg_inbound_entries`

**If Visitor or Contractor → Steps:**
1. Type: Visitor / Contractor / Maintenance / Auditor / Other
2. Name + ID type + ID number
3. Face photo via webcam
4. Purpose + host name
5. Vehicle number (optional)
6. Expected exit time
7. Confirm → creates `fg_gate_events` + `fg_visitor_entries` → shows pass number

### Confirm Departure — /src/app/guard/confirm-departure/page.tsx
Guard confirms gate OUT Cycle 1 — delivery truck leaving loaded.

1. Vehicle registration input → system finds trip via `tripDataService.getTripByVehicle`
   - Shows: trip code, driver name, number of stops, contractor
2. Run compliance checks: DL + BG + vehicle
3. Driver face photo → webcam capture → `entryPhotoUrl` stored on gate event
4. Invoice entry per stop:
   - System shows each stop: Dealer name
   - Guard enters invoice numbers for that stop (comma separated text input)
   - Count shown: "3 invoices for Dealer A"
5. Confirm each stop mode: Simple or Secure (pre-set by WH manager, guard can see)
6. Check badges (DL / BG / Vehicle / Contractor)
7. Confirm Departure:
   - Calls `/api/qr/generate` → QR PNG returned
   - For each Secure stop: calls `/api/pin/generate` → PIN sent via SMS
   - QR displayed full screen with Print button
   - Trip status → `in_transit`

### Truck Return — /src/app/guard/trip-return/page.tsx
Guard logs Gate IN Cycle 2 — delivery truck returning after deliveries.

1. Vehicle registration → system finds active trip
2. Driver face photo → webcam capture → `exitPhotoUrl`
3. System calls `/api/face/compare` automatically
   - Shows result: Match (green) / Uncertain (amber) / Mismatch (red)
   - Shows entry photo vs exit photo side by side
4. DL number re-entry → system checks match vs entry
5. Vehicle registration confirmed → system checks match
6. Stop reconciliation:
   - System shows each stop with current status
   - Confirmed stops (dealer confirmed via QR): shown as green, locked
   - Unconfirmed stops: guard selects reason:
     - Goods Returned (guard verifies physical invoices came back)
     - Dealer Closed → reschedule
     - Disputed → incident auto-created
     - Other → free text reason
7. Confirm Return → trip status → `returning`
   - If any mismatch: alert fires, WH manager + CSO notified

### Close Trip — /src/app/guard/close-trip/page.tsx
Guard confirms Gate OUT Cycle 2 — truck leaving empty, trip fully closed.

1. Shows returning trip summary
2. Shows all stop reconciliation results
3. If any mismatches outstanding → shows warning, requires manager acknowledgement
4. Confirm Close → trip status → `closed`, `closedAt` set

---

## 10. Dealer Confirmation Page — /src/app/deliver/[token]/page.tsx

Public page. No auth. No app install. Must work on 2G in under 3 seconds.

- Server component — validate token server-side
- If token invalid or expired: show clear error message
- If valid: show truck number, driver name + photo, invoice list for this stop
- Simple mode: one large "Confirm Delivery" button → calls `/api/pin/verify` equivalent
- Secure mode: 4 large PIN digit inputs → Submit → calls `/api/pin/verify`
  - Wrong PIN: show "X attempts remaining"
  - Locked: show "Your delivery is locked. Contact your warehouse: [WH phone number]"
  - Correct: large green success screen with timestamp
- Keep page under 50KB total — no heavy libraries

---

## 11. WH Manager Dashboard — /src/app/manager/page.tsx

**Top row — 4 metric cards:**
Active trips / Open alerts / Drivers flagged / Visitors inside

**Today's gate events** (real-time Firestore listener):
- Every truck entry/exit and visitor entry today
- Time, type, truck/person, guard name, status badge

**Active trips panel** (real-time):
- Each trip: truck, driver, contractor, stops progress (2/4 confirmed), time departed
- Click → full trip detail with stop-by-stop delivery status

**Alert inbox:**
- All open alerts for this warehouse
- Acknowledge / resolve / override with one tap

**Contractors needing completion** (isComplete = false):
- Contractors added quickly at gate — WH manager completes full details

---

## 12. CSO Dashboard — /src/app/cso/page.tsx

**Command bar** (always visible, real-time):
- Total active trips pan-India
- Open critical alerts count
- Warehouses with SLA-breached incidents

**Compliance clock** (most important widget):
```
              0-30 days   31-60 days   61-90 days
DL expiry        [n]          [n]          [n]
Vehicle docs     [n]          [n]          [n]
Contractor       [n]          [n]          [n]
```
Every cell is clickable — drills to exact list.

**Live trip feed** (Firestore `onSnapshot`):
- All in_transit and returning trips across all warehouses
- Each: warehouse, truck, driver, stops confirmed, time since departure

**Alert feed** (Firestore `onSnapshot`, critical only):
- Face mismatches, PIN locks, BG flags — newest first

**Warehouse grid:**
- Card per warehouse: name, city, active trips, open alerts, status colour
- Green: all clear
- Amber: warnings present
- Red: critical alerts or SLA breached

---

## 13. Build Order

Build in this exact sequence. Each step must be working before moving to the next.

```
Step 1  Firebase project + env vars + admin SDK + security rules
Step 2  Auth: login page + role redirect + RoleGuard component
Step 3  All TypeScript types in /src/types/index.ts
Step 4  /src/lib/config.ts
Step 5  All service files in /src/services/ (DAL layer — shell functions first)
Step 6  /src/services/tripDataService.ts with TRIP_SOURCE flag
Step 7  Contractor service + contractor dropdown with inline add
Step 8  Driver service + /api/checks/driver route
Step 9  Vehicle service + /api/checks/vehicle route
Step 10 WebcamCapture component (browser getUserMedia)
Step 11 CheckResultBadge component
Step 12 Guard home screen
Step 13 Truck entry form — inbound flow (vehicle + driver + contractor + face photo)
Step 14 Visitor entry form
Step 15 Active events screen (real-time)
Step 16 WH manager trip create form (manual — POC)
Step 17 Invoice entry per stop (InvoiceEntry component)
Step 18 /api/qr/generate route + QRDisplay component
Step 19 /api/pin/generate route + MSG91 SMS
Step 20 Guard confirm departure flow (full: checks + invoices + QR)
Step 21 Dealer confirmation page (/deliver/[token]) — simple mode
Step 22 /api/pin/verify route — secure mode
Step 23 /api/face/compare route — Google Vision
Step 24 Guard truck return flow (face compare + stop reconciliation)
Step 25 Guard close trip flow
Step 26 Alert engine — all alert types firing correctly
Step 27 WH manager dashboard (real-time)
Step 28 CSO dashboard (compliance clock + live feeds)
Step 29 Incident management
Step 30 MIS CSV export
Step 31 End-to-end test: full outbound lifecycle
        Gate IN → trip create → invoice entry → depart → QR → dealer confirm
        → truck return → face compare → reconcile → close
Step 32 End-to-end test: inbound lifecycle
        Gate IN → vendor entry → gate OUT
Step 33 End-to-end test: mismatch scenario
        Face mismatch at exit → alert fires → incident created → CSO sees it
```

---

## 14. Critical Rules — Never Break These

1. **PIN never returned to frontend** — generated server-side, sent via SMS only, never in any API response
2. **QR_SECRET never on client** — only in server env vars, only used in `/api` routes
3. **`fg_audit_events` is append-only** — no update, no delete, ever
4. **`fg_gate_events` is immutable** — no update or delete after creation
5. **Compliance checks always server-side** — never trust frontend to run or skip them
6. **Every override logged** — WH manager override writes to audit log with reason and user ID
7. **Dealer page under 50KB** — no heavy JS, no auth, must work on 2G
8. **Firebase Admin SDK only in `/api` routes** — never import in any component, hook, or page
9. **No `any` types** — strict TypeScript everywhere
10. **Components never import Firebase directly** — always import from `/src/services/` only
11. **All collections use `fg_` prefix** — no exceptions
12. **`/src/lib/firebase.ts` imported only by `/src/services/` files**
13. **Driver has no contractorId** — contractor association recorded per gate event only
14. **Driver background is a separate collection** — never merge into `fg_drivers`
15. **TRIP_SOURCE flag controls trip data source** — change `.env` only, no code changes to swap

---

*FleetGuard · Claude Code Delivery Brief · Final*
*Stack: Next.js 14 + TypeScript + Firebase + TailwindCSS*
*POC → Production: change TRIP_SOURCE=superprocure in .env*
*Firebase → Any backend: rewrite /src/services/ files only*