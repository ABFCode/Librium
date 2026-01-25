import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  authProvider: v.string(),
  externalId: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_external_id", ["authProvider", "externalId"]);

const books = defineTable({
  ownerId: v.id("users"),
  title: v.string(),
  author: v.optional(v.string()),
  language: v.optional(v.string()),
  publisher: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
  series: v.optional(v.string()),
  seriesIndex: v.optional(v.string()),
  subjects: v.optional(v.array(v.string())),
  coverStorageId: v.optional(v.id("_storage")),
  coverContentType: v.optional(v.string()),
  identifiers: v.optional(
    v.array(
      v.object({
        id: v.string(),
        scheme: v.string(),
        value: v.string(),
        type: v.string(),
      }),
    ),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_owner", ["ownerId", "updatedAt"]);

const bookFiles = defineTable({
  bookId: v.id("books"),
  storageId: v.id("_storage"),
  fileName: v.string(),
  fileSize: v.number(),
  contentType: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_book", ["bookId"]);

const sections = defineTable({
  bookId: v.id("books"),
  parentId: v.optional(v.id("sections")),
  title: v.string(),
  href: v.optional(v.string()),
  anchor: v.optional(v.string()),
  orderIndex: v.number(),
  depth: v.number(),
  textStorageId: v.optional(v.id("_storage")),
  textSize: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_book", ["bookId"])
  .index("by_book_order", ["bookId", "orderIndex"]);

const importJobs = defineTable({
  userId: v.id("users"),
  bookId: v.optional(v.id("books")),
  storageId: v.optional(v.id("_storage")),
  fileName: v.string(),
  fileSize: v.number(),
  contentType: v.optional(v.string()),
  status: v.string(),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
}).index("by_user_created", ["userId", "createdAt"]);

const userBooks = defineTable({
  userId: v.id("users"),
  bookId: v.id("books"),
  lastSectionId: v.optional(v.id("sections")),
  lastChunkIndex: v.number(),
  lastChunkOffset: v.number(),
  updatedAt: v.number(),
})
  .index("by_user_book", ["userId", "bookId"])
  .index("by_user_updated", ["userId", "updatedAt"])
  .index("by_book", ["bookId"]);

const userSettings = defineTable({
  userId: v.id("users"),
  fontScale: v.number(),
  lineHeight: v.number(),
  contentWidth: v.number(),
  theme: v.string(),
  updatedAt: v.number(),
}).index("by_user", ["userId"]);

const bookmarks = defineTable({
  userId: v.id("users"),
  bookId: v.id("books"),
  sectionId: v.id("sections"),
  chunkIndex: v.number(),
  offset: v.number(),
  label: v.optional(v.string()),
  createdAt: v.number(),
}).index("by_user_book", ["userId", "bookId"]);

export default defineSchema({
  users,
  books,
  bookFiles,
  sections,
  importJobs,
  userBooks,
  userSettings,
  bookmarks,
});
