import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { TEmailTokenType } from '../auth/email-token.model.js';
import type { TPriority } from '../todos/priority.js';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    username: text('username').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    // Null until the user follows the link in the verification email; they cannot log in before that
    emailVerifiedAt: text('email_verified_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
    uniqueIndex('users_username_unique').on(sql`lower(${table.username})`),
  ],
);

export const sessions = sqliteTable('sessions', {
  // SHA-256 hash of the cookie token, never the token itself
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});

/** Single-use links sent by email: verifying an address, or resetting a password. */
export const emailTokens = sqliteTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<TEmailTokenType>().notNull(),
    // SHA-256 hash of the token in the link, never the token itself
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('email_tokens_hash_unique').on(table.tokenHash)],
);

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
  },
  // Names are unique per user, ignoring case: two people can both have a "Work" label
  (table) => [uniqueIndex('labels_user_name_unique').on(table.userId, sql`lower(${table.name})`)],
);

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull(),
  priority: text('priority').$type<TPriority>().notNull(),
  dueDate: text('due_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const todoLabels = sqliteTable(
  'todo_labels',
  {
    todoId: text('todo_id')
      .notNull()
      .references(() => todos.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.todoId, table.labelId] })],
);
