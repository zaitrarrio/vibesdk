/**
 * Session Service for managing user sessions in D1
 * Provides session creation, validation, and cleanup
 */

import { AuthSession } from '../../types/auth-types';
import { SecurityError, SecurityErrorType } from '../../types/security';
import { DatabaseService } from '../database';
import * as schema from '../schema';
import { eq, and, lt, gt, desc, ne } from 'drizzle-orm';
import { createLogger } from '../../logger';
import { generateId } from '../../utils/idGenerator';
import { JWTUtils } from '../../utils/jwtUtils';
import { extractRequestMetadata } from '../../utils/authUtils';
import { BaseService } from './BaseService';

const logger = createLogger('SessionService');

/**
 * Session configuration
 */
interface SessionConfig {
    maxSessions: number; // Max sessions per user
    sessionTTL: number; // Session TTL in seconds
    cleanupInterval: number; // Cleanup interval in seconds
    // Security settings
    strictIPCheck: boolean; // Strict IP validation
    allowIPSubnetChange: boolean; // Allow IP changes within same subnet
    maxConcurrentDevices: number; // Max concurrent devices per user
    suspiciousActivityThreshold: number; // Threshold for flagging suspicious activity
    deviceFingerprintValidation: boolean; // Enable device fingerprinting
}

/**
 * Session Service for D1-based session management
 */
export class SessionService extends BaseService {
    private readonly config: SessionConfig = {
        maxSessions: 5,
        sessionTTL: 7 * 24 * 60 * 60, // 7 days
        cleanupInterval: 60 * 60, // 1 hour
        // Security settings
        strictIPCheck: false, // Disabled by default for mobile users
        allowIPSubnetChange: true, // Allow IP changes within same subnet
        maxConcurrentDevices: 3, // Max 3 devices concurrently
        suspiciousActivityThreshold: 5, // Flag after 5 suspicious events
        deviceFingerprintValidation: true // Enable device fingerprinting
    };
    
    private jwtUtils: JWTUtils;
    
    constructor(
        protected db: DatabaseService,
        env: Env
    ) {
        super(db);
        this.jwtUtils = JWTUtils.getInstance(env);
    }
    
