export type CueStatus = 'spotted' | 'printed' | 'approved' | 'recorded' | 'transferred' | 'cut' | 'premixed' | 'final mixed';
export type CuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type ConnectionMode = 'online' | 'offline' | 'syncing';

export interface Character {
  id: string;
  name: string;
  created_at: string;
}

export interface Cue {
  id: string;
  reel: string;
  scene: string;
  cue_name: string;
  start_time: string;
  end_time: string;
  dialog: string;
  character_id: string;
  character_name: string;
  notes: string;
  status: CueStatus;
  priority: CuePriority;
  created_at: string;
  updated_at: string;
}

export interface CueResponse extends Cue {
  merged?: boolean;
  mergedFields?: string[];
}

export interface EditorEntry {
  userName: string;
  clientId: string;
  startedAt?: number;
}

export type SSEEventType =
  | 'editing-start'
  | 'editing-stop'
  | 'connection-status'
  | 'sync-progress'
  | 'sync-complete'
  | 'updated'
  | 'created'
  | 'deleted';

export interface SSEEvent {
  type: SSEEventType;
  entity?: 'character' | 'cue';
  id?: string;
  cueId?: string;
  userName?: string;
  originClientId?: string;
  online?: boolean;
  mode?: ConnectionMode;
}

export interface ConflictResponse {
  error: 'conflict';
  serverCue: Cue;
  conflictingFields?: string[];
}

export interface HealthResponse {
  status: string;
  mode?: ConnectionMode;
}