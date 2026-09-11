// API types — mirror of backend Pydantic schemas (the API is the source of truth)

export type Role = "admin" | "worker";

// Slug of an empresa, or "todas" — only meaningful for a create-user payload
// or as the value of the header filter for an admin with access to both.
export type EmpresaSlug = "nido" | "fega";

export interface Empresa {
  id: string;
  nombre: string;
  slug: EmpresaSlug;
}

export interface PendientesResumen {
  trabajadores: number;
  obras: number;
}

// Suggested trades (mirror of backend TRADES). Stored as a free string.
export const TRADES = [
  "Albañil",
  "Fontanero",
  "Electricista",
  "Pintor",
  "Carpintero",
  "Encargado",
  "Peón",
  "Ferrallista",
  "Soldador",
  "Yesero/Escayolista",
  "Otros",
];

export interface User {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  trade: string | null;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  // null = sin asignar (solo posible para role="worker")
  empresa_id: string | null;
  acceso_todas_empresas: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  user: User;
}

export interface Obra {
  id: string;
  name: string;
  client_name: string | null;
  address: string | null;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
  archived_at: string | null;
  // Empresa slugs this obra is assigned to; [] = sin asignar
  empresas: EmpresaSlug[];
}

export interface ObraDetail extends Obra {
  photo_count: number;
  video_count: number;
  total_hours: string;
}

export interface WorkEntry {
  id: string;
  obra_id: string;
  user_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  edited_by_admin: boolean;
  validated: boolean;
  user_full_name: string | null;
  obra_name: string | null;
}

export interface EntriesList {
  items: WorkEntry[];
  count: number;
  total_hours: string;
}

export interface MediaItem {
  id: string;
  obra_id: string;
  user_id: string;
  user_full_name: string | null;
  obra_name: string | null;
  work_entry_id: string | null;
  kind: "photo" | "video";
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  taken_at: string | null;
  uploaded_at: string;
  caption: string | null;
  file_url: string;
  thumb_url: string | null;
}

export interface MediaList {
  items: MediaItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserWithTempPassword extends User {
  temp_password: string | null;
}

export interface HorasRow {
  obra_id: string;
  obra_name: string;
  user_id: string;
  user_full_name: string;
  trade: string | null;
  total_hours: string;
  entry_count: number;
}

export interface TradeHoursRow {
  trade: string | null;
  total_hours: string;
}

export interface HorasEntryRow {
  id: string;
  obra_id: string;
  obra_name: string;
  user_id: string;
  user_full_name: string;
  trade: string | null;
  work_date: string;
  hours: string;
  notes: string | null;
  validated: boolean;
  edited_by_admin: boolean;
  media_count: number;
}

export interface HorasReport {
  rows: HorasRow[];
  entries: HorasEntryRow[];
  by_trade: TradeHoursRow[];
  total_hours: string;
  total_entries: number;
}

export interface BlockedDay {
  id: string;
  user_id: string;
  blocked_date: string;
  note: string | null;
  created_at: string;
  user_full_name: string | null;
}

export interface WorkerHoursRow {
  user_id: string;
  user_full_name: string;
  trade: string | null;
  total_hours: string;
  entry_count: number;
}

export interface ObraResumen {
  obra_id: string;
  obra_name: string;
  workers: WorkerHoursRow[];
  by_trade: TradeHoursRow[];
  total_hours: string;
  photo_count: number;
  video_count: number;
  first_entry_date: string | null;
  last_entry_date: string | null;
}
