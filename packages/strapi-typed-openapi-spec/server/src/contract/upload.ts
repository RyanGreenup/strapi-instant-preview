import type { Zod } from "../adapter";
import type { RouteEntry } from "../catalog";
import type { SchemaObject, Schemas } from "../schemas";
import type { BuiltInContract } from "./built-ins";

import { fileUid } from "../schemas";
import { modelResponse } from "./model-response";

/**
 * Supplies request overlays only where Strapi has no upstream request schema.
 * The upload action is an exception: it supplies multipart and JSON schemas.
 */
export function uploadContracts(z: Zod, schemas: Schemas) {
  const { file, error } = schemas;
  const id = z.union([z.number().int().positive(), z.string().min(1)]);
  const query = {
    fields: z.union([z.string(), z.array(z.string())]).optional(),
    populate: z
      .union([
        z.string(),
        z.array(z.string()),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
    sort: z
      .union([
        z.string(),
        z.array(z.string()),
        z.record(z.string(), z.string()),
      ])
      .optional(),
    pagination: z
      .object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().optional(),
        start: z.number().int().nonnegative().optional(),
        limit: z.number().int().optional(),
        withCount: z.boolean().optional(),
      })
      .optional(),
    filters: z.record(z.string(), z.unknown()).optional(),
  };
  const files = z.array(file);
  const meta = z.object({
    pagination: z.union([
      z.object({
        page: z.number().int(),
        pageSize: z.number().int(),
        pageCount: z.number().int().optional(),
        total: z.number().int().optional(),
      }),
      z.object({
        start: z.number().int(),
        limit: z.number().int(),
        total: z.number().int().optional(),
      }),
    ]),
  });
  const paginatedFiles = z.object({ data: files, meta });
  // The folder controller (content-api-folder) selects fixed FIELDS and
  // populates parent with documentId only, then adds namePath. Those lists are
  // private to the controller, so they are named here and checked against the model.
  const folderUid = "plugin::upload.folder";
  let folderSchema: SchemaObject | undefined;
  const folder = () =>
    (folderSchema ??= (() => {
      const fields = modelResponse(
        schemas,
        folderUid,
        ["id", "documentId", "name", "path", "createdAt", "updatedAt"],
        "Upload folder responses",
      );
      const parent = modelResponse(
        schemas,
        folderUid,
        ["id", "documentId"],
        "Upload folder parent",
      );
      return fields.extend({
        path: fields.shape.path.describe(
          "Folder path made of numeric path IDs.",
        ),
        namePath: z
          .string()
          .optional()
          .describe("Folder path made of folder names."),
        // Left out when the sanitizer removes the relation; null for a root folder.
        parent: parent.nullable().optional(),
      });
    })());
  const fileInfo = z.object({
    name: z.string().nullish(),
    alternativeText: z.string().nullish(),
    caption: z.string().nullish(),
    focalPoint: z
      .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
      .nullish(),
  });
  const binary = z.string().meta({ format: "binary" });
  const encodedInfo = z.string().meta({ contentMediaType: "application/json" });
  const multipart = z.object({
    files: z
      .union([binary, z.array(binary).min(1)])
      .optional()
      .describe(
        "Required for new uploads; omit when updating only file metadata.",
      ),
    ref: z
      .string()
      .optional()
      .describe("UID of the content type to link the uploaded files to."),
    refId: z
      .string()
      .optional()
      .describe("Entry id or documentId to link the uploaded files to."),
    field: z.string().optional().describe("Media field on the linked entry."),
    path: z
      .string()
      .optional()
      .describe("Storage path, where supported by the upload provider."),
    folder: z
      .union([z.number().int().positive(), z.literal("null")])
      .optional()
      .describe(
        'Media Library folder ID, or the string "null" for the root. Omit to use API Uploads.',
      ),
    fileInfo: z
      .union([encodedInfo, z.array(encodedInfo)])
      .optional()
      .describe(
        "JSON-encoded name, caption, alternativeText, and focalPoint. Use one entry per file for batch uploads.",
      ),
  });
  const handlers: Record<string, BuiltInContract> = {
    "content-api.upload": {
      response: { 200: file, 201: files, 413: error },
      request: {
        query: { id: id.optional() },
        body: {
          "multipart/form-data": multipart,
          "application/json": z
            .object({ fileInfo: fileInfo.optional() })
            .optional()
            .describe("Metadata-only update for the file selected by id."),
        },
      },
    },
    "content-api.find": {
      response: files,
      request: { query },
      queryModel: fileUid,
    },
    "content-api.findPage": {
      response: paginatedFiles,
      request: { query },
      queryModel: fileUid,
    },
    "content-api.findOne": {
      response: file,
      request: {
        params: { id },
        query: { fields: query.fields, populate: query.populate },
      },
      queryModel: fileUid,
    },
    "content-api.destroy": { response: file, request: { params: { id } } },
  };
  const folderHandlers: Record<string, () => BuiltInContract> = {
    "folder.find": () => ({
      response: z.object({ data: z.array(folder()), meta }),
      request: {
        query: {
          sort: query.sort,
          pagination: query.pagination,
          filters: query.filters,
        },
      },
    }),
    "folder.findOne": () => ({
      response: z.object({ data: folder() }),
      request: { params: { id } },
    }),
  };
  return (route: RouteEntry, action: string): BuiltInContract | undefined => {
    const contract = Object.hasOwn(handlers, action)
      ? handlers[action]
      : Object.hasOwn(folderHandlers, action)
        ? folderHandlers[action]()
        : undefined;
    if (
      !contract ||
      action === "content-api.upload" ||
      route.upstream.request === undefined
    )
      return contract;
    return {
      response: contract.response,
      ...(contract.queryModel && { queryModel: contract.queryModel }),
    };
  };
}
