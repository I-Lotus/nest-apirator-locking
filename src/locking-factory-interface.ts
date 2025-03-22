import {
  DistributedMutexConstructorProps,
  DistributedSemaphoreConstructorProps,
  IDistributedMutex,
  IDistributedSemaphore,
} from "@apiratorjs/locking/dist/src/types";

export const LockingFactoryImplToken = Symbol("ILockingFactoryImpl");

export interface ILockingFactoryImpl {
  createDistributedMutex(
    props: DistributedMutexConstructorProps,
  ): IDistributedMutex;

  createDistributedSemaphore(
    props: DistributedSemaphoreConstructorProps,
  ): IDistributedSemaphore;
}
