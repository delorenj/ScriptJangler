export enum AgentRole {
  DIRECTOR = 'DIRECTOR',
  CONTINUITY_QA = 'CONTINUITY_QA',
  STAGE_HAND = 'STAGE_HAND',
  GENERATOR = 'GENERATOR',
  PARSER = 'PARSER'
}

export enum SceneStatus {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  PREPARING_ASSETS = 'PREPARING_ASSETS',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface ScriptScene {
  id: number;
  title: string;
  visualPrompt: string; // The core prompt for Veo
  narrativeContext: string; // Context for the QA agent
  imageUrl?: string; // Optional URL parsed from script
  imageBase64?: string; // The raw data for Veo (fetched from URL or generated)
  status: SceneStatus;
  videoUri?: string;
  videoHandle?: any; // To store the opaque handle for extensions
  feedback?: string;
  isExtension?: boolean;
}

export interface AgentLog {
  id: string;
  timestamp: Date;
  role: AgentRole;
  message: string;
  metadata?: Record<string, any>;
  status: 'info' | 'success' | 'warning' | 'error' | 'thinking';
}

export interface GenerationConfig {
  resolution: '720p' | '1080p';
  aspectRatio: '16:9' | '9:16';
}