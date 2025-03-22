import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DistributedMutex } from "@apiratorjs/locking";
import { createRedisLockFactory } from "@apiratorjs/locking-redis";
import { LockingFactory, LockingModule } from "../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Redis Distributed Mutex", () => {
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
              url: "redis://localhost:6379/0",
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

  it("should create and release a distributed mutex", async () => {
    // Create a distributed mutex instance via the LockingFactory.
    const mutex: DistributedMutex = lockingFactory.createDistributedMutex({
      name: "test-mutex",
    });
    expect(await mutex.isLocked()).toBeFalsy();

    const releaser = await mutex.acquire();
    expect(await mutex.isLocked()).toBeTruthy();

    await releaser.release();
    expect(await mutex.isLocked()).toBeFalsy();

    await mutex.destroy();
  });

  it("should ensure mutual exclusion with distributed mutex", async () => {
    const mutex: DistributedMutex = lockingFactory.createDistributedMutex({
      name: "test-mutex",
    });
    const releaser1 = await mutex.acquire();

    let acquired = false;
    const acquirePromise = mutex.acquire().then(async (releaser2) => {
      acquired = true;
      await releaser2.release();
    });

    // Wait a bit before checking that the second acquire is still pending.
    await sleep(300);
    expect(acquired).toBeFalsy();

    await releaser1.release();
    await acquirePromise;
    expect(acquired).toBeTruthy();

    await mutex.destroy();
  });

  it("should run an exclusive callback via runExclusive", async () => {
    const mutex: DistributedMutex = lockingFactory.createDistributedMutex({
      name: "test-mutex",
    });
    let sideEffect = false;
    await mutex.runExclusive(async () => {
      // The mutex should be locked inside the callback.
      expect(await mutex.isLocked()).toBeTruthy();
      sideEffect = true;
    });
    expect(sideEffect).toBeTruthy();
    expect(await mutex.isLocked()).toBeFalsy();
    await mutex.destroy();
  });

  it("should release the lock even if runExclusive callback throws an error", async () => {
    const mutex: DistributedMutex = lockingFactory.createDistributedMutex({
      name: "test-mutex",
    });
    let errorThrown = false;

    try {
      await mutex.runExclusive(async () => {
        throw new Error("Error in runExclusive");
      });
    } catch (err) {
      errorThrown = true;
    }

    expect(errorThrown).toBeTruthy();
    expect(await mutex.isLocked()).toBeFalsy();
    await mutex.destroy();
  });
});
