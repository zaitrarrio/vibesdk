import { RateLimitType } from "./config";

export class RateLimitExceededError extends Error {
    constructor(
        message: string,
        public limitType: RateLimitType,
        public limit?: number,
        public period?: number
    ) {
        super(message);
        this.name = 'RateLimitExceededError';
    }
}

export interface RateLimitError {
	message: string;
	limitType: RateLimitType;
	retryAfter?: number; // seconds
	limit?: number;
	period?: number; // seconds
	suggestions?: string[];
}

export interface RateLimitErrorResponse {
	error: string;
	type: 'RATE_LIMIT_EXCEEDED';
	details: RateLimitError;
}

export function createRateLimitErrorResponse(
	limitType: RateLimitError['limitType'],
	message: string,
	limit?: number,
	period?: number,
	retryAfter?: number
): RateLimitErrorResponse {
	const suggestions: string[] = [];
	
	if (limitType === RateLimitType.LLM_CALLS) {
		suggestions.push('You have reached maximum allowed LLM calls in an hour. Please wait and try again later.');
	} else {
		suggestions.push('Try again in an hour when the limit resets');
	}

	return {
		error: message,
		type: 'RATE_LIMIT_EXCEEDED',
		details: {
			message,
			limitType,
			retryAfter,
			limit,
			period,
			suggestions
		}
	};
}