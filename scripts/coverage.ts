const suites = [
  "packages/types/test",
  "packages/cache/test",
  "packages/rest/test",
  "packages/structures/test",
  "packages/commands/test",
  "packages/client/test",
  "packages/gateway/test",
] as const;

for (const suite of suites) {
  console.log(`Running coverage for ${suite}.`);
  const test = Bun.spawn(
    [process.execPath, "test", "--parallel=1", "--coverage", suite],
    {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const exitCode = await test.exited;
  if (exitCode !== 0) process.exit(exitCode);
}
