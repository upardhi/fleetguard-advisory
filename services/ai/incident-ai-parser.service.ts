import { openai } from './openai.service';
import { INCIDENT_EXTRACTION_PROMPT } from './prompts/incident-extraction.prompt';
import { IncidentSchema } from '@/schemas/incident.schema';


function normalizeAIResponse(data: any) {

    const severityMap: Record<string, string> = {
        critical: 'CRITICAL',
        high: 'HIGH',
        medium: 'MEDIUM',
        low: 'LOW',
        unknown: 'UNKNOWN',
    };

    const statusMap: Record<string, string> = {
        active: 'ACTIVE',
        past: 'PAST',
        upcoming: 'UPCOMING',
    };

    const categoryMap: Record<string, string> = {
        'traffic advisory': 'traffic_jam',
        'traffic restriction': 'traffic_jam',
        'traffic jam': 'traffic_jam',
        'road closure': 'road_block',
        'road block': 'road_block',
        protest: 'protest',
        morcha: 'morcha',
        bandh: 'bandh',
        rally: 'rally',
        strike: 'strike',
        'vip movement': 'vip_movement',
        'religious procession': 'religious_procession',
        'festival crowd': 'festival_crowd',
        'metro disruption': 'metro_disruption',
        'train delay': 'train_delay',
        accident: 'accident',
        flood: 'flood',
        fire: 'fire',
    };

    // normalize severity
    const severity =
        severityMap[
        String(data.severity || '')
            .trim()
            .toLowerCase()
        ] || 'UNKNOWN';

    // normalize status
    const status =
        statusMap[
        String(data.status || '')
            .trim()
            .toLowerCase()
        ] || 'UPCOMING';

    // normalize category
    const category =
        categoryMap[
        String(data.category || '')
            .trim()
            .toLowerCase()
        ] || 'other';

    // normalize confidence
    let confidence = 0.5;

    if (typeof data.confidence === 'number') {
        confidence = data.confidence;
    }

    if (typeof data.confidence === 'string') {

        const val = data.confidence.toLowerCase();

        if (val.includes('high')) confidence = 0.9;
        else if (val.includes('medium')) confidence = 0.6;
        else if (val.includes('low')) confidence = 0.3;
    }

    if (Number.isNaN(confidence)) {
        confidence = 0.5;
    }

    return {
        ...data,
        severity,
        status,
        category,
        confidence,
    };
}

export async function extractIncidentWithAI(content: string) {
    const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },

        messages: [
            {
                role: 'system',
                content: INCIDENT_EXTRACTION_PROMPT.replace(
                    '{{CURRENT_DATE}}',
                    new Date().toISOString()
                ),
            },
            {
                role: 'user',
                content: content.slice(0, 5000),
            },
        ],
    });

    const raw = completion.choices[0].message.content;

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    const normalized = normalizeAIResponse(parsed);

    return IncidentSchema.parse(normalized);
}