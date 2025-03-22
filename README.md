# NestJS Locking

[![NPM version](https://img.shields.io/npm/v/nest-apirator-locking.svg)](https://www.npmjs.com/package/nest-apirator-locking)
[![License: MIT](https://img.shields.io/npm/l/nest-apirator-locking.svg)](https://github.com/I-Lotus/nest-apirator-locking/blob/main/LICENSE)

A NestJS module that provides distributed locking capabilities using Redis and
the [@apiratorjs/locking](https://github.com/apiratorjs/locking) libraries. This module offers robust implementations
for distributed mutexes and semaphores, enabling synchronized access to critical sections in distributed systems.

> **Note:** Requires Node.js version **>=16.4.0**

---

## Features

- **Distributed Mutex:**
    - Provides exclusive locking mechanisms for critical sections.

- **Distributed Semaphore:**
    - Allows limited concurrent access, managing resource pools effectively.

- **Dynamic NestJS Module:**
    - Easy integration with your NestJS applications through a dynamic configuration module.

- **Redis Backed:**
    - Utilizes Redis to coordinate distributed locks reliably.

---

## Installation

Install the package via npm:

```bash
npm install nest-apirator-locking
```

Or with yarn:

```bash
yarn add nest-apirator-locking
```

To add Redis support, install the [@apiratorjs/locking-redis](https://github.com/apiratorjs/locking-redis) package:

```bash
npm install nest-apirator-locking @apiratorjs/locking-redis
````

--- 

## Usage

### Import Module

Integrate the locking module in your NestJS application by importing it in your root or feature module. Use the dynamic
configuration to set up your Redis connection:

To use in memory implementation:

```typescript
import { Module } from '@nestjs/common';
import { LockingModule } from 'nest-apirator-locking';

@Module({
  imports: [
    LockingModule,
  ],
})
export class AppModule {
}
```

To use Redis implementation:

```typescript
import { Module } from '@nestjs/common';
import { LockingModule } from 'nest-apirator-locking';
import { createRedisLockFactory } from "@apiratorjs/locking-redis";

@Module({
  imports: [
    LockingModule.configureDistributedLocking({
      useFactory: async () => {
        const factory = await createRedisLockFactory({
          url: "redis://localhost:6379/0",
        });

        return {
          createDistributedMutex: factory.createDistributedMutex,
          createDistributedSemaphore: factory.createDistributedSemaphore,
        };
      },
    }),
  ],
})
export class AppModule {
}
````

Inject LockingFactory into your services or controllers to create and manage locks.
LockingFactory supports all the features of [@apiratorjs/locking](https://github.com/apiratorjs/locking)

```typescript
import { Injectable } from '@nestjs/common';
import { LockingFactory } from 'nestjs-locking';
import { DistributedMutex } from '@apiratorjs/locking';

@Injectable()
export class SampleService {
  constructor(private readonly lockingFactory: LockingFactory) {}

  async performCriticalTask() {
    const mutex: DistributedMutex = this.lockingFactory.createDistributedMutex({ name: 'critical-section' });

    // Acquire the mutex
    const releaser = await mutex.acquire();

    try {
      // Critical section: execute exclusive task here
      console.log('Executing critical task exclusively');
    } finally {
      // Always release the mutex
      await releaser.release();
    }

    // Clean up any lingering resources
    await mutex.destroy();
  }
}
```

```typescript
import { Injectable } from '@nestjs/common';
import { LockingFactory } from 'nestjs-locking';
import { types } from '@apiratorjs/locking';

@Injectable()
export class SampleService {
  constructor(private readonly lockingFactory: LockingFactory) {}

  async performCriticalTask() {
    const mutex: types.IMutex = this.lockingFactory.createMutex();

    // Acquire the mutex
    const releaser = await mutex.acquire();

    try {
      // Critical section: execute exclusive task here
      console.log('Executing critical task exclusively');
    } finally {
      // Always release the mutex
      await releaser.release();
    }

    // Clean up any lingering resources
    await mutex.destroy();
  }
}
```

---

## Contributing

Contributions, issues, and feature requests are welcome!
Please open an issue or submit a pull request on [GitHub](https://github.com/apiratorjs/locking-redis).
