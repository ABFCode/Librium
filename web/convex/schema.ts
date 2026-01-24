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
  createdAt: v.number(),
})
  .index("by_book", ["bookId"])
  .index("by_book_order", ["bookId", "orderIndex"]);

const contentChunks = defineTable({
  bookId: v.id("books"),
  sectionId: v.optional(v.id("sections")),
  chunkIndex: v.number(),
  startOffset: v.number(),
  endOffset: v.number(),
  wordCount: v.number(),
  content: v.string(),
  createdAt: v.number(),
})
  .index("by_section", ["sectionId"])
  .index("by_section_index", ["sectionId", "chunkIndex"]);

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
}).index("by_user_book", ["userId", "bookId"]);

export default defineSchema({
  users,
  books,
  bookFiles,
  sections,
  contentChunks,
  importJobs,
  userBooks,
});
