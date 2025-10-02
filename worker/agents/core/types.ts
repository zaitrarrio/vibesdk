
import type { RuntimeError, StaticAnalysisResponse } from '../../services/sandbox/sandbox-types';
import type { ClientReportedErrorType, FileOutputType, PhaseConceptType } from '../schemas';
import type { ConversationMessage } from '../inferutils/common';
import type { InferenceContext } from '../inferutils/config.types';
import type { TemplateDetails } from '../../services/sandbox/sandbox-types';
import { TemplateSelection } from '../schemas';
import { CurrentDevState } from './state';

export interface AgentInitArgs {
    query: string;
    language?: string;
    frameworks?: string[];
    hostname: string;
    inferenceContext: InferenceContext;
    templateInfo: {
        templateDetails: TemplateDetails;
        selection: TemplateSelection;
    }
    sandboxSessionId: string
    onBlueprintChunk: (chunk: string) => void;
    // writer: WritableStreamDefaultWriter<{chunk: string}>;
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

export interface PhaseExecutionResult {
    currentDevState: CurrentDevState;
    staticAnalysis?: StaticAnalysisResponse;
    result?: PhaseConceptType;
    userSuggestions?: string[];
}