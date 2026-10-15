export type ToolKey = "production" | "irrigation" | "leaf" | "price" | "crop";

export interface GuideField {
  key: string;
  name: string;
  required: boolean;
  unit?: string | null;
  example?: string;
  where?: string;
  skip?: string;
}
export interface Guide {
  tool: ToolKey;
  available: boolean;
  question: string;
  output: string;
  time: string;
  accuracy?: string;
  fields: GuideField[];
  example?: Record<string, any>;
  supported_plants?: string[];
  supported_crops?: string[];
  photo_tips?: string[];
}

export interface Page<T> { items: T[]; total: number; page: number; page_size: number }

export interface User { id: number; username: string | null; is_guest: boolean; created_at: string }
export interface Profile {
  display_name: string | null; state: string | null; district: string | null; farm_area_ha: number | null;
  soil_type: string | null; area_unit: "ha" | "acre"; weight_unit: "kg" | "quintal"; common_crops: string[];
}

export interface Assumed { field: string; label: string; value: number | string }

export interface ProductionResult {
  state: string; district: string; season: string; crop: string; area: number; yield_per_ha: number;
  production: number; note: string | null; unit_note: string; accuracy_note: string; context: string;
  area_input: { value: number; unit: "ha" | "acre" }; saved_id: number | null;
}
export interface ProductionEstimate {
  id: number; state: string; district: string; season: string; crop: string; crop_year: number; area_ha: number;
  yield_t_per_ha: number; production_t: number; note: string | null; created_at: string;
}
export interface ProductionRecord {
  id: number; crop: string; season: string; crop_year: number; area_ha: number; state: string | null;
  district: string | null; sowing_date: string | null; harvest_date: string | null;
  actual_production_t: number | null; estimated_production_t: number | null; notes: string | null;
  created_at: string; updated_at: string;
}

export interface IrrigationResult {
  need: "Low" | "Medium" | "High"; advice: string; warnings: string[]; assumed: Assumed[];
  used: Record<string, string | number>; soil_moisture_pct: number; soil_moisture_source: "description" | "meter";
  accuracy_note: string; saved_id: number | null;
}
export interface IrrigationRecord {
  id: number; crop: string; growth_stage: string; season: string; soil_moisture_pct: number;
  soil_moisture_source: string; need: "Low" | "Medium" | "High"; advice: string; assumed: Assumed[];
  warnings: string[]; inputs: Record<string, any>; created_at: string;
}

export interface LeafGuess { plant: string; condition: string; is_healthy: boolean; raw_class: string; confidence: number }
export interface LeafResult extends LeafGuess {
  low_confidence: boolean; top: LeafGuess[]; note: string; advice: string; kvk?: string; saved_id: number | null;
}
export interface LeafRecord extends LeafGuess { id: number; top: LeafGuess[]; thumbnail: string | null; created_at: string }

export interface PriceResult {
  state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  price_per_quintal: number; price_per_kg: number; range_low: number; range_high: number; warnings: string[];
  accuracy_note: string; label: string; saved_id: number | null;
}
export interface PriceRecord {
  id: number; state: string; district: string; market: string; commodity: string; variety: string; grade: string;
  price_per_quintal: number; range_low: number; range_high: number; warnings: string[]; created_at: string;
}
export interface PriceSnapshot {
  commodity: string; records: number; label: string; unit?: string;
  rows: { state: string; district: string; market: string; variety: string; grade: string; min: number; max: number; modal: number }[];
  summary: { lowest: number; average: number; highest: number } | null;
}

export interface CropResult {
  crop: string; confidence: number; top: { crop: string; match: number }[]; warnings: string[];
  inputs: Record<string, number>; assumed: Assumed[]; accuracy_note: string; low_confidence: boolean;
  rainfall_preset?: string; saved_id: number | null;
}
export interface CropRecord {
  id: number; crop: string; confidence: number; top: { crop: string; match: number }[]; inputs: Record<string, number>;
  assumed: Assumed[]; warnings: string[]; created_at: string;
}

export interface Activity { id: number; kind: string; title: string; detail: string | null; link: string | null; created_at: string }

export interface ModelStatus { label: string; state: "pending" | "loading" | "ready" | "missing" | "error"; error: string | null }
export interface Health {
  status: string; database: { backend: "mysql" | "sqlite"; connected: boolean };
  models: Record<"production" | "irrigation" | "price" | "crop" | "leaf" | "chatbot", ModelStatus>;
  assistant: string;
}

export interface ToolUsed { name: string; label: string; link: string | null }
export interface ChatReply { reply: string; conversation_id: string; tools_used: ToolUsed[]; stored: boolean }
