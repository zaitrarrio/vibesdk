import { RateLimitType } from "./config";
export interface RateLimitError {
	message: string;
	limitType: RateLimitType;
	limit?: number;
	period?: number; // seconds
	suggestions?: string[];
}
export class RateLimitExceededError extends Error {
    public details: RateLimitError;
    constructor(
        message: string,
        public limitType: RateLimitType,
        public limit?: number,
        public period?: number,
        public suggestions?: string[]
    ) {
        super(message);
        this.name = 'RateLimitExceededError';
        this.details = {
            message,
            limitType,
            limit,
            period,
            suggestions
        };
    }
}

export interface RateLimitErrorResponse {
	error: string;
	type: 'rate_limit_error';
	details: RateLimitError;
}

export function createRateLimitErrorResponse(
    error: RateLimitExceededError
): RateLimitErrorResponse {
	const suggestions: string[] = [];
	
	if (error.limitType === RateLimitType.LLM_CALLS) {
		suggestions.push('You have reached maximum allowed LLM calls in an hour. Please wait and try again later.');
	} else {
		suggestions.push('Try again in an hour when the limit resets');
	}

	return {
		error: error.message,
		type: 'rate_limit_error',
		details: error.details
	};
}