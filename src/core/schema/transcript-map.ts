import { z } from "zod";

import { TRANSCRIPT_MAP_SCHEMA_VERSION } from "../config.js";

export const transcriptMapNodeTypes = [
  "thesis",
  "claim",
  "evidence",
  "example",
  "counterpoint",
  "conclusion"
] as const;

export const transcriptMapEdgeRelationships = [
  "contains",
  "supports",
  "explains",
  "contrasts",
  "leads_to",
  "concludes"
] as const;

function optionalFromNull<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (value === null ? undefined : value),
    schema.optional()
  );
}

const transcriptSpanSchema = z.object({
  excerpt: z
    .string()
    .min(1, "Every node should include an excerpt that grounds it in the transcript."),
  startChar: optionalFromNull(z.number().int().nonnegative()),
  endChar: optionalFromNull(z.number().int().nonnegative())
});

export const transcriptMapNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(transcriptMapNodeTypes),
  label: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  sectionId: z.string().min(1),
  transcriptSpan: transcriptSpanSchema,
  confidence: optionalFromNull(z.number().min(0).max(1)),
  isInferred: optionalFromNull(z.boolean())
});

export const transcriptMapSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  order: z.number().int().nonnegative(),
  nodeIds: z.array(z.string().min(1)).min(1)
});

export const transcriptMapEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationship: z.enum(transcriptMapEdgeRelationships),
  explanation: optionalFromNull(z.string().min(1).max(280))
});

