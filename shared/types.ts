export type CueStatus = 'spotted' | 'printed' | 'approved' | 'recorded' | 'transferred' | 'cut' | 'premixed' | 'final mixed';
export type CuePriority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';
export type ConnectionMode = 'online' | 'offline' | 'syncing';

export interface Cue {
  id: string;
  cue_name: string;
  dialog: string;
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
  entity?: 'cue';
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