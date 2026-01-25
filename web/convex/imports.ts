import { action } from "./_generated/server";
import { v } from "convex/values";
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
    const response = await fetch(parserUrl, {
      method: "POST",
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
        importJobId,
        status: "failed",
        errorMessage: body?.error ?? "Parser error",
      });
      throw new Error(body?.error ?? "Parser error");
    }

    await ctx.runMutation("importJobs:updateImportJobStatusInternal", {
      importJobId,
      status: "ingesting",
    });

    try {
      const meta = body?.metadata ?? {};
      const cover = body?.cover;
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

      const parsedTitle =
        meta?.title || args.fileName.replace(/\.epub$/i, "");
      const authorList = Array.isArray(meta?.authors) ? meta.authors : [];
      const author = authorList.length > 0 ? authorList.join(", ") : undefined;
      const language = meta?.language || undefined;

      const bookId = await ctx.runMutation("books:createBook", {
        title: parsedTitle,
        author,
        language,
        publisher: meta?.publisher || undefined,
        publishedAt: meta?.publishedAt || undefined,
        series: meta?.series || undefined,
        seriesIndex: meta?.seriesIndex || undefined,
        subjects: Array.isArray(meta?.subjects) ? meta.subjects : undefined,
        coverStorageId: coverStorageId ?? undefined,
        coverContentType: coverContentType ?? undefined,
        identifiers: Array.isArray(meta?.identifiers)
          ? meta.identifiers
          : undefined,
      });

      await ctx.runMutation("bookFiles:createBookFile", {
        bookId,
        storageId: args.storageId,
        fileName: args.fileName,
        fileSize: args.fileSize,
        contentType: args.contentType ?? undefined,
      });

      await ctx.runMutation("userBooks:upsertUserBook", { bookId });

      if (body?.sections && body?.chunks) {
        await ctx.runAction("ingest:ingestParsedBook", {
          bookId,
          sections: body.sections,
          chunks: body.chunks,
          sectionBlocks: Array.isArray(body.sectionBlocks)
            ? body.sectionBlocks
            : undefined,
          images: Array.isArray(body.images) ? body.images : undefined,
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