export const transcriptMapSchema = z
  .object({
    version: z.literal(TRANSCRIPT_MAP_SCHEMA_VERSION),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(500),
    thesisNodeId: z.string().min(1),
    sections: z.array(transcriptMapSectionSchema).min(1).max(8),
    nodes: z.array(transcriptMapNodeSchema).min(3).max(64),
    edges: z.array(transcriptMapEdgeSchema).max(128),
    source: z.object({
      transcriptLengthChars: z.number().int().positive(),
      language: z.string().min(2).max(32).default("en")
    })
  })
  .superRefine((value, ctx) => {
    const sectionIds = new Set(value.sections.map((section) => section.id));
    const nodesById = new Map(value.nodes.map((node) => [node.id, node]));
    const thesisCount = value.nodes.filter((node) => node.type === "thesis").length;

    if (thesisCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Expected exactly 1 thesis node, received ${thesisCount}.`,
        path: ["nodes"]
      });
    }

    const thesisNode = nodesById.get(value.thesisNodeId);
    if (!thesisNode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "thesisNodeId must point to an existing node.",
        path: ["thesisNodeId"]
      });
    } else if (thesisNode.type !== "thesis") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "thesisNodeId must point to a node of type thesis.",
        path: ["thesisNodeId"]
      });
    }

    for (const node of value.nodes) {
      if (!sectionIds.has(node.sectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node ${node.id} references missing section ${node.sectionId}.`,
          path: ["nodes"]
        });
      }

      if (
        node.transcriptSpan.startChar !== undefined &&
        node.transcriptSpan.endChar !== undefined &&
        node.transcriptSpan.startChar > node.transcriptSpan.endChar
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Node ${node.id} has startChar greater than endChar.`,
          path: ["nodes"]
        });
      }
    }

    for (const section of value.sections) {
      for (const nodeId of section.nodeIds) {
        const node = nodesById.get(nodeId);
        if (!node) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section ${section.id} references missing node ${nodeId}.`,
            path: ["sections"]
          });
          continue;
        }

        if (node.sectionId !== section.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section ${section.id} includes node ${nodeId}, but that node belongs to ${node.sectionId}.`,
            path: ["sections"]
          });
        }
      }
    }

    for (const edge of value.edges) {
      if (!nodesById.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} source ${edge.source} does not exist.`,
          path: ["edges"]
        });
      }

      if (!nodesById.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Edge ${edge.id} target ${edge.target} does not exist.`,
          path: ["edges"]
        });
      }
    }
  });

export type TranscriptMapNodeType = (typeof transcriptMapNodeTypes)[number];
export type TranscriptMapEdgeRelationship =
  (typeof transcriptMapEdgeRelationships)[number];
export type TranscriptMap = z.infer<typeof transcriptMapSchema>;
export type TranscriptMapNode = z.infer<typeof transcriptMapNodeSchema>;
export type TranscriptMapSection = z.infer<typeof transcriptMapSectionSchema>;
export type TranscriptMapEdge = z.infer<typeof transcriptMapEdgeSchema>;

function nullableIntegerSchema(minimum: number) {
  return {
    anyOf: [
      {
        type: "integer",
        minimum
      },
      {
        type: "null"
      }
    ]
  } as const;
}

function nullableNumberSchema(minimum: number, maximum: number) {
  return {
    anyOf: [
      {
        type: "number",
        minimum,
        maximum
      },
      {
        type: "null"
      }
    ]
  } as const;
}

function nullableBooleanSchema() {
  return {
    anyOf: [
      {
        type: "boolean"
      },
      {
        type: "null"
      }
    ]
  } as const;
}

function nullableStringSchema(minLength: number, maxLength: number) {
  return {
    anyOf: [
      {
        type: "string",
        minLength,
        maxLength
      },
      {
        type: "null"
      }
    ]
  } as const;
}

export const transcriptMapJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "title",
    "summary",
    "thesisNodeId",
    "sections",
    "nodes",
    "edges",
    "source"
  ],
  properties: {
    version: {
      type: "string",
      enum: [TRANSCRIPT_MAP_SCHEMA_VERSION]
    },
    title: {
      type: "string",
      minLength: 1,
      maxLength: 200
    },
    summary: {
      type: "string",
      minLength: 1,
      maxLength: 500
    },
    thesisNodeId: {
      type: "string",
      minLength: 1
    },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "summary", "order", "nodeIds"],
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1, maxLength: 120 },
          summary: { type: "string", minLength: 1, maxLength: 400 },
          order: { type: "integer", minimum: 0 },
          nodeIds: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 }
          }
        }
      }
    },
    nodes: {
      type: "array",
      minItems: 3,
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "type",
          "label",
          "summary",
          "sectionId",
          "transcriptSpan",
          "confidence",
          "isInferred"
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          type: {
            type: "string",
            enum: [...transcriptMapNodeTypes]
          },
          label: { type: "string", minLength: 1, maxLength: 120 },
          summary: { type: "string", minLength: 1, maxLength: 500 },
          sectionId: { type: "string", minLength: 1 },
          transcriptSpan: {
            type: "object",
            additionalProperties: false,
            required: ["excerpt", "startChar", "endChar"],
            properties: {
              excerpt: { type: "string", minLength: 1 },
              startChar: nullableIntegerSchema(0),
              endChar: nullableIntegerSchema(0)
            }
          },
          confidence: nullableNumberSchema(0, 1),
          isInferred: nullableBooleanSchema()
        }
      }
    },
    edges: {
      type: "array",
      maxItems: 128,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source", "target", "relationship", "explanation"],
        properties: {
          id: { type: "string", minLength: 1 },
          source: { type: "string", minLength: 1 },
          target: { type: "string", minLength: 1 },
          relationship: {
            type: "string",
            enum: [...transcriptMapEdgeRelationships]
          },
          explanation: nullableStringSchema(1, 280)
        }
      }
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["transcriptLengthChars", "language"],
      properties: {
        transcriptLengthChars: {
          type: "integer",
          minimum: 1
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 32
        }
      }
    }
  }
} as const;

function stripNullObjectProperties(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(stripNullObjectProperties);
  }

  if (input && typeof input === "object") {
    const entries = Object.entries(input).flatMap(([key, value]) => {
      if (value === null) {
        return [];
      }

      return [[key, stripNullObjectProperties(value)]];
    });

    return Object.fromEntries(entries);
  }

  return input;
}

export function parseTranscriptMap(input: unknown): TranscriptMap {
  return transcriptMapSchema.parse(stripNullObjectProperties(input));
}
