export const INCIDENT_EXTRACTION_PROMPT = `
Extract travel disruption intelligence.

Return JSON only.

Fields:
- title
- category
- severity
- status
- eventDate
- endDate
- affectedAreas
- affectedRoutes
- trafficImpact
- travelAdvisory
- eventReason
- confidence
`;