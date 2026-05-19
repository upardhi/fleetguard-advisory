/**
 * FleetGuard — DAL barrel export
 * Import from here rather than individual service files.
 */

export * from "./userService";
export * from "./contractorService";
export * from "./driverService";
export * from "./driverBackgroundService";
export * from "./vehicleService";
export * from "./gateEventService";
export * from "./inboundEntryService";
export * from "./visitorService";
// tripService exports low-level Firestore types (FgTrip, FgTripStop, etc.)
export * from "./tripService";
// tripDataService exports the public API used by pages (honours TRIP_SOURCE flag)
// It re-exports getTripById under a different scope — import directly when needed
export { getTripsForWarehouse, getActiveTripsByWarehouse } from "./tripDataService";
export type {} from "./tripDataService";
export * from "./alertService";
export * from "./incidentService";
export * from "./auditService";
export * from "./complianceService";
export * from "./organisationService";
export * from "./dealerService";
export * from "./warehouseService";
export * from "./warehouseGateService";
export * from "./serviceProviderService";
export * from "./importService";
export * from "./supportTicketService";
