// import { DynamicModule, Module, OnApplicationShutdown } from '@nestjs/common';
// import IORedis, { Redis, RedisOptions } from 'ioredis';

// export const IORedisKey = 'IORedis';

// type RedisModuleOptions = {
//   connectionOptions: RedisOptions;
//   onClientReady?: (client: Redis) => void;
// };

// type RedisModuleAsyncOptions = {
//   useFactory: (
//     ...args: any[]
//   ) => Promise<RedisModuleOptions> | RedisModuleOptions;
//   inject?: any[];
//   imports?: any[];
// };

// @Module({})
// export class RedisModule implements OnApplicationShutdown {
//   private client: Redis;

//   onApplicationShutdown() {
//     this.client.quit();
//   }

//   static async registerAsync({
//     useFactory,
//     inject,
//     imports,
//   }: RedisModuleAsyncOptions): Promise<DynamicModule> {
//     const redisProvider = {
//       provide: IORedisKey,
//       useFactory: async (...args: any[]) => {
//         const { connectionOptions, onClientReady } = await useFactory(...args);
//         const client = new IORedis(connectionOptions);
//         if (onClientReady) {
//           onClientReady(client);
//         }
//         return client;
//       },
//       inject,
//     };
//     return {
//       module: RedisModule,
//       imports,
//       providers: [redisProvider],
//       exports: [redisProvider],
//     };
//   }
// }
