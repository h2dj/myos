import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id } from './_common';
import { workspaces } from './identity';

/** Imported source identity survives soft/hard deletion to prevent accidental re-creation. */
export const externalRefs = pgTable(
  'external_refs',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('notion'),
    externalId: uuid('external_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    sourceHash: text('source_hash').notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
    mapping: jsonb('mapping').$type<Record<string, unknown>>().notNull(),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('external_refs_source_unique').on(t.workspaceId, t.provider, t.externalId)],
);
