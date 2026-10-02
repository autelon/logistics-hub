import type { MySql2Database } from 'drizzle-orm/mysql2';

import type * as schema from './schema.js';

export type Db = MySql2Database<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
