export enum AppState {
  IDLE = 'IDLE',
  LOADING_STL = 'LOADING_STL',
  READY_TO_CONVERT = 'READY_TO_CONVERT',
  ANALYZING = 'ANALYZING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR'
}

export interface GeometryData {
  url: string;
  filename: string;
}

export interface GenerationResult {
  code: string;
  explanation: string;
}