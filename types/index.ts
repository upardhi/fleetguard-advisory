export type IncidentStatus = 'ACTIVE' | 'PAST' | 'UPCOMING';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type SourceType = 'news' | 'rss' | 'government' | 'social' | 'traffic' | 'railway' | 'unknown';

export type IncidentCategory =
  | 'flood'
  | 'heavy_rain'
  | 'waterlogging'
  | 'protest'
  | 'morcha'
  | 'bandh'
  | 'farmer_protest'
  | 'strike'
  | 'riot'
  | 'curfew'
  | 'fire'
  | 'accident'
  | 'traffic_jam'
  | 'road_block'
  | 'highway_blockage'
  | 'train_delay'
  | 'metro_disruption'
  | 'internet_shutdown'
  | 'landslide'
  | 'cyclone'
  | 'public_emergency'
  | 'rally'
  | 'vip_movement'
  | 'public_gathering'
  | 'religious_procession'
  | 'festival_crowd'
  | 'election_rally'
  | 'transport_disruption'
  | 'other';

export interface IncidentLocation {
  area: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface IncidentSource {
  url: string;
  type: SourceType;
  publishedAt: string | null;
  title?: string;
}

export interface IncidentMedia {
  images: string[];
  videos: string[];
}

export interface Incident {
  id: string;
  title: string;
  category: IncidentCategory;
  status: IncidentStatus;
  summary: string;
  severity: SeverityLevel;
  incidentDateTime: string | null;
  eventDateText?: string | null;
  location: IncidentLocation;
  affectedRoutes: string[];
  affectedAreas?: string[];
  trafficImpact: string | null;
  travelAdvisory?: string | null;
  confidence?: number;
  media: IncidentMedia;
  sources: IncidentSource[];
  rawText?: string;
}

export interface IncidentSearchRequest {
  location: string;
  radiusKm?: number;
  pastHours?: number;
  futureHours?: number;
  categories?: IncidentCategory[];
}

export interface IncidentSearchResponse {
  success: boolean;
  totalIncidents: number;
  generatedAt: string;
  location: string;
  timeWindow: {
    pastHours: number;
    futureHours: number;
  };
  incidents: Incident[];
  error?: string;
  queryCount?: number;
  sourceCount?: number;
}

export interface SearchQuery {
  query: string;
  type: 'past' | 'future';
  category?: IncidentCategory;
}

export interface RSSItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  content?: string;
}

export interface ScrapedContent {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  images: string[];
  sourceType: SourceType;
}

export interface FilterState {
  category: IncidentCategory | 'all';
  severity: SeverityLevel | 'all';
  status: IncidentStatus | 'all';
  state: string;
  dateFrom: string;
  dateTo: string;
}
