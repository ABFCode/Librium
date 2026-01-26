import { action } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";
const parserUrl = process.env.PARSER_URL ?? "http://localhost:8081/parse";

export const importBook = action({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runMutation("users:ensureViewer", {});

    const importJobId = await ctx.runMutation("importJobs:createImportJobInternal", {
      userId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      contentType: args.contentType,
      storageId: args.storageId,
    });

    await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
      importJobId,
      status: "parsing",
    });

    const fileBlob = await getStorageBlob(ctx, args.storageId);
    if (!fileBlob) {
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: "Missing stored file",
      });
      throw new Error("Missing stored file");
    }

    const formData = new FormData();
    formData.append("file", fileBlob, args.fileName);
    let response: Response;
    try {
      response = await fetch(parserUrl, {
        method: "POST",
        body: formData,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? `Parser service unavailable: ${err.message}`
          : "Parser service unavailable. Is it running?";
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: message,
      });
      throw new Error(message);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: body?.error ?? "Parser error",
      });
      throw new Error(body?.error ?? "Parser error");
    }

    const parsedResponse = ParserResponseSchema.safeParse(body);
    if (!parsedResponse.success) {
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: "Parser response invalid",
      });
      throw new Error("Parser response invalid");
    }
    const parsed = parsedResponse.data;

    await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
      importJobId,
      status: "ingesting",
    });

    try {
      const meta = parsed.metadata ?? {};
      const cover = parsed.cover;
      let coverStorageId: string | undefined;
      let coverContentType: string | undefined;

      if (cover?.data) {
        try {
          const coverBinary = base64ToBytes(cover.data);
          const coverBlob = new Blob([coverBinary], {
            type: cover.contentType ?? "image/jpeg",
          });
          coverStorageId = await storeBlob(ctx, coverBlob);
          coverContentType = cover.contentType ?? undefined;
        } catch {
          // ignore cover upload failures
        }
      }

      const parsedTitle = meta.title || args.fileName.replace(/\.epub$/i, "");
      const authorList = meta.authors ?? [];
      const author = authorList.length > 0 ? authorList.join(", ") : undefined;
      const language = meta.language || undefined;

      const bookId = await ctx.runMutation("books:createBook", {
        title: parsedTitle,
        author,
        language,
        publisher: meta.publisher || undefined,
        publishedAt: meta.publishedAt || undefined,
        series: meta.series || undefined,
        seriesIndex: meta.seriesIndex || undefined,
        subjects: meta.subjects ?? undefined,
        coverStorageId: coverStorageId ?? undefined,
        coverContentType: coverContentType ?? undefined,
        identifiers: meta.identifiers ?? undefined,
      });

      await ctx.runMutation("bookFiles:createBookFile", {
        bookId,
        storageId: args.storageId,
        fileName: args.fileName,
        fileSize: args.fileSize,
        contentType: args.contentType ?? undefined,
      });

      await ctx.runMutation("userBooks:upsertUserBook", { bookId });

      if (parsed.sections && parsed.chunks) {
        await ctx.runAction("ingest:ingestParsedBook", {
          bookId,
          sections: parsed.sections,
          chunks: parsed.chunks,
          sectionBlocks: parsed.sectionBlocks ?? undefined,
          images: parsed.images ?? undefined,
        });
      }

      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "completed",
        bookId,
      });

      return { bookId, importJobId };
    } catch (err) {
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Import failed",
      });
      throw err;
    }
  },
});

const getStorageBlob = async (
  ctx: Parameters<typeof importBook.handler>[0],
  storageId: string,
) => {
  if (typeof ctx.storage.get === "function") {
    const blob = await ctx.storage.get(storageId);
    if (blob) {
      return blob;
    }
  }
  const url = await ctx.runMutation("storage:getFileUrl", {
    storageId,
  });
  if (!url) {
    return null;
  }
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return await response.blob();
};

const storeBlob = async (
  ctx: Parameters<typeof importBook.handler>[0],
  blob: Blob,
) => {
  if (typeof ctx.storage.store === "function") {
    return await ctx.storage.store(blob);
  }
  const uploadUrl = await ctx.runMutation("storage:generateUploadUrl", {});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: blob.type ? { "Content-Type": blob.type } : undefined,
    body: blob,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.storageId) {
    throw new Error("Failed to upload blob to storage.");
  }
  return body.storageId as string;
};

const base64ToBytes = (data: string) => {
  if (typeof atob === "function") {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(data, "base64"));
  }
  throw new Error("Base64 decoding is not supported in this runtime.");
};

const IdentifierSchema = z.object({
  id: z.string(),
  scheme: z.string(),
  value: z.string(),
  type: z.string(),
});

const MetadataSchema = z
  .object({
    title: z.string().optional(),
    authors: z.array(z.string()).optional(),
    language: z.string().optional(),
    publisher: z.string().optional(),
    publishedAt: z.string().optional(),
    series: z.string().optional(),
    seriesIndex: z.string().optional(),
    subjects: z.array(z.string()).optional(),
    identifiers: z.array(IdentifierSchema).optional(),
  })
  .optional();

const SectionSchema = z.object({
  title: z.string(),
  orderIndex: z.number(),
  depth: z.number(),
  parentOrderIndex: z.number().optional(),
  href: z.string().optional(),
  anchor: z.string().optional(),
});

const ChunkSchema = z.object({
  sectionOrderIndex: z.number(),
  chunkIndex: z.number(),
  startOffset: z.number(),
  endOffset: z.number(),
  wordCount: z.number(),
  content: z.string(),
});

const InlineSchema = z.object({
  kind: z.string(),
  text: z.string().optional(),
  href: z.string().optional(),
  src: z.string().optional(),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  emph: z.boolean().optional(),
  strong: z.boolean().optional(),
});

const TableCellSchema = z.object({
  inlines: z.array(InlineSchema),
  header: z.boolean().optional(),
});

const TableSchema = z.object({
  rows: z.array(z.object({ cells: z.array(TableCellSchema) })),
});

const FigureSchema = z.object({
  images: z.array(InlineSchema),
  caption: z.array(InlineSchema),
});

const BlockSchema = z.object({
  kind: z.string(),
  level: z.number().optional(),
  ordered: z.boolean().optional(),
  listIndex: z.number().optional(),
  inlines: z.array(InlineSchema).optional(),
  table: TableSchema.optional(),
  figure: FigureSchema.optional(),
  anchors: z.array(z.string()).optional(),
});

const SectionBlocksSchema = z.object({
  sectionOrderIndex: z.number(),
  blocks: z.array(BlockSchema),
});

const ImageSchema = z.object({
  href: z.string(),
  contentType: z.string().optional(),
  data: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const CoverSchema = z
  .object({
    data: z.string(),
    contentType: z.string().optional(),
  })
  .optional();

const ParserResponseSchema = z
  .object({
    metadata: MetadataSchema,
    cover: CoverSchema,
    sections: z.array(SectionSchema).optional(),
    chunks: z.array(ChunkSchema).optional(),
    sectionBlocks: z.array(SectionBlocksSchema).optional(),
    images: z.array(ImageSchema).optional(),
  })
  .passthrough();
