function emptyToNull(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugToText(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function generateSlug(...parts) {
  const base = parts
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "tatuador";
}

function titleCase(value) {
  return slugToText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = { emptyToNull, escapeHtml, generateSlug, slugToText, titleCase };
