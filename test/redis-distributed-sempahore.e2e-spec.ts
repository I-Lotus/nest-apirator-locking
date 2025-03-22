import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { createRedisLockFactory } from "@apiratorjs/locking-redis";
import { LockingFactory, LockingModule } from "../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DISTRIBUTED_SEMAPHORE_NAME = "shared-semaphore";

describe("Redis Distributed Semaphore", () => {
  let app: INestApplication;
  let lockingFactory: LockingFactory;
  let redisClient: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        LockingModule.configureDistributedLocking({
          inject: [],
          useFactory: async () => {
            const factory = await createRedisLockFactory({
              url: "redis://localhost:6379/1",
            });

            redisClient = factory.getRedisClient();

            return {
              createDistributedMutex: factory.createDistributedMutex,
              createDistributedSemaphore: factory.createDistributedSemaphore,
            };
          },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    lockingFactory = app.get<LockingFactory>(LockingFactory);
  });

  beforeEach(async () => {
    await redisClient.flushDb();
  });

  afterAll(async () => {
    await redisClient.disconnect();
    await app.close();
  });

  it("should immediately acquire and release", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    expect(await semaphore.isLocked()).toBeFalsy();
    expect(await semaphore.freeCount()).toEqual(1);

    const releaser = await semaphore.acquire();
    expect(await semaphore.isLocked()).toBeTruthy();
    expect(await semaphore.freeCount()).toEqual(0);

    await releaser.release();

    expect(await semaphore.isLocked()).toBe(false);
    expect(await semaphore.freeCount()).toBe(1);

    await semaphore.destroy();
  });

  it("should wait for semaphore to be available", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    const releaser = await semaphore.acquire();

    let acquired = false;
    const acquirePromise = semaphore.acquire().then((releaser) => {
      acquired = true;
      return releaser;
    });

    await sleep(50);
    expect(acquired).toBe(false);

    await releaser.release();
    await acquirePromise;

    expect(acquired).toBe(true);

    await semaphore.destroy();
  });

  it("should time out on acquire if semaphore is not released", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    const releaser = await semaphore.acquire();

    let error: Error | undefined;
    try {
      await semaphore.acquire({ timeoutMs: 100 });
    } catch (err: any) {
      error = err;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toBe("Timeout acquiring");

    await semaphore.destroy();
  });

  it("should cancel all pending acquisitions", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    const releaser = await semaphore.acquire();

    let error1: Error | undefined, error2: Error | undefined;
    const p1 = semaphore.acquire().catch((err) => {
      error1 = err;
    });
    const p2 = semaphore.acquire().catch((err) => {
      error2 = err;
    });

    // Allow the pending acquisitions to queue.
    await sleep(50);
    await semaphore.cancelAll();

    // Wait for both promises to settle.
    await Promise.allSettled([p1, p2]);

    expect(error1).toBeDefined();
    expect(error1!.message).toBe("Semaphore cancelled");
    expect(error2).toBeDefined();
    expect(error2!.message).toBe("Semaphore cancelled");

    await semaphore.destroy();
  });

  it("should not increase freeCount beyond maxCount on over-release", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 2,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });

    const releaser1 = await semaphore.acquire();
    const releaser2 = await semaphore.acquire();

    await releaser1.release();
    await releaser2.release();

    expect(await semaphore.isLocked()).toBe(false);

    await releaser1.release();
    expect(await semaphore.isLocked()).toBe(false);

    await semaphore.destroy();
  });

  it("should limit concurrent access according to semaphore count", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 3,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 10 }).map(async () => {
      const releaser = await semaphore.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      // Simulate asynchronous work.
      await sleep(50);
      concurrent--;
      await releaser.release();
    });

    await Promise.all(tasks);

    const freeCount = await semaphore.freeCount();
    expect(freeCount).toBe(3);
    expect(maxConcurrent).toBeLessThanOrEqual(3);

    await semaphore.destroy();
  });

  it("should share state between two instances with the same name", async () => {
    const name = "sharedSemaphore";
    const sem1 = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name,
    });
    const sem2 = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name,
    });

    expect(await sem1.freeCount()).toBe(1);
    expect(await sem2.freeCount()).toBe(1);

    const releaser1 = await sem1.acquire();

    expect(await sem1.freeCount()).toBe(0);
    expect(await sem2.freeCount()).toBe(0);

    let sem2Acquired = false;
    const acquirePromise = sem2.acquire().then((releaser) => {
      sem2Acquired = true;
      return releaser;
    });

    await sleep(50);

    expect(sem2Acquired).toBeFalsy();

    await releaser1.release();
    const releaser2 = await acquirePromise;

    expect(sem2Acquired).toBeTruthy();

    expect(await sem1.freeCount()).toBe(0);
    expect(await sem2.freeCount()).toBe(0);

    await releaser2.release();

    expect(await sem1.freeCount()).toBe(1);
    expect(await sem2.freeCount()).toBe(1);

    await sem1.destroy();
  });

  it("should cancel pending acquisitions across instances", async () => {
    const name = "sharedSemaphoreCancel";
    const sem1 = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name,
    });
    const sem2 = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name,
    });

    const releaser1 = await sem1.acquire();

    let errorFromSem2: Error;
    const pending = sem2.acquire().catch((err) => {
      errorFromSem2 = err;
    });

    await sleep(50);
    await sem1.cancelAll();

    const releaser2 = await pending;

    expect(errorFromSem2!).toBeInstanceOf(Error);
    expect(errorFromSem2!.message).toBe("Semaphore cancelled");

    await releaser1.release();
    expect(await sem1.freeCount()).toBe(1);

    await sem1.destroy();
  });

  it("should return acquired distributed token after successful acquire", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });

    const releaser = await semaphore.acquire();
    expect(releaser).toBeDefined();
    expect(releaser.getToken()).toContain(semaphore.name);

    await semaphore.destroy();
  });

  it("should be safe to call destroy multiple times", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    const releaser = await semaphore.acquire();

    await semaphore.destroy();
    await semaphore.destroy();

    expect(true).toBe(true);
  });

  it("should remove the lock and reject waiters when destroy is called while locked", async () => {
    const semaphore = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    const releaser = await semaphore.acquire();

    const semaphore2 = lockingFactory.createDistributedSemaphore({
      maxCount: 1,
      name: DISTRIBUTED_SEMAPHORE_NAME,
    });
    let semaphore2Acquired = false;
    const p = semaphore2.acquire().then(() => {
      semaphore2Acquired = true;
    });

    // Wait while semaphore2 subscription is established
    await sleep(200);

    await semaphore.destroy();

    let pError: Error | undefined;
    try {
      await p;
    } catch (err: any) {
      pError = err;
    }

    expect(pError).toBeDefined();
    expect(pError!.message).toBe("Semaphore destroyed");
    expect(semaphore2Acquired).toBe(false);

    await semaphore2.destroy();
  });
});
