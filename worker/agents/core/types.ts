
import type { RuntimeError, StaticAnalysisResponse } from '../../services/sandbox/sandboxTypes';
import type { ClientReportedErrorType, FileOutputType } from '../schemas';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';
import type { TemplateDetails } from '../../services/sandbox/sandboxTypes';

export interface AgentInitArgs {
    query: string;
    language?: string;
    frameworks?: string[];
    hostname: string;
    inferenceContext: InferenceContext;
    onTemplateGenerated: (templateDetails: TemplateDetails) => void;
    onBlueprintChunk: (chunk: string) => void;
}

export interface AllIssues {
    runtimeErrors: RuntimeError[];
    staticAnalysis: StaticAnalysisResponse;
    clientErrors: ClientReportedErrorType[];
}

/**
 * Agent state definition for code generation
 */
export interface ScreenshotData {
    url: string;
    timestamp: number;
    viewport: { width: number; height: number };
    userAgent?: string;
    screenshot?: string; // Base64 data URL from Cloudflare Browser Rendering REST API
}

export interface AgentSummary {
    query: string;
    generatedCode: FileOutputType[];
    conversation: ConversationMessage[];
}