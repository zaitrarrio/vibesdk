import { D1Database } from '@cloudflare/workers-types';
import { StructuredLogger } from '@worker/logger';

export interface DatabaseConfig {
  logger: StructuredLogger;
  enableLogging: boolean;
  enableMetrics: boolean;
  queryTimeout: number;
}

export interface QueryResult<T = unknown> {
  success: boolean;
  data?: T[];
  error?: string;
  meta?: {
    changes: number;
    lastInsertRowid: number;
    duration: number;
  };
}

export interface TransactionOptions {
  isolationLevel?: 'READ_UNCOMMITTED' | 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE';
  timeout?: number;
}

export class DatabaseManager {
  private readonly logger: StructuredLogger;
  private readonly config: DatabaseConfig;
  private readonly db: D1Database;

  constructor(db: D1Database, config: DatabaseConfig) {
    this.db = db;
    this.config = config;
    this.logger = config.logger;
  }

  /**
   * Execute a single query
   */
  async query<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      this.logQuery(sql, params);
      
      const result = await this.db.prepare(sql).bind(...params).all();
      
      const duration = Date.now() - startTime;
      
      if (this.config.enableLogging) {
        this.logger.debug('Query executed successfully', {
          sql: this.sanitizeSql(sql),
          params,
          duration,
          rowCount: result.results?.length || 0,
        });
      }

      return {
        success: true,
        data: result.results as T[],
        meta: {
          changes: result.changes || 0,
          lastInsertRowid: result.meta?.last_row_id || 0,
          duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Query execution failed', {
        sql: this.sanitizeSql(sql),
        params,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    }
  }

  /**
   * Execute a single query that returns one row
   */
  async queryOne<T = unknown>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const result = await this.query<T>(sql, params);
    
    if (result.success && result.data) {
      return {
        ...result,
        data: result.data.slice(0, 1),
      };
    }
    
    return result;
  }

  /**
   * Execute a query that doesn't return data (INSERT, UPDATE, DELETE)
   */
  async execute(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      this.logQuery(sql, params);
      
      const result = await this.db.prepare(sql).bind(...params).run();
      
      const duration = Date.now() - startTime;
      
      if (this.config.enableLogging) {
        this.logger.debug('Execute query completed', {
          sql: this.sanitizeSql(sql),
          params,
          duration,
          changes: result.changes,
        });
      }

      return {
        success: true,
        meta: {
          changes: result.changes || 0,
          lastInsertRowid: result.meta?.last_row_id || 0,
          duration,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Execute query failed', {
        sql: this.sanitizeSql(sql),
        params,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    queries: Array<{ sql: string; params?: unknown[] }>,
    options: TransactionOptions = {}
  ): Promise<QueryResult<T[]>> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Starting transaction', { queryCount: queries.length });
      
      const results: T[] = [];
      
      await this.db.batch(
        queries.map(({ sql, params = [] }) => 
          this.db.prepare(sql).bind(...params)
        )
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Transaction completed successfully', {
        queryCount: queries.length,
        duration,
      });

      return {
        success: true,
        data: results,
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Transaction failed', {
        queryCount: queries.length,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    }
  }

  /**
   * Execute a prepared statement multiple times
   */
  async batch<T>(
    sql: string,
    paramsList: unknown[][]
  ): Promise<QueryResult<T[]>> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Executing batch query', { 
        sql: this.sanitizeSql(sql), 
        batchSize: paramsList.length 
      });
      
      const prepared = this.db.prepare(sql);
      const results = await this.db.batch(
        paramsList.map(params => prepared.bind(...params))
      );
      
      const duration = Date.now() - startTime;
      
      this.logger.info('Batch query completed', {
        batchSize: paramsList.length,
        duration,
      });

      return {
        success: true,
        data: results as T[],
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Batch query failed', {
        batchSize: paramsList.length,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        meta: { changes: 0, lastInsertRowid: 0, duration },
      };
    }
  }

  /**
   * Get database schema information
   */
  async getSchema(): Promise<QueryResult<{ name: string; sql: string }>> {
    return this.query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"
    );
  }

  /**
   * Get table information
   */
  async getTableInfo(tableName: string): Promise<QueryResult<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: unknown;
    pk: number;
  }>> {
    return this.query(
      `PRAGMA table_info(${this.escapeIdentifier(tableName)})`
    );
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    
    return result.success && result.data?.[0]?.count > 0;
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    tableCount: number;
    totalRows: number;
    databaseSize: number;
  }> {
    const tablesResult = await this.getSchema();
    const tables = tablesResult.success ? tablesResult.data || [] : [];
    
    let totalRows = 0;
    for (const table of tables) {
      const countResult = await this.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${this.escapeIdentifier(table.name)}`
      );
      if (countResult.success && countResult.data?.[0]) {
        totalRows += countResult.data[0].count;
      }
    }

    return {
      tableCount: tables.length,
      totalRows,
      databaseSize: 0, // D1 doesn't provide size info
    };
  }

  /**
   * Log query for debugging
   */
  private logQuery(sql: string, params: unknown[]): void {
    if (this.config.enableLogging) {
      this.logger.debug('Executing query', {
        sql: this.sanitizeSql(sql),
        params: params.length > 0 ? params : undefined,
      });
    }
  }

  /**
   * Sanitize SQL for logging (remove sensitive data)
   */
  private sanitizeSql(sql: string): string {
    // Remove potential sensitive data from SQL
    return sql
      .replace(/password\s*=\s*'[^']*'/gi, "password='***'")
      .replace(/token\s*=\s*'[^']*'/gi, "token='***'")
      .replace(/key\s*=\s*'[^']*'/gi, "key='***'");
  }

  /**
   * Escape identifier for SQL
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.queryOne<{ one: number }>('SELECT 1 as one');
      return result.success;
    } catch (error) {
      this.logger.error('Database health check failed', { error });
      return false;
    }
  }
}