    /**
     * Generate device fingerprint from request headers
     */
    private generateDeviceFingerprint(request: Request): string {
        const userAgent = request.headers.get('User-Agent') || '';
        const acceptLanguage = request.headers.get('Accept-Language') || '';
        const acceptEncoding = request.headers.get('Accept-Encoding') || '';
        const connection = request.headers.get('Connection') || '';
        
        // Create a simple fingerprint (in production, consider more sophisticated methods)
        const fingerprint = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${connection}`;
        return btoa(fingerprint).substring(0, 32); // Base64 encode and truncate
    }
    
    /**
     * Check if IP addresses are in the same subnet (Class C)
     */
    private isIPInSameSubnet(ip1: string, ip2: string): boolean {
        try {
            // Simple IPv4 subnet check (Class C: /24)
            const parts1 = ip1.split('.');
            const parts2 = ip2.split('.');
            
            if (parts1.length !== 4 || parts2.length !== 4) {
                return false; // Invalid IP format
            }
            
            // Check first 3 octets for Class C subnet
            return parts1[0] === parts2[0] && 
                   parts1[1] === parts2[1] && 
                   parts1[2] === parts2[2];
        } catch {
            return false;
        }
    }
    
    /**
     * Analyze session for suspicious activity
     */
    private async analyzeSuspiciousActivity(
        sessionId: string, 
        userId: string, 
        request: Request
    ): Promise<{
        suspicious: boolean;
        reasons: string[];
        riskScore: number;
    }> {
        const reasons: string[] = [];
        let riskScore = 0;
        
        try {
            const currentMetadata = extractRequestMetadata(request);
            const currentIP = currentMetadata.ipAddress;
            const currentUA = currentMetadata.userAgent;
            const currentFingerprint = this.generateDeviceFingerprint(request);
            
            // Get current session details
            const session = await this.db.db
                .select()
                .from(schema.sessions)
                .where(eq(schema.sessions.id, sessionId))
                .get();
                
            if (!session) {
                return { suspicious: true, reasons: ['Session not found'], riskScore: 10 };
            }
            
            // Check IP changes
            if (session.ipAddress && session.ipAddress !== currentIP) {
                if (this.config.strictIPCheck) {
                    reasons.push('IP address changed (strict mode)');
                    riskScore += 8;
                } else if (this.config.allowIPSubnetChange && 
                          !this.isIPInSameSubnet(session.ipAddress, currentIP)) {
                    reasons.push('IP address changed to different subnet');
                    riskScore += 5;
                } else if (!this.config.allowIPSubnetChange) {
                    reasons.push('IP address changed');
                    riskScore += 6;
                }
            }
            
            // Check User-Agent changes
            if (session.userAgent && session.userAgent !== currentUA) {
                reasons.push('User-Agent changed');
                riskScore += 4;
            }
            
            // Check device fingerprint if stored
            if (session.deviceInfo) {
                try {
                    const storedFingerprint = JSON.parse(session.deviceInfo).fingerprint;
                    if (storedFingerprint && storedFingerprint !== currentFingerprint) {
                        reasons.push('Device fingerprint changed');
                        riskScore += 6;
                    }
                } catch {
                    // Ignore JSON parse errors
                }
            }
            
            // Check for multiple concurrent sessions from different locations
            const recentSessions = await this.db.db
                .select({
                    ipAddress: schema.sessions.ipAddress,
                    lastActivity: schema.sessions.lastActivity
                })
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        eq(schema.sessions.isRevoked, false),
                        gt(schema.sessions.lastActivity, new Date(Date.now() - 15 * 60 * 1000)) // Last 15 minutes
                    )
                )
                .all();
                
            const uniqueIPs = new Set(recentSessions.map(s => s.ipAddress).filter(Boolean));
            if (uniqueIPs.size > this.config.maxConcurrentDevices) {
                reasons.push(`Too many concurrent locations (${uniqueIPs.size})`);
                riskScore += 7;
            }
            
            // Check for rapid location changes (impossible travel)
            if (recentSessions.length > 1) {
                const sessionsByTime = recentSessions.sort((a, b) => 
                    (b.lastActivity?.getTime() || 0) - (a.lastActivity?.getTime() || 0)
                );
                
                if (sessionsByTime.length >= 2) {
                    const latest = sessionsByTime[0];
                    const previous = sessionsByTime[1];
                    
                    if (latest.ipAddress !== previous.ipAddress && 
                        latest.lastActivity && previous.lastActivity) {
                        const timeDiff = latest.lastActivity.getTime() - previous.lastActivity.getTime();
                        
                        // If location changed in less than 5 minutes, it's suspicious
                        if (timeDiff < 5 * 60 * 1000) {
                            reasons.push('Impossible travel detected');
                            riskScore += 9;
                        }
                    }
                }
            }
            
            return {
                suspicious: riskScore >= this.config.suspiciousActivityThreshold,
                reasons,
                riskScore
            };
        } catch (error) {
            logger.error('Error analyzing suspicious activity', error);
            return { suspicious: false, reasons: [], riskScore: 0 };
        }
    }
    
    /**
     * Log security event for audit purposes
     */
    private async logSecurityEvent(
        userId: string,
        sessionId: string,
        eventType: 'session_hijacking' | 'suspicious_activity' | 'device_change' | 'location_change',
        details: Record<string, unknown>,
        request?: Request
    ): Promise<void> {
        try {
            const metadata = request ? extractRequestMetadata(request) : { ipAddress: 'unknown', userAgent: 'unknown' };
            
            await this.db.db.insert(schema.auditLogs).values({
                id: generateId(),
                userId: userId,
                entityType: 'session',
                entityId: sessionId,
                action: eventType,
                newValues: details,
                ipAddress: metadata.ipAddress,
                userAgent: metadata.userAgent,
                createdAt: new Date()
            });
            
            logger.warn('Security event logged', {
                userId,
                sessionId,
                eventType,
                details
            });
        } catch (error) {
            logger.error('Failed to log security event', error);
        }
    }
    
    /**
     * Create a new session
     */
    async createSession(
        userId: string,
        request: Request
    ): Promise<{
        session: AuthSession;
        accessToken: string;
        refreshToken: string;
    }> {
        try {
            // Clean up old sessions for this user
            await this.cleanupUserSessions(userId);
            
            // Generate session ID first
            const sessionId = generateId();
            const userEmail = await this.getUserEmail(userId);
            
            // Generate tokens WITH session ID
            const { accessToken, refreshToken } = await this.jwtUtils.createTokenPair(
                userId,
                userEmail,
                sessionId
            );
            
            // Hash tokens for storage
            const [accessTokenHash, refreshTokenHash] = await Promise.all([
                this.jwtUtils.hashToken(accessToken),
                this.jwtUtils.hashToken(refreshToken)
            ]);
            
            // Extract request metadata using centralized utility
            const requestMetadata = extractRequestMetadata(request);
            
            // Generate device fingerprint if enabled
            const deviceFingerprint = this.config.deviceFingerprintValidation 
                ? this.generateDeviceFingerprint(request) 
                : null;
            
            // Create device info object
            const deviceInfo = deviceFingerprint ? JSON.stringify({
                fingerprint: deviceFingerprint,
                createdAt: new Date().toISOString()
            }) : requestMetadata.userAgent;
            
            // Create session
            const now = new Date();
            const expiresAt = new Date(Date.now() + this.config.sessionTTL * 1000);
            
            await this.db.db.insert(schema.sessions).values({
                id: sessionId,
                userId,
                accessTokenHash,
                refreshTokenHash,
                expiresAt,
                lastActivity: now,
                ipAddress: requestMetadata.ipAddress,
                userAgent: requestMetadata.userAgent,
                deviceInfo,
                createdAt: now
            });
            
            const session: AuthSession = {
                userId,
                email: await this.getUserEmail(userId),
                sessionId,
                expiresAt: expiresAt,
            };
            
            logger.info('Session created', { userId, sessionId });
            
            return {
                session,
                accessToken,
                refreshToken
            };
        } catch (error) {
            logger.error('Error creating session', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to create session',
                500
            );
        }
    }
    
    /**
     * Validate session by token
     */
    async validateSession(accessToken: string, request?: Request): Promise<AuthSession | null> {
        try {
            // Verify token structure
            const payload = await this.jwtUtils.verifyToken(accessToken);
            if (!payload || payload.type !== 'access') {
                return null;
            }
            
            // Hash token for lookup
            const accessTokenHash = await this.jwtUtils.hashToken(accessToken);
            
            // Find session
            const now = new Date();
            const session = await this.db.db
                .select()
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.accessTokenHash, accessTokenHash),
                        eq(schema.sessions.userId, payload.sub),
                        gt(schema.sessions.expiresAt, now),
                        eq(schema.sessions.isRevoked, false)
                    )
                )
                .get();
            
            if (!session) {
                logger.debug('Session not found or expired');
                return null;
            }
            
            // Enhanced security: Analyze session for suspicious activity
            if (request) {
                const suspiciousAnalysis = await this.analyzeSuspiciousActivity(
                    session.id, 
                    session.userId, 
                    request
                );
                
                if (suspiciousAnalysis.suspicious) {
                    // Log security event
                    await this.logSecurityEvent(
                        session.userId,
                        session.id,
                        suspiciousAnalysis.riskScore >= 8 ? 'session_hijacking' : 'suspicious_activity',
                        {
                            reasons: suspiciousAnalysis.reasons,
                            riskScore: suspiciousAnalysis.riskScore,
                            currentIP: request.headers.get('CF-Connecting-IP'),
                            sessionIP: session.ipAddress
                        },
                        request
                    );
                    
                    // Revoke session if risk score is high enough
                    if (suspiciousAnalysis.riskScore >= 8) {
                        logger.warn('Session revoked due to high risk activity', {
                            sessionId: session.id,
                            userId: session.userId,
                            riskScore: suspiciousAnalysis.riskScore,
                            reasons: suspiciousAnalysis.reasons
                        });
                        
                        await this.revokeSession(session.id);
                        return null;
                    }
                    
                    // For lower risk scores, just log the event but continue
                    logger.info('Suspicious activity detected but session maintained', {
                        sessionId: session.id,
                        userId: session.userId,
                        riskScore: suspiciousAnalysis.riskScore,
                        reasons: suspiciousAnalysis.reasons
                    });
                }
            }
            
            // Update last activity
            await this.db.db
                .update(schema.sessions)
                .set({ lastActivity: new Date() })
                .where(eq(schema.sessions.id, session.id));
            
            return {
                userId: session.userId,
                email: payload.email,
                sessionId: session.id,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            logger.error('Error validating session', error);
            return null;
        }
    }
    
    /**
     * Refresh session with refresh token
     */
    async refreshSession(refreshToken: string): Promise<{
        accessToken: string;
        expiresIn: number;
    } | null> {
        try {
            // Verify refresh token
            const payload = await this.jwtUtils.verifyToken(refreshToken);
            if (!payload || payload.type !== 'refresh') {
                return null;
            }
            
            // Hash token for lookup
            const refreshTokenHash = await this.jwtUtils.hashToken(refreshToken);
            
            // Find session
            const session = await this.db.db
                .select()
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.refreshTokenHash, refreshTokenHash),
                        eq(schema.sessions.userId, payload.sub)
                    )
                )
                .get();
            
            if (!session) {
                logger.warn('Session not found for refresh token');
                return null;
            }
            
            // Generate new access token
            const result = await this.jwtUtils.refreshAccessToken(refreshToken);
            if (!result) {
                return null;
            }
            
            // Update session with new access token hash
            const newTokenHash = await this.jwtUtils.hashToken(result.accessToken);
            await this.db.db
                .update(schema.sessions)
                .set({
                    accessTokenHash: newTokenHash,
                    lastActivity: new Date()
                })
                .where(eq(schema.sessions.id, session.id));
            
            logger.info('Session refreshed', { userId: payload.sub, sessionId: session.id });
            
            return result;
        } catch (error) {
            logger.error('Error refreshing session', error);
            return null;
        }
    }
    
    /**
     * Revoke session
     */
    async revokeSession(sessionId: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_logout'
                })
                .where(eq(schema.sessions.id, sessionId));
            
            logger.info('Session revoked', { sessionId });
        } catch (error) {
            logger.error('Error revoking session', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to revoke session',
                500
            );
        }
    }
    
    /**
     * Revoke all sessions for a user
     */
    async revokeAllUserSessions(userId: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_force_logout'
                })
                .where(eq(schema.sessions.userId, userId));
            
            logger.info('All user sessions revoked', { userId });
        } catch (error) {
            logger.error('Error revoking user sessions', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Failed to revoke sessions',
                500
            );
        }
    }
    
    /**
     * Get all active sessions for a user
     */
    async getUserSessions(userId: string): Promise<Array<{
        id: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastActivity: Date;
        createdAt: Date;
        isCurrent?: boolean;
    }>> {
        try {
            const sessions = await this.db.db
                .select({
                    id: schema.sessions.id,
                    userAgent: schema.sessions.userAgent,
                    ipAddress: schema.sessions.ipAddress,
                    lastActivity: schema.sessions.lastActivity,
                    createdAt: schema.sessions.createdAt
                })
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        eq(schema.sessions.isRevoked, false),
                        gt(schema.sessions.expiresAt, new Date())
                    )
                )
                .orderBy(desc(schema.sessions.lastActivity))
                .all();

            return sessions.map(session => ({
                id: session.id,
                userAgent: session.userAgent || 'Unknown',
                ipAddress: session.ipAddress || 'Unknown',
                lastActivity: session.lastActivity || new Date(),
                createdAt: session.createdAt || new Date()
            }));
        } catch (error) {
            logger.error('Error getting user sessions', error);
            return [];
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions(): Promise<number> {
        try {
            const now = new Date();
            
            // Delete expired sessions
            await this.db.db
                .delete(schema.sessions)
                .where(lt(schema.sessions.expiresAt, now));
            
            logger.info('Cleaned up expired sessions');
            
            return 0; // D1 doesn't return count
        } catch (error) {
            logger.error('Error cleaning up sessions', error);
            return 0;
        }
    }
    
    /**
     * Clean up old sessions for a user (keep only most recent)
     */
    private async cleanupUserSessions(userId: string): Promise<void> {
        try {
            // Get all sessions for user, ordered by last activity
            const sessions = await this.db.db
                .select({ id: schema.sessions.id })
                .from(schema.sessions)
                .where(eq(schema.sessions.userId, userId))
                .orderBy(desc(schema.sessions.lastActivity))
                .all();
            
            // Keep only the most recent sessions
            if (sessions.length > this.config.maxSessions) {
                const sessionsToDelete = sessions.slice(this.config.maxSessions);
                
                for (const session of sessionsToDelete) {
                    await this.db.db
                        .delete(schema.sessions)
                        .where(eq(schema.sessions.id, session.id));
                }
                
                logger.debug('Cleaned up old user sessions', { 
                    userId, 
                    deleted: sessionsToDelete.length 
                });
            }
        } catch (error) {
            logger.error('Error cleaning up user sessions', error);
        }
    }
    
    /**
     * Get user email (helper method)
     */
    private async getUserEmail(userId: string): Promise<string> {
        const user = await this.db.db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, userId))
            .get();
        
        return user?.email || '';
    }
    
    /**
     * Get security status and recent events for a user
     */
    async getUserSecurityStatus(userId: string): Promise<{
        activeSessions: number;
        recentSecurityEvents: number;
        lastSecurityEvent?: Date;
        riskLevel: 'low' | 'medium' | 'high';
        recommendations: string[];
    }> {
        try {
            // Get active sessions count
            const activeSessions = await this.db.db
                .select({ count: schema.sessions.id })
                .from(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        eq(schema.sessions.isRevoked, false),
                        gt(schema.sessions.expiresAt, new Date())
                    )
                )
                .all();
                
            // Get recent security events (last 24 hours)
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentEvents = await this.db.db
                .select({
                    createdAt: schema.auditLogs.createdAt,
                    action: schema.auditLogs.action
                })
                .from(schema.auditLogs)
                .where(
                    and(
                        eq(schema.auditLogs.userId, userId),
                        eq(schema.auditLogs.entityType, 'session'),
                        gt(schema.auditLogs.createdAt, oneDayAgo)
                    )
                )
                .orderBy(desc(schema.auditLogs.createdAt))
                .all();
                
            const activeSessionCount = activeSessions.length;
            const recentSecurityEvents = recentEvents.length;
            const lastSecurityEvent = recentEvents[0]?.createdAt || undefined;
            
            // Determine risk level
            let riskLevel: 'low' | 'medium' | 'high' = 'low';
            const recommendations: string[] = [];
            
            if (activeSessionCount > this.config.maxConcurrentDevices) {
                riskLevel = 'medium';
                recommendations.push('Consider revoking old sessions - you have many active sessions');
            }
            
            if (recentSecurityEvents > 5) {
                riskLevel = 'high';
                recommendations.push('Multiple security events detected - review your account activity');
            } else if (recentSecurityEvents > 2) {
                riskLevel = 'medium';
                recommendations.push('Some suspicious activity detected - monitor your account');
            }
            
            // Check for session hijacking events
            const hijackingEvents = recentEvents.filter(e => e.action === 'session_hijacking');
            if (hijackingEvents.length > 0) {
                riskLevel = 'high';
                recommendations.push('Session hijacking attempts detected - change your password immediately');
            }
            
            if (recommendations.length === 0) {
                recommendations.push('Your account security looks good');
            }
            
            return {
                activeSessions: activeSessionCount,
                recentSecurityEvents,
                lastSecurityEvent,
                riskLevel,
                recommendations
            };
        } catch (error) {
            logger.error('Error getting user security status', error);
            return {
                activeSessions: 0,
                recentSecurityEvents: 0,
                riskLevel: 'low',
                recommendations: ['Unable to assess security status']
            };
        }
    }
    
    /**
     * Revoke session by refresh token hash
     */
    async revokeSessionByRefreshTokenHash(refreshTokenHash: string): Promise<void> {
        try {
            await this.db.db
                .update(schema.sessions)
                .set({
                    isRevoked: true,
                    revokedAt: new Date(),
                    revokedReason: 'user_logout'
                })
                .where(eq(schema.sessions.refreshTokenHash, refreshTokenHash));
            
            logger.info('Session revoked by refresh token hash');
        } catch (error) {
            logger.error('Error revoking session by refresh token hash', error);
            // Don't throw error for logout operations
        }
    }
    
    /**
     * Force logout all sessions except current (for security)
     */
    async forceLogoutAllOtherSessions(userId: string, currentSessionId: string): Promise<number> {
        try {
            const result = await this.db.db
                .delete(schema.sessions)
                .where(
                    and(
                        eq(schema.sessions.userId, userId),
                        ne(schema.sessions.id, currentSessionId)
                    )
                );
                
            const deletedCount = result.meta.changes || 0;
            
            // Log security event
            await this.logSecurityEvent(
                userId,
                currentSessionId,
                'device_change',
                {
                    action: 'force_logout_other_sessions',
                    sessionsRevoked: deletedCount
                }
            );
            
            logger.info('Force logged out other sessions', { userId, currentSessionId, deletedCount });
            
            return deletedCount;
        } catch (error) {
            logger.error('Error force logging out other sessions', error);
            return 0;
        }
    }
}
