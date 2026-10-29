export interface User {
  id: number;
  login: string;
  full_name: string;
  roles: string[];
  tribe_id: number | null;
  tribe_name: string | null;
}

export type Role = 'customer' | 'pool_manager';

export interface Dictionaries {
  roles: string[];
  levels: string[];
  skills: string[];
  cities: string[];
  vendors: { id: number; name: string; inn: string }[];
  products: { id: number; name: string; tribe_id: number; tribe_name: string }[];
  creators: { id: number; full_name: string }[];
  candidateStatuses: Record<string, string>;
  uvbStatuses: Record<string, string>;
  needStatuses: Record<string, string>;
  routeStatuses: Record<string, string>;
  cases: Record<string, { title: string; action: string; banner: string; scenario: string }>;
  scenarios: Record<string, string>;
  features: { llm: boolean; backlogProvider: string; maxUploadMb: number; ephemeral: boolean };
}

export interface Review { author: string; text: string; score?: number | null; date?: string }

export interface Relevance {
  score: number;
  role: boolean;
  level: 'exact' | 'near' | 'other' | 'any';
  skillsMatched: string[];
  skillsMissing: string[];
  availability: 'full' | 'partial' | 'none' | 'unknown';
  coverage: number;
}

export interface Candidate {
  id: number;
  status: string;
  full_name: string;
  age: number | null;
  role: string | null;
  level: string | null;
  skills: string[];
  rating: number | null;
  available_from: string | null;
  available_to: string | null;
  total_experience: number | null;
  uvb_status: string;
  city: string | null;
  rate: number | null;
  sber_experience: string | null;
  resume_experience: string | null;
  reviews: Review[];
  vendor_id: number | null;
  vendor_name: string | null;
  created_by_name?: string;
  has_resume?: boolean;
  relevance?: Relevance;
  engagement?: { case: number; title: string; action: string; banner: string } | null;
}

export interface SupplyOption {
  key: string;
  case: number;
  kind: 'candidate' | 'vendor_request' | 'new_contract';
  title: string;
  action: 'recommend' | 'procurement' | 'vendor';
  banner: string;
  scenario: string;
  candidate?: Candidate;
  contract?: { id: number; number: string; vendorId: number; vendorName: string; start: string; end: string };
  limit?: { id: number; owner: 'own' | 'other' | 'reserve'; tribeName: string | null; remaining: number };
  relevance: Relevance | null;
  rate: number | null;
  estimatedCost: number | null;
  startDate: string | null;
  leadTimeDays: number;
}

export interface RouteStep { step: string; status: 'pending' | 'active' | 'done' | 'failed'; system: string; title: string }

export interface Position {
  id: number;
  role: string;
  level: string | null;
  quantity: number;
  skills: string[];
  start_date: string | null;
  end_date: string | null;
  interview_required: boolean;
  option_case: number | null;
  candidate_id: number | null;
  route_scenario: string | null;
  route_status: string;
  route_status_name: string;
  route_steps: RouteStep[];
}

export interface Need {
  id: number;
  status: string;
  initiator_id: number;
  initiator_name: string;
  tribe_name: string | null;
  product: string;
  backlog_key: string | null;
  backlog_url: string | null;
  requirements_summary: string | null;
  scenario: string | null;
  parent_need_id: number | null;
  source: string;
  created_at: string;
  positions: Position[];
}

export interface WizardPosition extends Position {
  selected: SupplyOption | null;
  options: SupplyOption[];
  optionsTotal: number;
}

export interface Wizard {
  need: Omit<Need, 'positions'>;
  positions: WizardPosition[];
  scenarios: Record<string, string>;
  totalCost: number;
  events: { id: number; system: string; systemName: string; direction: 'in' | 'out'; payload: any; created_at: string; entity: string; entity_id: number }[];
}
