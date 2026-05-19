export interface ExpiryStat {
  expired: boolean;
  expiring30: boolean;
  expiring90: boolean;
  days: number | null;
}

export interface VehicleComplianceStats {
  total: number;

  pucExpired: number;
  pucExp30: number;
  pucExp90: number;

  rcExpired: number;
  rcExp30: number;
  rcExp90: number;

  insExpired: number;
  insExp30: number;
  insExp90: number;

  fitExpired: number;
  fitExp30: number;
  fitExp90: number;

  anyExpired: number;
}

const DAY = 86400000;

function normalizeDate(date: Date): number {
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
}

export function calculateDays(expiry: Date | null): number | null {
  if (!expiry) return null;

  const today = normalizeDate(new Date());
  const target = normalizeDate(expiry);

  return Math.floor((target - today) / DAY);
}

export function getExpiryStat(expiry: Date | null): ExpiryStat {
  const days = calculateDays(expiry);

  if (days === null) {
    return {
      expired: false,
      expiring30: false,
      expiring90: false,
      days: null,
    };
  }

  return {
    expired: days < 0,
    expiring30: days >= 0 && days <= 30,
    expiring90: days >= 0 && days <= 90,
    days,
  };
}

export function calculateVehicleComplianceStats(
  vehicles: Array<{
    pucExpiry: Date | null;
    rcExpiry: Date | null;
    insuranceExpiry: Date | null;
    fitnessExpiry: Date | null;
  }>
): VehicleComplianceStats {

  const stats: VehicleComplianceStats = {
    total: vehicles.length,

    pucExpired: 0,
    pucExp30: 0,
    pucExp90: 0,

    rcExpired: 0,
    rcExp30: 0,
    rcExp90: 0,

    insExpired: 0,
    insExp30: 0,
    insExp90: 0,

    fitExpired: 0,
    fitExp30: 0,
    fitExp90: 0,

    anyExpired: 0,
  };

  for (const v of vehicles) {

    const puc = getExpiryStat(v.pucExpiry);
    const rc  = getExpiryStat(v.rcExpiry);
    const ins = getExpiryStat(v.insuranceExpiry);
    const fit = getExpiryStat(v.fitnessExpiry);

    if (puc.expired) stats.pucExpired++;
    if (puc.expiring30) stats.pucExp30++;
    if (puc.expiring90) stats.pucExp90++;

    if (rc.expired) stats.rcExpired++;
    if (rc.expiring30) stats.rcExp30++;
    if (rc.expiring90) stats.rcExp90++;

    if (ins.expired) stats.insExpired++;
    if (ins.expiring30) stats.insExp30++;
    if (ins.expiring90) stats.insExp90++;

    if (fit.expired) stats.fitExpired++;
    if (fit.expiring30) stats.fitExp30++;
    if (fit.expiring90) stats.fitExp90++;

    if (
      puc.expired ||
      rc.expired ||
      ins.expired ||
      fit.expired
    ) {
      stats.anyExpired++;
    }
  }

  return stats;
}