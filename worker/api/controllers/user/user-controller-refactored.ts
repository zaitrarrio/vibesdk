import { Context } from 'hono';
import { BaseControllerRefactored, ApiResponse, PaginatedResponse } from '../base-controller-refactored';
import { UserRepository, CreateUserData, UpdateUserData, UserSearchOptions } from '@worker/database/repositories/user-repository';
import { StructuredLogger } from '@worker/logger';
import { ErrorHandlerService } from '@worker/services/error-handler/error-handler-service';
import { ApplicationError, ErrorCategory, ErrorSeverity } from '@shared/types/error-types';

export interface UserControllerConfig {
  logger: StructuredLogger;
  errorHandler: ErrorHandlerService;
  userRepository: UserRepository;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  password: string;
  preferences?: Record<string, unknown>;
}

export interface UpdateUserRequest {
  name?: string;
  email?: string;
  password?: string;
  preferences?: Record<string, unknown>;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  isEmailVerified: boolean;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  isActive: boolean;
  preferences?: Record<string, unknown>;
}

export class UserControllerRefactored extends BaseControllerRefactored {
  private readonly userRepository: UserRepository;

  constructor(config: UserControllerConfig) {
    super({
      logger: config.logger,
      errorHandler: config.errorHandler,
    });
    this.userRepository = config.userRepository;
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      const userId = this.requireAuth(c);
      const result = await this.userRepository.findById(userId);
      
      if (!result.success || !result.data?.[0]) {
        throw this.notFound('User');
      }

      const user = result.data[0];
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        preferences: user.preferences ? JSON.parse(user.preferences as string) : undefined,
      };

      this.logResponse(c, 200);
      return this.success(c, userResponse);
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Update current user profile
   */
  async updateCurrentUser(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      const userId = this.requireAuth(c);
      const updateData: UpdateUserRequest = this.validateBody(c);
      
      // Validate update data
      if (updateData.email && !this.isValidEmail(updateData.email)) {
        throw this.validationError('Invalid email format');
      }

      if (updateData.password && updateData.password.length < 8) {
        throw this.validationError('Password must be at least 8 characters long');
      }

      // Check if email is already taken by another user
      if (updateData.email) {
        const existingUser = await this.userRepository.findByEmail(updateData.email);
        if (existingUser.success && existingUser.data?.[0] && existingUser.data[0].id !== userId) {
          throw this.validationError('Email is already taken');
        }
      }

      const updateUserData: UpdateUserData = {
        ...updateData,
        updatedAt: Date.now(),
      };

      // Hash password if provided
      if (updateData.password) {
        updateUserData.passwordHash = await this.hashPassword(updateData.password);
        delete updateUserData.password;
      }

      const result = await this.userRepository.updateById(userId, updateUserData);
      
      if (!result.success || !result.data?.[0]) {
        throw this.internalError('Failed to update user');
      }

      const user = result.data[0];
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        preferences: user.preferences ? JSON.parse(user.preferences as string) : undefined,
      };

      this.logResponse(c, 200);
      return this.success(c, userResponse, 'User updated successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Get user by ID (admin only)
   */
  async getUserById(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      this.requireAuth(c); // Basic auth check
      const userId = c.req.param('id');
      
      if (!userId) {
        throw this.validationError('User ID is required');
      }

      const result = await this.userRepository.findById(userId);
      
      if (!result.success || !result.data?.[0]) {
        throw this.notFound('User');
      }

      const user = result.data[0];
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        preferences: user.preferences ? JSON.parse(user.preferences as string) : undefined,
      };

      this.logResponse(c, 200);
      return this.success(c, userResponse);
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * List users with pagination and search
   */
  async listUsers(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      this.requireAuth(c); // Basic auth check
      
      const { page, limit } = this.getPaginationParams(c);
      const queryParams = this.getQueryParams(c);
      
      const searchOptions: UserSearchOptions = {
        search: queryParams.search,
        isActive: queryParams.isActive ? queryParams.isActive === 'true' : undefined,
        isEmailVerified: queryParams.isEmailVerified ? queryParams.isEmailVerified === 'true' : undefined,
        createdAfter: queryParams.createdAfter ? parseInt(queryParams.createdAfter, 10) : undefined,
        createdBefore: queryParams.createdBefore ? parseInt(queryParams.createdBefore, 10) : undefined,
      };

      const result = await this.userRepository.searchUsers(searchOptions, { page, limit });
      
      if ('pagination' in result) {
        const users = result.data.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          isActive: user.isActive,
        }));

        this.logResponse(c, 200);
        return this.paginated(c, users, result.pagination);
      } else {
        const users = result.success ? result.data?.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          isActive: user.isActive,
        })) || [] : [];

        this.logResponse(c, 200);
        return this.success(c, users);
      }
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Create new user (admin only)
   */
  async createUser(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      this.requireAuth(c); // Basic auth check
      const createData: CreateUserRequest = this.validateBody(c);
      
      // Validate create data
      if (!this.isValidEmail(createData.email)) {
        throw this.validationError('Invalid email format');
      }

      if (createData.password.length < 8) {
        throw this.validationError('Password must be at least 8 characters long');
      }

      // Check if email already exists
      const existingUser = await this.userRepository.findByEmail(createData.email);
      if (existingUser.success && existingUser.data?.[0]) {
        throw this.validationError('Email is already taken');
      }

      const createUserData: CreateUserData = {
        email: createData.email,
        name: createData.name,
        passwordHash: await this.hashPassword(createData.password),
        preferences: createData.preferences,
      };

      const result = await this.userRepository.create(createUserData);
      
      if (!result.success || !result.data?.[0]) {
        throw this.internalError('Failed to create user');
      }

      const user = result.data[0];
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        preferences: user.preferences ? JSON.parse(user.preferences as string) : undefined,
      };

      this.logResponse(c, 201);
      return this.success(c, userResponse, 'User created successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Delete user (admin only)
   */
  async deleteUser(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      this.requireAuth(c); // Basic auth check
      const userId = c.req.param('id');
      
      if (!userId) {
        throw this.validationError('User ID is required');
      }

      const result = await this.userRepository.deleteById(userId);
      
      if (!result.success) {
        throw this.internalError('Failed to delete user');
      }

      this.logResponse(c, 200);
      return this.success(c, { success: true }, 'User deleted successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Get user statistics (admin only)
   */
  async getUserStats(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      this.requireAuth(c); // Basic auth check
      
      const stats = await this.userRepository.getUserStats();
      
      this.logResponse(c, 200);
      return this.success(c, stats);
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(c: Context): Promise<Response> {
    try {
      this.logRequest(c);
      
      const userId = this.requireAuth(c);
      const preferences: Record<string, unknown> = this.validateBody(c);
      
      const result = await this.userRepository.updatePreferences(userId, preferences);
      
      if (!result.success || !result.data?.[0]) {
        throw this.internalError('Failed to update preferences');
      }

      const user = result.data[0];
      const userResponse: UserResponse = {
        id: user.id,
        email: user.email,
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        isActive: user.isActive,
        preferences: user.preferences ? JSON.parse(user.preferences as string) : undefined,
      };

      this.logResponse(c, 200);
      return this.success(c, userResponse, 'Preferences updated successfully');
    } catch (error) {
      return this.handleError(c, error);
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Hash password (mock implementation)
   */
  private async hashPassword(password: string): Promise<string> {
    // In a real implementation, use a proper password hashing library
    return `hashed_${password}`;
  }
}