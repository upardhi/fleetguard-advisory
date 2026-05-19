
import { db } from '@/app/_server/db/client';
import { uuidv7 } from '@/app/_server/db/uuidv7';
import { Incident } from '@/types';

export async function saveTrafficNews(
  incidents: Incident[]
): Promise<void> {
  if (!incidents.length) return;

  try {
    await Promise.all(
      incidents.map(async (incident) => {
        await db`
  INSERT INTO traffic_news (
    id,
    title,
    category,
    severity,
    status,
    incident_datetime,
    summary,
    traffic_impact,
    travel_advisory,
    city,
    state,
    affected_routes,
    affected_areas,
    source_urls,
    raw_data,
    created_at
  )
  VALUES (
    ${incident.id ?? uuidv7()},
    ${incident.title ?? null},
    ${incident.category ?? null},
    ${incident.severity ?? null},
    ${incident.status ?? null},
    ${incident.incidentDateTime ?? null},
    ${incident.summary ?? null},
    ${incident.trafficImpact ?? null},
    ${incident.travelAdvisory ?? null},

    ${incident.location?.city ?? null},
    ${incident.location?.state ?? null},

    ${db.json(
          JSON.parse(
            JSON.stringify(
              incident.affectedRoutes ?? []
            )
          )
        )},

    ${db.json(
          JSON.parse(
            JSON.stringify(
              incident.location?.area ?? []
            )
          )
        )},

    ${db.json(
          JSON.parse(
            JSON.stringify(
              incident.sources?.map((s) => s.url) ?? []
            )
          )
        )},

    ${db.json(
          JSON.parse(JSON.stringify(incident))
        )},

    NOW()
  )

  ON CONFLICT (id)
  DO NOTHING
`;
      })
    );
  } catch (err) {
    console.error(
      'Traffic news save failed:',
      err
    );
  }
}