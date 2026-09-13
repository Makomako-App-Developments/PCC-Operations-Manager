async function checkReportRuntime() {
  try {
    const { prepareStormPatrolReportPhoto } = await import(
      "../lib/storm-patrol-report-pdf"
    );
    const image = await prepareStormPatrolReportPhoto(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );

    if (image.length === 0) {
      throw new Error("sharp returned an empty report image");
    }

    process.stdout.write("Storm patrol report image support is available.\n");
  } catch (error) {
    process.stderr.write(
      "Storm patrol report runtime check failed: the production API image cannot load or use its native image support (sharp).\n",
    );
    console.error(error);
    process.exitCode = 1;
  }
}

void checkReportRuntime();