/**
 * Standardized API response utilities
 */

/**
 * Standard response shape for all API endpoints
 */
export interface BaseApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    statusCode: number;
}

/**
 * Creates a success response with standard format
 */
export function successResponse<T = unknown>(data: T, message?: string): Response {
    const responseBody: BaseApiResponse<T> = {
        success: true,
        data,
        message,
        statusCode: 200
    };

    return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

/**
 * Creates an error response with standard format
 */
export function errorResponse(error: string | Error, statusCode = 500, message?: string): Response {
    const errorMessage = error instanceof Error ? error.message : error;

    const responseBody: BaseApiResponse = {
        success: false,
        error: errorMessage,
        message: message || 'An error occurred',
        statusCode
    };

    return new Response(JSON.stringify(responseBody), {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}