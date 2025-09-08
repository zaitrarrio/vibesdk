/**
 * Type definitions for Stats Controller responses
 */

import { EnhancedUserStats, UserActivity } from '../../../database/types';

/**
 * Response data for getUserStats - uses EnhancedUserStats directly
 */
export type UserStatsData = EnhancedUserStats;

/**
 * Response data for getUserActivity
 */
export interface UserActivityData {
    activities: UserActivity[];
}