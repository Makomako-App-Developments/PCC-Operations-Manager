import { defineConfig, InputTransformerFn } from "orval";
import { readFile, writeFile } from "node:fs/promises";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
// The drift check can point Orval at a temporary output directory so checking
// the contract never rewrites the working tree.
const outputRoot = process.env.API_CODEGEN_OUTPUT_ROOT
  ? path.resolve(process.env.API_CODEGEN_OUTPUT_ROOT)
  : root;
const apiClientReactSrc = path.resolve(outputRoot, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(outputRoot, "lib", "api-zod", "src");

const stripGeneratedWorkspaceExports = async () => {
  for (const indexPath of [
    path.resolve(apiClientReactSrc, "index.ts"),
    path.resolve(apiClientReactSrc, "generated", "api.ts"),
    path.resolve(apiClientReactSrc, "generated", "api.schemas.ts"),
    path.resolve(apiZodSrc, "index.ts"),
    path.resolve(apiZodSrc, "generated", "api.ts"),
    path.resolve(apiZodSrc, "generated", "types", "index.ts"),
  ]) {
    try {
      const contents = await readFile(indexPath, "utf8");
      const cleaned = `${contents
        .split(/\r?\n/)
        .filter(
          (line) =>
            !/^export \* from '\.\/generated\/(?:api|api\.schemas|types)';$/.test(
              line,
            ) &&
            line !== "export * from './getStormPatrolReportParams';",
        )
        .join("\n")
        .trimEnd()}\n`;
      if (cleaned !== contents) await writeFile(indexPath, cleaned);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
};

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: stripGeneratedWorkspaceExports,
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      prettier: true,
      override: {
        zod: {
          version: 3,
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
          },
        },
        useDates: true,
      },
    },
    hooks: {
      afterAllFilesWrite: stripGeneratedWorkspaceExports,
    },
  },
});
