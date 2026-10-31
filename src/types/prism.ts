export interface Context {
  m: number; // soil moisture %
  T: number; // air temp C
  RH: number; // relative humidity %
  rain24h_mm?: number;
  rain_prob?: number; // %
  batt?: number; // voltage V
  data_age_min?: number;
  forecast_fresh?: boolean;
  already_irrigated_min_today?: number;
  now?: Date;
  soil_temp?: number | null;
  ph?: number | null;
  valid?: boolean;
}

export type ActionType = 'IRRIGATE' | 'NO_IRRIGATION' | 'HOLD';
export type PriorityType = 'URGENT' | 'NORMAL';
export type ConfidenceType = 'High' | 'Medium' | 'Low';

export interface Decision {
  action: ActionType;
  minutes: number;
  window: string;
  confidence: ConfidenceType;
  priority: PriorityType;
  reason: string;
  warnings: string[];
  trace: string[];
  valve_allowed: boolean;
}

export interface Advisory {
  node_id?: string;
  action: ActionType;
  duration_min: number;
  timing_window: string;
  confidence: ConfidenceType;
  justification: string;
  warnings: string[];
  trace: string[];
  valve_allowed: boolean;
  issued?: string;
  latency_s?: number;
  source?: 'template' | 'llm';
}

export interface Reading {
  id?: string;
  node_id: string;
  ts: string;
  soil_moisture_pct: number;
  soil_temp_c?: number | null;
  air_temp_c: number;
  rh_pct: number;
  soil_ph?: number | null;
  battery_v: number;
  buffered?: boolean;
}

export interface NodeState {
  id: string;
  name: string;
  crop: string;
  zone: string;
  status: 'online' | 'buffered' | 'offline';
  reading: Reading;
  advisory: Advisory;
  alreadyIrrigatedToday: number;
  rainForecast: {
    rain24h_mm: number;
    rain_prob: number;
    fetched: number;
  };
  valveOpen: boolean;
  valveCountdownSeconds: number;
}

export interface SimulationStep {
  step: number;
  timeStr: string;
  day: number;
  hour: number;
  minute: number;
  T: number;
  RH: number;
  rain_mm: number;
  m_manual: number;
  m_prism: number;
  irrigating_manual: boolean;
  irrigating_prism: boolean;
  water_applied_step_prism: number;
  water_applied_step_manual: number;
  et_loss_mm: number;
}

export interface SimulationResult {
  water_min: number;
  time_in_band_pct: number;
  median_latency_s?: number;
  total_water_liters: number;
  cycles: number;
}

export interface SimulationRunOutput {
  manual: SimulationResult;
  prism: SimulationResult;
  saving_pct: number;
  in_band_pass: boolean;
  water_saving_pass: boolean;
  steps: SimulationStep[];
}

export interface UnitTestResult {
  name: string;
  description: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
  durationMs: number;
}
