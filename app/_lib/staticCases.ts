/**
 * Static / pinned demo cases — the *only* mock data path remaining in the app.
 *
 * When a guard enters one of these DL numbers (or its de-hyphenated variant),
 * both /api/verify/dl and /api/crimecheck/initiate skip the live vendor calls
 * and return deterministic data for the linked driver. /api/crimecheck/poll
 * does the same for the corresponding caseId.
 *
 * Any other DL number → live IDfy / live crime-check vendor.
 */

// Hyphen + de-hyphen variants resolve to the same caseId (and same driver).
export const DL_STATIC_CASE_IDS: Record<string, string> = {
  "MH31-20230002308": "fraudcheck_kartik",
  "MH3120230002308":  "fraudcheck_kartik",
  "TN15-20210002320": "fraudcheck_pravin",
  "TN1520210002320":  "fraudcheck_pravin",
  "MH12-20010149313": "fraudcheck_nivrutti",
  "MH1220010149313":  "fraudcheck_nivrutti",
  "MH31-20090006204": "fraudcheck_sanjay",
  "MH3120090006204":  "fraudcheck_sanjay",
};

// Build a normalised-key lookup so callers don't have to know which form was entered.
function normaliseDl(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, "");
}

export function lookupStaticCaseId(dlNumber: string): string | null {
  return DL_STATIC_CASE_IDS[dlNumber]
      ?? DL_STATIC_CASE_IDS[normaliseDl(dlNumber)]
      ?? null;
}

// ── Static IDfy-shape DL responses, keyed by caseId ───────────────────────────
//
// Each entry mimics the result shape /api/verify/dl normally returns from IDfy,
// so the client-side translateIdfy() parser doesn't need a special case.

interface StaticDriver {
  caseId: string;
  dlNumber: string;
  dob: string;            // DD-MM-YYYY
  name: string;
  fatherName: string;
  gender: "M" | "F";
  state: string;
  rto: string;
  address: string;
  ntFrom: string;         // DD-MM-YYYY
  ntTo: string;
  trFrom: string;
  trTo: string;
  dateOfIssue: string;
  cov: string[];
  // Vehicle / RC pinned to this demo driver (entered by guard alongside the DL).
  rcNumber:           string;   // canonical, no spaces or hyphens
  rcOwnerName:        string;
  rcManufacturer:     string;
  rcMakerModel:       string;
  rcVehicleClass:     string;
  rcFuelType:         string;
  rcChassisNumber:    string;
  rcEngineNumber:     string;
  rcColor:            string;
  rcRegistrationDate: string;   // YYYY-MM-DD
  rcMvTaxUpto:        string;   // YYYY-MM-DD  → rcExpiry
  rcInsuranceUpto:    string;   // YYYY-MM-DD
  rcFitnessUpto:      string;   // YYYY-MM-DD
  rcPucUpto:          string;   // YYYY-MM-DD
}

