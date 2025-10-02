import { BaseRepository, PaginatedResult } from './base-repository';
import { DatabaseManager, QueryResult } from '../database-manager';
import { StructuredLogger } from '@worker/logger';

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isEmailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  isActive: boolean;
  preferences?: Record<string, unknown>;
}

export interface CreateUserData {
  email: string;
  name: string;
  passwordHash: string;
  preferences?: Record<string, unknown>;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  passwordHash?: string;
  isEmailVerified?: boolean;
  lastLoginAt?: number;
  isActive?: boolean;
  preferences?: Record<string, unknown>;
}

export interface UserSearchOptions {
  search?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  createdAfter?: number;
  createdBefore?: number;
}

export class UserRepository extends BaseRepository<User> {
  constructor(db: DatabaseManager, logger: StructuredLogger) {
    super(db, {
      logger,
      tableName: 'users',
      primaryKey: 'id',
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<QueryResult<User>> {
    return this.findOneByField('email', email);
  }

  /**
   * Find active users
   */
  async findActiveUsers(): Promise<QueryResult<User>> {
    return this.findByField('isActive', true);
  }

  /**
   * Find verified users
   */
  async findVerifiedUsers(): Promise<QueryResult<User>> {
    return this.findByField('isEmailVerified', true);
  }

  /**
   * Search users with filters
   */
  async searchUsers(
    options: UserSearchOptions,
    pagination?: { page: number; limit: number }
  ): Promise<PaginatedResult<User> | QueryResult<User>> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (options.isActive !== undefined) {
      conditions.push('isActive = ?');
      params.push(options.isActive);
    }

    if (options.isEmailVerified !== undefined) {
      conditions.push('isEmailVerified = ?');
      params.push(options.isEmailVerified);
    }

    if (options.createdAfter) {
      conditions.push('createdAt >= ?');
      params.push(options.createdAfter);
    }

    if (options.createdBefore) {
      conditions.push('createdAt <= ?');
      params.push(options.createdBefore);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const baseSql = `SELECT * FROM ${this.tableName} ${whereClause}`;

    if (pagination) {
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      // Get total count
      const countSql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
      const countResult = await this.db.queryOne<{ count: number }>(countSql, params);

      const total = countResult.success ? countResult.data?.[0]?.count || 0 : 0;
      const totalPages = Math.ceil(total / limit);

      // Get paginated data
      const dataSql = `${baseSql} ORDER BY createdAt DESC LIMIT ? OFFSET ?`;
      const dataResult = await this.db.query<User>(dataSql, [...params, limit, offset]);

      return {
        data: dataResult.success ? dataResult.data || [] : [],
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    } else {
      const sql = `${baseSql} ORDER BY createdAt DESC`;
      return this.db.query<User>(sql, params);
    }
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(userId: string): Promise<QueryResult<User>> {
    return this.updateById(userId, {
      lastLoginAt: Date.now(),
    });
  }

  /**
   * Verify user's email
   */
  async verifyEmail(userId: string): Promise<QueryResult<User>> {
    return this.updateById(userId, {
      isEmailVerified: true,
    });
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId: string): Promise<QueryResult<User>> {
    return this.updateById(userId, {
      isActive: false,
    });
  }

  /**
   * Activate user
   */
  async activateUser(userId: string): Promise<QueryResult<User>> {
    return this.updateById(userId, {
      isActive: true,
    });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId: string, preferences: Record<string, unknown>): Promise<QueryResult<User>> {
    return this.updateById(userId, {
      preferences: JSON.stringify(preferences),
    });
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<Record<string, unknown> | null> {
    const result = await this.findById(userId);
    if (result.success && result.data?.[0]?.preferences) {
      try {
        return JSON.parse(result.data[0].preferences as string);
      } catch (error) {
        this.logger.warn('Failed to parse user preferences', { userId, error });
        return null;
      }
    }
    return null;
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    verifiedUsers: number;
    newUsersToday: number;
    newUsersThisWeek: number;
  }> {
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const [
      totalResult,
      activeResult,
      verifiedResult,
      todayResult,
      weekResult,
    ] = await Promise.all([
      this.count(),
      this.countByField('isActive', true),
      this.countByField('isEmailVerified', true),
      this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE createdAt >= ?`,
        [today.getTime()]
      ),
      this.db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.tableName} WHERE createdAt >= ?`,
        [weekAgo]
      ),
    ]);

    return {
      totalUsers: totalResult.success ? totalResult.data?.[0]?.count || 0 : 0,
      activeUsers: activeResult.success ? activeResult.data?.[0]?.count || 0 : 0,
      verifiedUsers: verifiedResult.success ? verifiedResult.data?.[0]?.count || 0 : 0,
      newUsersToday: todayResult.success ? todayResult.data?.[0]?.count || 0 : 0,
      newUsersThisWeek: weekResult.success ? weekResult.data?.[0]?.count || 0 : 0,
    };
  }

  /**
   * Find users created in date range
   */
  async findUsersByDateRange(startDate: number, endDate: number): Promise<QueryResult<User>> {
    const sql = `SELECT * FROM ${this.tableName} WHERE createdAt >= ? AND createdAt <= ? ORDER BY createdAt DESC`;
    return this.db.query<User>(sql, [startDate, endDate]);
  }

  /**
   * Find users who haven't logged in recently
   */
  async findInactiveUsers(daysSinceLastLogin: number): Promise<QueryResult<User>> {
    const cutoffTime = Date.now() - (daysSinceLastLogin * 24 * 60 * 60 * 1000);
    const sql = `SELECT * FROM ${this.tableName} WHERE (lastLoginAt IS NULL OR lastLoginAt < ?) AND isActive = true ORDER BY lastLoginAt ASC`;
    return this.db.query<User>(sql, [cutoffTime]);
  }

  /**
   * Bulk update users
   */
  async bulkUpdateUserStatus(userIds: string[], isActive: boolean): Promise<QueryResult> {
    if (userIds.length === 0) {
      return { success: true };
    }

    const placeholders = userIds.map(() => '?').join(',');
    const sql = `UPDATE ${this.tableName} SET isActive = ? WHERE id IN (${placeholders})`;
    const params = [isActive, ...userIds];

    return this.db.execute(sql, params);
  }

  /**
   * Delete users by email domain
   */
  async deleteUsersByEmailDomain(domain: string): Promise<QueryResult> {
    const sql = `DELETE FROM ${this.tableName} WHERE email LIKE ?`;
    return this.db.execute(sql, [`%@${domain}`]);
  }
}