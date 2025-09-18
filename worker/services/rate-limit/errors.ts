import { SecurityError, SecurityErrorType } from "../../types/security";
import { RateLimitType } from "./config";
export interface RateLimitError {
	message: string;
	limitType: RateLimitType;
	limit?: number;
	period?: number; // seconds
	suggestions?: string[];
}
export class RateLimitExceededError extends SecurityError {
    public details: RateLimitError;
    constructor(
        message: string,
        public limitType: RateLimitType,
        public limit?: number,
        public period?: number,
        public suggestions?: string[]
    ) {
        super(SecurityErrorType.RATE_LIMITED, message, 429);
        this.name = 'RateLimitExceededError';
        this.details = {
            message,
            limitType,
            limit,
            period,
            suggestions
        };
    }

    static fromRateLimitError(error: RateLimitError): RateLimitExceededError {
        return new RateLimitExceededError(
            error.message,
            error.limitType,
            error.limit,
            error.period,
            error.suggestions
        );
    }
}