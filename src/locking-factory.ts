import { Inject, Injectable, OnModuleInit, Optional } from "@nestjs/common";
import {
  DistributedMutex,
  DistributedSemaphore,
  Mutex,
  Semaphore,
  types,
} from "@apiratorjs/locking";
import {
  ILockingFactoryImpl,
  LockingFactoryImplToken,
} from "./locking-factory-interface";

@Injectable()
export class LockingFactory implements OnModuleInit {
  public constructor(
    @Optional()
    @Inject(LockingFactoryImplToken)
    private readonly _lockingFactoryImpl?: ILockingFactoryImpl,
  ) {}

  async onModuleInit() {
    if (this._lockingFactoryImpl) {
      DistributedMutex.factory =
        this._lockingFactoryImpl.createDistributedMutex;
      DistributedSemaphore.factory =
        this._lockingFactoryImpl.createDistributedSemaphore;
    }
  }

  public createMutex(): Mutex {
    return new Mutex();
  }

  public createSemaphore(maxCount: number): Semaphore {
    return new Semaphore(maxCount);
  }

  public createDistributedMutex(
    props: types.DistributedMutexConstructorProps,
  ): DistributedMutex {
    return new DistributedMutex(props);
  }

  public createDistributedSemaphore(
    props: types.DistributedSemaphoreConstructorProps,
  ): DistributedSemaphore {
    return new DistributedSemaphore(props);
  }
}
