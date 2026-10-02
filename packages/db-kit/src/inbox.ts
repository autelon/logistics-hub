import { and, eq } from 'drizzle-orm';
import { mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core';

import { idColumn, newId, utcDateTime } from './columns.js';
import type { AnyDb } from './db.js';

/** 이미 처리한 메시지 기록. at-least-once 전달을 멱등하게 만든다. */
export const processedMessages = mysqlTable(
  'processed_messages',
  {
    id: idColumn().primaryKey(),
    consumerGroup: varchar({ length: 100 }).notNull(),
    messageId: varchar({ length: 36 }).notNull(),
    processedAt: utcDateTime().notNull(),
  },
  (t) => [unique('processed_messages_group_message_uq').on(t.consumerGroup, t.messageId)],
);

/**
 * 업무 처리와 같은 트랜잭션 안에서 호출한다.
 * 처음 보는 메시지면 기록하고 true, 이미 처리했으면 false.
 * usecase 에서는 tx 를 넘기지 않는 `MessageInbox.claim` (`@repo/nest-kit/message-inbox`) 을 쓴다.
 */
export const claimMessage = async (tx: AnyDb, consumerGroup: string, messageId: string) => {
  const seen = await tx
    .select({ messageId: processedMessages.messageId })
    .from(processedMessages)
    .where(
      and(
        eq(processedMessages.consumerGroup, consumerGroup),
        eq(processedMessages.messageId, messageId),
      ),
    )
    .limit(1);
  if (seen.length > 0) return false;
  await tx
    .insert(processedMessages)
    .values({ id: newId(), consumerGroup, messageId, processedAt: new Date() });
  return true;
};
