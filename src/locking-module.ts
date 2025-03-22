import { DynamicModule, Global, Module, ModuleMetadata } from "@nestjs/common";
import { LockingFactory } from "./locking-factory";
import {
  ILockingFactoryImpl,
  LockingFactoryImplToken,
} from "./locking-factory-interface";

export interface IDistributedLockingConfiguration
  extends Pick<ModuleMetadata, "imports"> {
  inject: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<ILockingFactoryImpl> | ILockingFactoryImpl;
}

@Global()
@Module({
  providers: [LockingFactory],
  exports: [LockingFactory],
})
export class LockingModule {
  static configureDistributedLocking(
    options: IDistributedLockingConfiguration,
  ): DynamicModule {
    return {
      module: LockingModule,

      global: true,

      providers: [
        LockingFactory,
        {
          provide: LockingFactoryImplToken,
          inject: options.inject,
          useFactory: options.useFactory,
        },
      ],

      exports: [LockingFactory],
    };
  }
}
