import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const generatedDirectories = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];

function runCodegen(outputRoot) {
  return new Promise((resolveProcess, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const child = spawn(
      command,
      ["--filter", "@workspace/api-spec", "run", "codegen"],
      {
        cwd: root,
        env: { ...process.env, API_CODEGEN_OUTPUT_ROOT: outputRoot },
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveProcess();
      else reject(new Error(`Orval exited with ${signal ? `signal ${signal}` : `code ${code}`}`));
    });
  });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }

  return files;
}

async function compareGeneratedFiles(outputRoot) {
  const differences = [];

  for (const directory of generatedDirectories) {
    const checkedInDirectory = join(root, directory);
    const generatedDirectory = join(outputRoot, directory);
    const checkedInFiles = await listFiles(checkedInDirectory);
    const generatedFiles = await listFiles(generatedDirectory);
    const relativeFiles = new Set([
      ...checkedInFiles.map((file) => relative(checkedInDirectory, file)),
      ...generatedFiles.map((file) => relative(generatedDirectory, file)),
    ]);

    for (const file of [...relativeFiles].sort()) {
      const checkedInFile = join(checkedInDirectory, file);
      const generatedFile = join(generatedDirectory, file);
      let checkedIn;
      let generated;

      try {
        checkedIn = await readFile(checkedInFile, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        generated = await readFile(generatedFile, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }

      if (checkedIn !== generated) differences.push(join(directory, file));
    }
  }

  return differences;
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), "pcc-api-codegen-"));

try {
  const temporaryMutator = join(
    temporaryDirectory,
    "lib/api-client-react/src/custom-fetch.ts",
  );
  await mkdir(join(temporaryDirectory, "lib/api-client-react/src"), {
    recursive: true,
  });
  await cp(join(root, "lib/api-client-react/src/custom-fetch.ts"), temporaryMutator);
  await runCodegen(temporaryDirectory);
  const differences = await compareGeneratedFiles(temporaryDirectory);

  if (differences.length > 0) {
    console.error("\nAPI contract drift detected.");
    console.error("Generated API files are stale relative to lib/api-spec/openapi.yaml:");
    for (const file of differences) console.error(`  - ${file}`);
    console.error(
      "\nRegenerate the client types with: pnpm --filter @workspace/api-spec run codegen",
    );
    process.exitCode = 1;
  } else {
    console.log("API contract and generated client files are in sync.");
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}