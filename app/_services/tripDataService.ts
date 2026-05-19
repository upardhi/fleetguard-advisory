/**
 * FleetGuard — Trip Data abstraction layer
 *
 * Sits between pages and the concrete trip service.
 * When TRIP_SOURCE=mock → returns mock data.
 * When TRIP_SOURCE=firestore → delegates to tripService.
 * When TRIP_SOURCE=superprocure → delegates to tripService (SuperProcure syncs here).
 *
 * This is the ONLY place in the codebase that checks TRIP_SOURCE.
 * All pages import from tripDataService, never from tripService directly.
 */

import { config } from "../_lib/config";
import type { Trip, TripStop } from "../_lib/types";
import { trips as mockTrips } from "../_lib/mockData";
import * as tripSvc from "./tripService";
import type { FgTrip, FgTripStop } from "./tripService";
import * as tripSvcV2 from "./v2/trips";

// ── Conversion helpers ────────────────────────────────────────────────────────

function fgTripToTrip(fg: FgTrip, stops: FgTripStop[] = []): Trip {
  return {
    id: fg.id,
    tripCode: fg.tripCode,
    vehicleId: fg.vehicleId,
    vehicleReg: fg.vehicleReg,
    driverId: fg.driverId,
    driverName: fg.driverName,
    contractorId: fg.contractorId,
    contractorName: fg.contractorName,
    status: fg.status,
    warehouseId: fg.warehouseId,
    warehouseName: "", // enriched downstream if needed
    totalStops: fg.totalStops,
    confirmedStops: fg.confirmedStops,
    departedAt: fg.departedAt,
    plannedReturn: fg.plannedReturn,
    stops: stops.map(fgTripStopToTripStop),
  };
}

function fgTripStopToTripStop(fg: FgTripStop): TripStop {
  return {
    id: fg.id,
    stopOrder: fg.stopOrder,
    dealerName: fg.dealerName,
    city: fg.city,
    invoiceCount: fg.invoiceCount,
    invoiceNumbers: fg.invoiceNumbers,
    deliveryMode: fg.deliveryMode,
    status: fg.status,
    confirmedAt: fg.confirmedAt,
    dwellMinutes: fg.dwellMinutes,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getTripsForWarehouse(warehouseId: string): Promise<Trip[]> {
  if (config.tripSource === "mock") {
    return mockTrips.filter((t) => t.warehouseId === warehouseId);
  }
  const fgTrips = await tripSvc.getTripsByWarehouse(warehouseId);
  return Promise.all(
    fgTrips.map(async (fg) => {
      const stops = await tripSvc.getTripStops(fg.id);
      return fgTripToTrip(fg, stops);
    })
  );
}

export async function getActiveTripsByWarehouse(warehouseId: string): Promise<Trip[]> {
  if (config.tripSource === "mock") {
    return mockTrips.filter(
      (t) =>
        t.warehouseId === warehouseId && ["in_transit", "loading", "returning"].includes(t.status)
    );
  }
  const fgTrips = await tripSvc.getActiveTrips(warehouseId);
  return Promise.all(
    fgTrips.map(async (fg) => {
      const stops = await tripSvc.getTripStops(fg.id);
      return fgTripToTrip(fg, stops);
    })
  );
}

export async function getTripById(id: string): Promise<Trip | null> {
  if (config.tripSource === "mock") {
    return mockTrips.find((t) => t.id === id) ?? null;
  }
  const fg = await tripSvc.getTripById(id);
  if (!fg) return null;
  const stops = await tripSvc.getTripStops(fg.id);
  return fgTripToTrip(fg, stops);
}

export async function getTripsListForWarehouse(warehouseId: string): Promise<Trip[]> {
  if (config.tripSource === "mock") {
    return mockTrips.filter((t) => t.warehouseId === warehouseId);
  }

  const { trips } = await tripSvcV2.getTrips({ warehouseId, limit: 100 });

  // No stop fetching here — list view doesn't need it
  return trips.map((t) => ({
    id:             t.id,
    tripCode:       t.tripCode,
    vehicleId:      t.vehicleId,
    vehicleReg:     t.vehicleReg,
    driverId:       t.driverId,
    driverName:     t.driverName,
    contractorId:   t.contractorId ?? "",
    contractorName: t.contractorName,
    status:         t.status as Trip["status"],
    warehouseId:    t.warehouseId,
    warehouseName:  "",
    totalStops:     t.totalStops,
    confirmedStops: t.confirmedStops,
    departedAt:     t.departedAt ? new Date(t.departedAt) : null,
    plannedReturn:  t.plannedReturn ? new Date(t.plannedReturn) : null,
    stops:          [],   // loaded lazily on drawer open
  }));
}