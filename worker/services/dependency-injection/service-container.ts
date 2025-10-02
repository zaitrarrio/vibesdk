/**
 * Simple dependency injection container for services
 */

export interface ServiceIdentifier<T> {
  readonly symbol: symbol;
}

export interface ServiceDefinition<T> {
  factory: () => T;
  singleton: boolean;
  dependencies?: ServiceIdentifier<unknown>[];
}

export class ServiceContainer {
  private readonly services = new Map<symbol, ServiceDefinition<unknown>>();
  private readonly instances = new Map<symbol, unknown>();

  /**
   * Register a service with the container
   */
  register<T>(
    identifier: ServiceIdentifier<T>,
    factory: () => T,
    options: {
      singleton?: boolean;
      dependencies?: ServiceIdentifier<unknown>[];
    } = {}
  ): void {
    this.services.set(identifier.symbol, {
      factory,
      singleton: options.singleton ?? true,
      dependencies: options.dependencies ?? [],
    });
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(
    identifier: ServiceIdentifier<T>,
    factory: () => T,
    dependencies?: ServiceIdentifier<unknown>[]
  ): void {
    this.register(identifier, factory, { singleton: true, dependencies });
  }

  /**
   * Register a transient service
   */
  registerTransient<T>(
    identifier: ServiceIdentifier<T>,
    factory: () => T,
    dependencies?: ServiceIdentifier<unknown>[]
  ): void {
    this.register(identifier, factory, { singleton: false, dependencies });
  }

  /**
   * Resolve a service from the container
   */
  resolve<T>(identifier: ServiceIdentifier<T>): T {
    const definition = this.services.get(identifier.symbol);
    if (!definition) {
      throw new Error(`Service not registered: ${identifier.symbol.toString()}`);
    }

    // Return existing instance if singleton
    if (definition.singleton && this.instances.has(identifier.symbol)) {
      return this.instances.get(identifier.symbol) as T;
    }

    // Resolve dependencies
    const dependencies = definition.dependencies?.map(dep => this.resolve(dep)) ?? [];

    // Create new instance
    const instance = definition.factory.apply(null, dependencies) as T;

    // Store instance if singleton
    if (definition.singleton) {
      this.instances.set(identifier.symbol, instance);
    }

    return instance;
  }

  /**
   * Check if a service is registered
   */
  isRegistered<T>(identifier: ServiceIdentifier<T>): boolean {
    return this.services.has(identifier.symbol);
  }

  /**
   * Clear all registered services and instances
   */
  clear(): void {
    this.services.clear();
    this.instances.clear();
  }

  /**
   * Get all registered service identifiers
   */
  getRegisteredServices(): symbol[] {
    return Array.from(this.services.keys());
  }
}

/**
 * Create a service identifier
 */
export function createServiceIdentifier<T>(name: string): ServiceIdentifier<T> {
  return {
    symbol: Symbol(name),
  };
}

/**
 * Global service container instance
 */
export const serviceContainer = new ServiceContainer();