const DRIVERS: StaticDriver[] = [
  {
    caseId: "fraudcheck_kartik",
    dlNumber: "MH3120230002308",
    dob: "12-04-1992",
    name: "KARTIK ALIK SUGRIYA",
    fatherName: "ALIK SUGRIYA",
    gender: "M",
    state: "Maharashtra",
    rto: "RTO NAGPUR (CITY)",
    address: "PLOT 22, MANEWADA ROAD, NAGPUR, MAHARASHTRA",
    ntFrom: "10-03-2023", ntTo: "09-03-2043",
    trFrom: "10-03-2023", trTo: "09-03-2028",
    dateOfIssue: "10-03-2023",
    cov: ["LMV", "HMV"],
    rcNumber:           "MH31AB1234",
    rcOwnerName:        "KARTIK ALIK SUGRIYA",
    rcManufacturer:     "TATA MOTORS LTD",
    rcMakerModel:       "TATA SIGNA 4825.S BS6",
    rcVehicleClass:     "HGV",
    rcFuelType:         "DIESEL",
    rcChassisNumber:    "MAT522098NHJ41234",
    rcEngineNumber:     "60Z25612345",
    rcColor:            "WHITE",
    rcRegistrationDate: "2023-04-10",
    rcMvTaxUpto:        "2028-03-31",
    rcInsuranceUpto:    "2026-04-09",
    rcFitnessUpto:      "2028-04-09",
    rcPucUpto:          "2026-10-09",
  },
  {
    caseId: "fraudcheck_pravin",
    dlNumber: "TN1520210002320",
    dob: "16-07-2002",
    name: "PRAVIN KUMAR",
    fatherName: "RAMASWAMY",
    gender: "M",
    state: "Tamil Nadu",
    rto: "RTO TRICHY",
    address: "12 MAIN ROAD, SRIRANGAM, TRICHY, TAMIL NADU",
    ntFrom: "05-06-2021", ntTo: "04-06-2041",
    trFrom: "05-06-2021", trTo: "04-06-2026",
    dateOfIssue: "05-06-2021",
    cov: ["LMV", "HMV", "TRANS"],
    rcNumber:           "TN15CD5678",
    rcOwnerName:        "PRAVIN KUMAR",
    rcManufacturer:     "ASHOK LEYLAND LTD",
    rcMakerModel:       "ASHOK LEYLAND ECOMET 1215 HE",
    rcVehicleClass:     "MGV",
    rcFuelType:         "DIESEL",
    rcChassisNumber:    "MB1WAALN1MRBG5678",
    rcEngineNumber:     "PHB1G45678",
    rcColor:            "BLUE",
    rcRegistrationDate: "2021-06-12",
    rcMvTaxUpto:        "2026-06-11",
    rcInsuranceUpto:    "2026-06-11",
    rcFitnessUpto:      "2026-06-11",
    rcPucUpto:          "2026-12-11",
  },
  {
    caseId: "fraudcheck_nivrutti",
    dlNumber: "MH1220010149313",
    dob: "07-11-1968",
    name: "NIVRUTTI SHIVAJI PATIL",
    fatherName: "SHIVAJI PATIL",
    gender: "M",
    state: "Maharashtra",
    rto: "RTO PUNE",
    address: "AT POST WAGHOLI, TAL HAVELI, PUNE, MAHARASHTRA",
    ntFrom: "20-08-2001", ntTo: "19-08-2031",
    trFrom: "20-08-2016", trTo: "19-08-2026",
    dateOfIssue: "20-08-2001",
    cov: ["LMV", "HMV", "HGMV"],
    rcNumber:           "MH12EF9012",
    rcOwnerName:        "NIVRUTTI SHIVAJI PATIL",
    rcManufacturer:     "EICHER MOTORS LTD",
    rcMakerModel:       "EICHER PRO 6019 HSD",
    rcVehicleClass:     "HGV",
    rcFuelType:         "DIESEL",
    rcChassisNumber:    "MC2ERDCC0KL189012",
    rcEngineNumber:     "E446CDLL189012",
    rcColor:            "RED",
    rcRegistrationDate: "2019-09-15",
    rcMvTaxUpto:        "2024-09-14",
    rcInsuranceUpto:    "2026-09-14",
    rcFitnessUpto:      "2026-09-14",
    rcPucUpto:          "2026-03-14",
  },
  {
    caseId: "fraudcheck_sanjay",
    dlNumber: "MH3120090006204",
    dob: "03-02-1979",
    name: "SANJAY PANDA",
    fatherName: "BIJAYA PANDA",
    gender: "M",
    state: "Maharashtra",
    rto: "RTO NAGPUR (RURAL)",
    address: "AT POST KAMPTEE, NAGPUR, MAHARASHTRA",
    ntFrom: "14-09-2009", ntTo: "13-09-2029",
    trFrom: "14-09-2014", trTo: "13-09-2024",
    dateOfIssue: "14-09-2009",
    cov: ["LMV", "HMV"],
    rcNumber:           "MH40GH3456",
    rcOwnerName:        "SANJAY PANDA",
    rcManufacturer:     "MAHINDRA & MAHINDRA LTD",
    rcMakerModel:       "MAHINDRA BLAZO X 35 8X4",
    rcVehicleClass:     "HGV",
    rcFuelType:         "DIESEL",
    rcChassisNumber:    "MA1AC2DLL12345678",
    rcEngineNumber:     "JE6F123456",
    rcColor:            "YELLOW",
    rcRegistrationDate: "2020-11-22",
    rcMvTaxUpto:        "2026-11-21",
    rcInsuranceUpto:    "2026-11-21",
    rcFitnessUpto:      "2027-11-21",
    rcPucUpto:          "2026-05-21",
  },
];

