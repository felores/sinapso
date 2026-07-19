const url = `${process.env.SINAPSO_API_URL ?? "http://127.0.0.1:5175"}/api/graph`;

for (;;) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    // The backend is still loading the vault.
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}
