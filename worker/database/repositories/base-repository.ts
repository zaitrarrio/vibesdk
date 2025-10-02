import { DatabaseManager, QueryResult } from '../database-manager';
import { StructuredLogger } from '@worker/logger';

export interface RepositoryConfig {
  logger: StructuredLogger;
  tableName: string;
  primaryKey: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export abstract class BaseRepository<T extends Record<string, unknown>> {
  protected readonly db: DatabaseManager;
  protected readonly logger: StructuredLogger;
  protected readonly tableName: string;
  protected readonly primaryKey: string;

  constructor(db: DatabaseManager, config: RepositoryConfig) {
    this.db = db;
    this.logger = config.logger;
    this.tableName = config.tableName;
    this.primaryKey = config.primaryKey;
  }

  /**
   * Find all records
   */
  async findAll(): Promise<QueryResult<T>> {
    const sql = `SELECT * FROM ${this.tableName}`;
    return this.db.query<T>(sql);
  }

  /**
   * Find records with pagination
   */
  async findPaginated(options: PaginationOptions): Promise<PaginatedResult<T>> {
    const { page, limit, orderBy = this.primaryKey, orderDirection = 'ASC' } = options;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );

    const total = countResult.success ? countResult.data?.[0]?.count || 0 : 0;
    const totalPages = Math.ceil(total / limit);

    // Get paginated data
    const dataResult = await this.db.query<T>(
      `SELECT * FROM ${this.tableName} ORDER BY ${orderBy} ${orderDirection} LIMIT ? OFFSET ?`,
      [limit, offset]
    );

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
  }

  /**
   * Find record by ID
   */
  async findById(id: unknown): Promise<QueryResult<T>> {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    return this.db.queryOne<T>(sql, [id]);
  }

  /**
   * Find records by field
   */
  async findByField(field: string, value: unknown): Promise<QueryResult<T>> {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ?`;
    return this.db.query<T>(sql, [value]);
  }

  /**
   * Find one record by field
   */
  async findOneByField(field: string, value: unknown): Promise<QueryResult<T>> {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ? LIMIT 1`;
    return this.db.queryOne<T>(sql, [value]);
  }

  /**
   * Find records by multiple fields
   */
  async findByFields(fields: Record<string, unknown>): Promise<QueryResult<T>> {
    const whereClause = Object.keys(fields)
      .map(key => `${key} = ?`)
      .join(' AND ');
    
    const sql = `SELECT * FROM ${this.tableName} WHERE ${whereClause}`;
    const params = Object.values(fields);
    
    return this.db.query<T>(sql, params);
  }

  /**
   * Create a new record
   */
  async create(data: Partial<T>): Promise<QueryResult<T>> {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const result = await this.db.execute(sql, values);

    if (result.success && result.meta?.lastInsertRowid) {
      return this.findById(result.meta.lastInsertRowid);
    }

    return {
      success: false,
      error: 'Failed to create record',
    };
  }

  /**
   * Update record by ID
   */
  async updateById(id: unknown, data: Partial<T>): Promise<QueryResult<T>> {
    const fields = Object.keys(data);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(data), id];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
    const result = await this.db.execute(sql, values);

    if (result.success) {
      return this.findById(id);
    }

    return {
      success: false,
      error: 'Failed to update record',
    };
  }

  /**
   * Update records by field
   */
  async updateByField(field: string, value: unknown, data: Partial<T>): Promise<QueryResult<T[]>> {
    const fields = Object.keys(data);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = [...Object.values(data), value];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${field} = ?`;
    const result = await this.db.execute(sql, values);

    if (result.success) {
      return this.findByField(field, value);
    }

    return {
      success: false,
      error: 'Failed to update records',
    };
  }

  /**
   * Delete record by ID
   */
  async deleteById(id: unknown): Promise<QueryResult> {
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    return this.db.execute(sql, [id]);
  }

  /**
   * Delete records by field
   */
  async deleteByField(field: string, value: unknown): Promise<QueryResult> {
    const sql = `DELETE FROM ${this.tableName} WHERE ${field} = ?`;
    return this.db.execute(sql, [value]);
  }

  /**
   * Count all records
   */
  async count(): Promise<QueryResult<{ count: number }>> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    return this.db.queryOne<{ count: number }>(sql);
  }

  /**
   * Count records by field
   */
  async countByField(field: string, value: unknown): Promise<QueryResult<{ count: number }>> {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${field} = ?`;
    return this.db.queryOne<{ count: number }>(sql, [value]);
  }

  /**
   * Check if record exists by ID
   */
  async existsById(id: unknown): Promise<boolean> {
    const result = await this.countByField(this.primaryKey, id);
    return result.success && (result.data?.[0]?.count || 0) > 0;
  }

  /**
   * Check if record exists by field
   */
  async existsByField(field: string, value: unknown): Promise<boolean> {
    const result = await this.countByField(field, value);
    return result.success && (result.data?.[0]?.count || 0) > 0;
  }

  /**
   * Execute custom query
   */
  async executeQuery(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.db.query<T>(sql, params);
  }

  /**
   * Execute custom query that returns one result
   */
  async executeQueryOne(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
    return this.db.queryOne<T>(sql, params);
  }

  /**
   * Execute custom query that doesn't return data
   */
  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    return this.db.execute(sql, params);
  }

  /**
   * Get table name
   */
  getTableName(): string {
    return this.tableName;
  }

  /**
   * Get primary key field
   */
  getPrimaryKey(): string {
    return this.primaryKey;
  }
}