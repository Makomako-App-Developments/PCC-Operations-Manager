const reportModule = "../lib/storm-patrol-report-pdf.ts";

try {
  await import(reportModule);
  process.stdout.write("API runtime dependency smoke check passed.\n");
} catch (error) {
  process.stderr.write(
    "API runtime dependency smoke check failed. The installed workspace is missing or cannot load a runtime dependency required by the storm patrol report module.\n",
  );
  console.error(error);
  process.exitCode = 1;
}