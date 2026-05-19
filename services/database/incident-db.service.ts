import { Pool } from 'pg';
import { Incident } from '@/types';

const pool = new Pool({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export async function saveIncidentsToDB(
  incidents: Incident[]
) {
  if (!incidents.length) return;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const incident of incidents) {
      await client.query(
        `
        INSERT INTO incidents (
          id,
          title,
          category,
          severity,
          status,
          incident_datetime,
          summary,
          traffic_impact,
          raw_data,
          created_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()
        )
        ON CONFLICT (id)
        DO NOTHING
        `,
        [
          incident.id,
          incident.title,
          incident.category,
          incident.severity,
          incident.status,
          incident.incidentDateTime,
          incident.summary,
          incident.trafficImpact,
          JSON.stringify(incident),
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');

    console.error(
      'Incident save failed:',
      err
    );
  } finally {
    client.release();
  }
}