function ddmmyyyyToIso(s: string): string {
  const [d, m, y] = s.split("-");
  return d && m && y ? `${y}-${m}-${d}` : s;
}

function toIdfyDlRaw(d: StaticDriver): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    action: "verify_with_source",
    completed_at: now,
    created_at:   now,
    group_id:     `static-grp-${d.caseId}`,
    request_id:   `static-req-${d.caseId}`,
    result: {
      source_output: {
        address:                d.address,
        badge_details:          null,
        card_serial_no:         null,
        city:                   null,
        cov_details:            d.cov.map((c) => ({ cov: c, issue_date: d.dateOfIssue })),
        date_of_issue:          d.dateOfIssue,
        date_of_last_transaction: null,
        dl_status:              "ACTIVE",
        dob:                    ddmmyyyyToIso(d.dob),
        face_image:             null,
        gender:                 d.gender,
        hazardous_valid_till:   null,
        hill_valid_till:        null,
        id_number:              d.dlNumber,
        is_minor:               false,
        issuing_rto_name:       d.rto,
        last_transacted_at:     null,
        name:                   d.name,
        nt_validity_from:       d.ntFrom,
        nt_validity_to:         d.ntTo,
        profile_image:          null,
        relatives_name:         d.fatherName,
        source:                 "SARATHI",
        state:                  d.state,
        status:                 "id_found",
        t_validity_from:        d.trFrom,
        t_validity_to:          d.trTo,
      },
    },
    status: "completed",
    task_id: `static-task-${d.caseId}`,
    type:    "ind_driving_license",
  };
}

const STATIC_DL_RAW_BY_CASE_ID: Record<string, Record<string, unknown>> = Object.fromEntries(
  DRIVERS.map((d) => [d.caseId, toIdfyDlRaw(d)]),
);

export function lookupStaticDlRaw(dlNumber: string): Record<string, unknown> | null {
  const caseId = lookupStaticCaseId(dlNumber);
  return caseId ? STATIC_DL_RAW_BY_CASE_ID[caseId] ?? null : null;
}

// ── Static IDfy-shape RC responses, keyed by registration number ─────────────

function toIdfyRcRaw(d: StaticDriver): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    action: "verify_with_source",
    completed_at: now,
    created_at:   now,
    group_id:     `static-grp-rc-${d.caseId}`,
    request_id:   `static-req-rc-${d.caseId}`,
    result: {
      extraction_output: {
        avg_gross_vehicle_weight: null,
        axle_configuration:       null,
        chassis_number:           d.rcChassisNumber,
        color:                    d.rcColor,
        emission_norms:           null,
        engine_number:            d.rcEngineNumber,
        fitness_upto:             d.rcFitnessUpto,
        fuel_type:                d.rcFuelType,
        insurance_details:        null,
        insurance_validity:       d.rcInsuranceUpto,
        maker_model:              d.rcMakerModel,
        manufacturer:             d.rcManufacturer,
        mv_tax_upto:              d.rcMvTaxUpto,
        owner_name:               d.rcOwnerName,
        owner_number:             "",
        permit_issue_date:        null,
        permit_number:            null,
        permit_type:              null,
        permit_validity:          null,
        puc_number_upto:          d.rcPucUpto,
        registration_date:        d.rcRegistrationDate,
        registration_number:      d.rcNumber,
        rto_name:                 null,
        status:                   "id_found",
        unladen_weight:           null,
        vehicle_class:            d.rcVehicleClass,
        vehicle_financier:        null,
      },
    },
    status: "completed",
    task_id: `static-task-rc-${d.caseId}`,
    type:    "ind_rc_basic",
  };
}

const STATIC_RC_RAW_BY_NUMBER: Record<string, Record<string, unknown>> = Object.fromEntries(
  DRIVERS.map((d) => [d.rcNumber, toIdfyRcRaw(d)]),
);

export function lookupStaticRcRaw(rcNumber: string): Record<string, unknown> | null {
  const norm = normaliseDl(rcNumber); // same normalisation: uppercase + strip spaces/hyphens
  return STATIC_RC_RAW_BY_NUMBER[rcNumber]
      ?? STATIC_RC_RAW_BY_NUMBER[norm]
      ?? null;
}
