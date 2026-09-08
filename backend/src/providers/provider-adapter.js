export async function callProvider() {
  // Keyless providers are allowlisted server-side. Browser clients never
  // choose an upstream URL or supply provider credentials.
  return {
    ok: true,
    service: "api-gateway",
    status: "ready",
    providers: {
      wikimedia: true,
      crossref: true,
      europepmc: true,
      openlibrary: true
    },
    message: "Wikimedia web search, Crossref research search, Europe PMC literature search, and Open Library book search are configured."
  };
}
