import { openai } from './openai.service';
import { INCIDENT_EXTRACTION_PROMPT } from './prompts/incident-extraction.prompt';
import { IncidentSchema } from '@/schemas/incident.schema';

export async function extractIncidentWithAI(content: string) {
    const completion = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        response_format: { type: 'json_object' },

        messages: [
            {
                role: 'system',
                content: INCIDENT_EXTRACTION_PROMPT,
            },
            {
                role: 'user',
                content: content.slice(0, 4000),
            },
        ],
    });

    const raw = completion.choices[0].message.content;

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return IncidentSchema.parse(parsed);
}