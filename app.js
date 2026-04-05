const STORAGE_KEY = "media-logger-lite.entries";
const EXTRAS_OPEN_KEY = "media-logger-lite.extras-open";

const TYPE_LABELS = {
  movie: "Pelicula",
  series: "Serie",
  game: "Videojuego",
  book: "Libro",
  comic: "Comic",
  album: "Disco",
};

const STATUS_LABELS = {
  completed: "Completado",
  "in-progress": "En curso",
  planned: "Pendiente",
  paused: "Pausado",
  dropped: "Abandonado",
};

const REVISIT_LABELS = {
  movie: "Rewatch",
  series: "Rewatch",
  game: "Replay",
  book: "Reread",
  comic: "Reread",
  album: "Relisten",
};

const state = {
  entries: loadEntries(),
  filters: {
    search: "",
    typeView: "all",
    status: "all",
    sortBy: "date-desc",
  },
  editingId: null,
  coverValidationToken: 0,
};

const form = document.querySelector("#entry-form");
const template = document.querySelector("#entry-template");
const entriesGrid = document.querySelector("#entries-grid");
const typeInput = document.querySelector("#type");
const seasonInput = document.querySelector("#season");
const ratingInput = document.querySelector("#rating");
const statusInput = document.querySelector("#status");
const coverInput = document.querySelector("#cover");
const notesInput = document.querySelector("#notes");
const revisitInput = document.querySelector("#revisit");
const revisitLabel = document.querySelector("#revisit-label");
const saveButton = document.querySelector("#save-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const importInput = document.querySelector("#import-file");
const typeTabs = [...document.querySelectorAll(".tab-button")];
const seasonField = document.querySelector("#field-season");
const revisitField = document.querySelector("#field-revisit");
const extraFields = document.querySelector("#extra-fields");
const toggleExtrasButton = document.querySelector("#toggle-extras");
const coverPreview = document.querySelector("#cover-preview");
const coverPreviewImage = document.querySelector("#cover-preview-image");
const toast = document.querySelector("#app-toast");

let toastTimer = null;

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeImportedEntry).filter((entry) => entry.cover) : [];
  } catch (error) {
    console.error("No se pudieron cargar las entradas:", error);
    return [];
  }
}

function normalizeImportedEntry(entry) {
  const type = entry.type in TYPE_LABELS ? entry.type : "movie";

  return {
    id: entry.id || crypto.randomUUID(),
    title: String(entry.title || "").trim(),
    type,
    status: entry.status in STATUS_LABELS ? entry.status : "completed",
    date: String(entry.date || new Date().toISOString().slice(0, 10)),
    rating: Number(entry.rating) || 0,
    season: type === "series" ? Number(entry.season) || null : null,
    revisit: Boolean(entry.revisit),
    cover: String(entry.cover || "").trim(),
    notes: String(entry.notes || "").trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function getExtrasPreference() {
  return localStorage.getItem(EXTRAS_OPEN_KEY) === "true";
}

function setExtrasOpen(open) {
  extraFields.hidden = !open;
  toggleExtrasButton.setAttribute("aria-expanded", String(open));
  localStorage.setItem(EXTRAS_OPEN_KEY, String(open));
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function isFormReady() {
  return Boolean(
    document.querySelector("#title").value.trim() &&
      document.querySelector("#date").value &&
      coverInput.value.trim()
  );
}

function updateSaveButtonState() {
  saveButton.disabled = !isFormReady();
}

function getLibraryStats() {
  const completed = state.entries.filter((entry) => entry.status === "completed").length;
  const inProgress = state.entries.filter((entry) => entry.status === "in-progress").length;
  const ratedEntries = state.entries.filter((entry) => Number(entry.rating) > 0);
  const average =
    ratedEntries.length > 0
      ? ratedEntries.reduce((sum, entry) => sum + Number(entry.rating), 0) / ratedEntries.length
      : 0;

  return {
    total: state.entries.length,
    completed,
    inProgress,
    average: average.toFixed(1),
  };
}

function updateSeriesFields() {
  const isSeries = typeInput.value === "series";
  seasonInput.disabled = !isSeries;
  seasonField.hidden = !isSeries;

  if (!isSeries) {
    seasonInput.value = "";
  }

  revisitLabel.textContent = REVISIT_LABELS[typeInput.value] || "Revisit";
}

function shouldShowExtras() {
  return (
    getExtrasPreference() ||
    Boolean(notesInput.value.trim()) ||
    revisitInput.checked ||
    state.editingId !== null
  );
}

function updateConditionalFields() {
  const status = statusInput.value;
  const showRating = status !== "planned";
  const showRevisit = status === "completed";

  ratingInput.parentElement.hidden = !showRating;
  if (!showRating) {
    ratingInput.value = "0";
  }

  revisitField.hidden = !showRevisit;
  if (!showRevisit) {
    revisitInput.checked = false;
  }

  setExtrasOpen(shouldShowExtras());
}

function formatStars(value) {
  const numericValue = Number(value);
  if (!numericValue) {
    return "Sin nota";
  }

  const fullStars = Math.floor(numericValue);
  const hasHalf = numericValue % 1 !== 0;
  return `${"\u2605".repeat(fullStars)}${hasHalf ? "\u00bd" : ""}`;
}

function formatDate(value) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function getEntryMeta(entry) {
  const parts = [formatDate(entry.date)];

  if (entry.type === "series" && entry.season) {
    parts.push(`Temporada ${entry.season}`);
  }

  return parts.join(" - ");
}

function compareEntries(a, b) {
  switch (state.filters.sortBy) {
    case "date-asc":
      return a.date.localeCompare(b.date);
    case "rating-desc":
      return Number(b.rating) - Number(a.rating);
    case "rating-asc":
      return Number(a.rating) - Number(b.rating);
    case "title-asc":
      return a.title.localeCompare(b.title, "es", { sensitivity: "base" });
    case "title-desc":
      return b.title.localeCompare(a.title, "es", { sensitivity: "base" });
    case "date-desc":
    default:
      return b.date.localeCompare(a.date);
  }
}

function getFilteredEntries() {
  const searchTerm = state.filters.search.trim().toLowerCase();

  return [...state.entries]
    .filter((entry) => {
      const inSearch =
        !searchTerm ||
        entry.title.toLowerCase().includes(searchTerm) ||
        entry.notes.toLowerCase().includes(searchTerm);
      const inTypeView =
        state.filters.typeView === "all" || entry.type === state.filters.typeView;
      const inStatus =
        state.filters.status === "all" || entry.status === state.filters.status;

      return inSearch && inTypeView && inStatus;
    })
    .sort(compareEntries);
}

function renderStats() {
  const stats = getLibraryStats();

  document.querySelector("#stat-total").textContent = String(stats.total);
  document.querySelector("#stat-completed").textContent = String(stats.completed);
  document.querySelector("#stat-progress").textContent = String(stats.inProgress);
  document.querySelector("#stat-average").textContent = stats.average;
}

function renderTypeTabs() {
  typeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.filters.typeView);
  });
}

function renderEntries() {
  const filteredEntries = getFilteredEntries();
  entriesGrid.innerHTML = "";
  document.querySelector("#results-count").textContent = `${filteredEntries.length} resultados`;

  if (filteredEntries.length === 0) {
    entriesGrid.innerHTML = `
      <article class="panel empty-state">
        <h3>No hay entradas</h3>
        <p>Anade una nueva.</p>
      </article>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach((entry) => {
    const clone = template.content.cloneNode(true);
    const article = clone.querySelector(".entry-card");
    const cover = clone.querySelector(".entry-cover");
    const ratingBadge = clone.querySelector(".entry-rating-badge");
    const typePill = clone.querySelector(".type-pill");
    const statusPill = clone.querySelector(".status-pill");
    const revisitPill = clone.querySelector(".revisit-pill");
    const title = clone.querySelector(".entry-title");
    const meta = clone.querySelector(".entry-meta");
    const notes = clone.querySelector(".entry-notes");
    const shareButton = clone.querySelector(".share-button");
    const editButton = clone.querySelector(".edit-button");
    const deleteButton = clone.querySelector(".delete-button");

    article.dataset.id = entry.id;
    cover.src = entry.cover;
    cover.alt = `Caratula de ${entry.title}`;

    typePill.textContent = TYPE_LABELS[entry.type];
    statusPill.textContent = STATUS_LABELS[entry.status];
    statusPill.dataset.status = entry.status;
    revisitPill.hidden = !entry.revisit;
    revisitPill.textContent = REVISIT_LABELS[entry.type] || "Revisit";
    title.textContent = entry.title;
    meta.textContent = getEntryMeta(entry);
    ratingBadge.textContent = formatStars(entry.rating);
    notes.textContent = entry.notes || "Sin notas.";
    shareButton.hidden = entry.status !== "completed";

    shareButton.addEventListener("click", () => shareEntryCard(entry));
    editButton.addEventListener("click", () => startEditing(entry.id));
    deleteButton.addEventListener("click", () => deleteEntry(entry.id));

    fragment.appendChild(clone);
  });

  entriesGrid.appendChild(fragment);
}

function render() {
  renderStats();
  renderTypeTabs();
  renderEntries();
}

function resetCoverPreview() {
  coverPreview.hidden = true;
  coverPreviewImage.removeAttribute("src");
  coverInput.classList.remove("is-invalid");
  updateSaveButtonState();
}

function testImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function updateCoverPreview() {
  const url = coverInput.value.trim();
  const token = ++state.coverValidationToken;

  if (!url) {
    resetCoverPreview();
    return;
  }

  const isValid = await testImage(url);
  if (token !== state.coverValidationToken) {
    return;
  }

  if (!isValid) {
    coverInput.classList.add("is-invalid");
    coverPreview.hidden = true;
    coverPreviewImage.removeAttribute("src");
    updateSaveButtonState();
    return;
  }

  coverInput.classList.remove("is-invalid");
  coverPreviewImage.src = url;
  coverPreview.hidden = false;
  updateSaveButtonState();
}

function resetForm() {
  form.reset();
  document.querySelector("#entry-id").value = "";
  document.querySelector("#date").value = new Date().toISOString().slice(0, 10);
  document.querySelector("#rating").value = "0";
  document.querySelector("#status").value = "completed";
  cancelEditButton.hidden = true;
  saveButton.textContent = "Guardar";
  state.editingId = null;
  resetCoverPreview();
  updateSeriesFields();
  updateConditionalFields();
  updateSaveButtonState();
}

function populateForm(entry) {
  document.querySelector("#entry-id").value = entry.id;
  document.querySelector("#title").value = entry.title;
  document.querySelector("#type").value = entry.type;
  document.querySelector("#status").value = entry.status;
  document.querySelector("#date").value = entry.date;
  document.querySelector("#rating").value = String(entry.rating);
  document.querySelector("#season").value = entry.season || "";
  document.querySelector("#cover").value = entry.cover || "";
  document.querySelector("#revisit").checked = entry.revisit;
  document.querySelector("#notes").value = entry.notes || "";
  cancelEditButton.hidden = false;
  saveButton.textContent = "Actualizar";
  updateSeriesFields();
  updateConditionalFields();
  updateCoverPreview();
  updateSaveButtonState();
}

function normalizeEntry(formData, idOverride = null) {
  const type = String(formData.get("type"));
  const isSeries = type === "series";

  return {
    id: idOverride || crypto.randomUUID(),
    title: String(formData.get("title")).trim(),
    type,
    status: String(formData.get("status")),
    date: String(formData.get("date")),
    rating: Number(formData.get("rating")) || 0,
    season: isSeries ? Number(formData.get("season")) || null : null,
    revisit: formData.get("revisit") === "on",
    cover: String(formData.get("cover")).trim(),
    notes: String(formData.get("notes")).trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function startEditing(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  state.editingId = entryId;
  populateForm(entry);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  const confirmed = window.confirm(`Se borrara "${entry.title}".`);
  if (!confirmed) {
    return;
  }

  state.entries = state.entries.filter((item) => item.id !== entryId);
  saveEntries();
  if (state.editingId === entryId) {
    resetForm();
  }
  render();
  showToast("Entrada borrada");
}

function exportEntries() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 4,
    entries: state.entries,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateLabel = new Date().toISOString().slice(0, 10);

  anchor.href = url;
  anchor.download = `media-logger-${dateLabel}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("JSON exportado");
}

function importEntries(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const entries = Array.isArray(parsed) ? parsed : parsed.entries;

      if (!Array.isArray(entries)) {
        throw new Error("Formato no valido");
      }

      const normalizedEntries = entries.map(normalizeImportedEntry);
      const importedEntries = normalizedEntries.filter((entry) => entry.cover);
      const discardedEntries = normalizedEntries.length - importedEntries.length;

      state.entries = importedEntries;
      saveEntries();
      resetForm();
      render();

      if (discardedEntries > 0) {
        showToast(`Importadas ${importedEntries.length}. Omitidas ${discardedEntries} sin caratula`);
      } else {
        showToast(`Importadas ${importedEntries.length}`);
      }
    } catch (error) {
      console.error(error);
      window.alert("No se pudo importar el archivo JSON.");
    } finally {
      importInput.value = "";
    }
  };

  reader.readAsText(file);
}

function clearAllEntries() {
  if (state.entries.length === 0) {
    return;
  }

  const confirmed = window.confirm("Se borraran todas las entradas guardadas.");
  if (!confirmed) {
    return;
  }

  state.entries = [];
  saveEntries();
  resetForm();
  render();
  showToast("Biblioteca vaciada");
}

function loadImageForCanvas(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function roundRectPath(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  const visibleLines = lines.slice(0, maxLines);
  visibleLines.forEach((line, index) => {
    const isLastVisibleLine = index === visibleLines.length - 1 && lines.length > maxLines;
    const output = isLastVisibleLine ? `${line}...` : line;
    context.fillText(output, x, y + index * lineHeight);
  });
}

async function createShareImage(entry) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  const cover = await loadImageForCanvas(entry.cover);
  const stats = getLibraryStats();

  context.fillStyle = "#09090b";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#111113";
  roundRectPath(context, 60, 60, 960, 1230, 36);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 2;
  roundRectPath(context, 60, 60, 960, 1230, 36);
  context.stroke();

  context.fillStyle = "#18181b";
  roundRectPath(context, 120, 110, 840, 520, 30);
  context.fill();

  if (cover) {
    context.save();
    roundRectPath(context, 120, 110, 840, 520, 30);
    context.clip();
    context.drawImage(cover, 120, 110, 840, 520);
    context.restore();
  } else {
    context.fillStyle = "#a1a1aa";
    context.font = "600 34px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("Caratula no disponible", 540, 378);
    context.textAlign = "left";
  }

  context.fillStyle = "#fafafa";
  context.font = "600 24px ui-sans-serif, system-ui, sans-serif";
  context.fillText("Media Logger Lite", 120, 700);

  context.font = "700 60px ui-sans-serif, system-ui, sans-serif";
  drawWrappedText(context, entry.title || "Sin titulo", 120, 772, 840, 68, 3);

  context.fillStyle = "#a1a1aa";
  context.font = "500 24px ui-sans-serif, system-ui, sans-serif";
  const metaParts = [TYPE_LABELS[entry.type], STATUS_LABELS[entry.status], formatDate(entry.date)];
  if (entry.type === "series" && entry.season) {
    metaParts.push(`T${entry.season}`);
  }
  context.fillText(metaParts.join("  \u2022  "), 120, 1016);

  context.fillStyle = "#fafafa";
  context.font = "600 40px ui-sans-serif, system-ui, sans-serif";
  context.fillText(formatStars(entry.rating), 120, 1076);

  if (entry.notes) {
    context.fillStyle = "#e4e4e7";
    context.font = "500 24px ui-sans-serif, system-ui, sans-serif";
    drawWrappedText(context, entry.notes, 120, 1130, 840, 34, 3);
  }

  const statY = 1180;
  const statBoxWidth = 195;
  const statGap = 15;
  const statStartX = 120;
  const statLabels = [
    ["Total", String(stats.total)],
    ["Completados", String(stats.completed)],
    ["En curso", String(stats.inProgress)],
    ["Media", stats.average],
  ];

  statLabels.forEach(([label, value], index) => {
    const x = statStartX + index * (statBoxWidth + statGap);
    context.fillStyle = "#18181b";
    roundRectPath(context, x, statY, statBoxWidth, 120, 24);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.stroke();

    context.fillStyle = "#a1a1aa";
    context.font = "500 20px ui-sans-serif, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(label, x + statBoxWidth / 2, statY + 42);
    context.fillStyle = "#fafafa";
    context.font = "700 34px ui-sans-serif, system-ui, sans-serif";
    context.fillText(value, x + statBoxWidth / 2, statY + 84);
  });

  context.textAlign = "left";
  return canvas;
}

async function shareEntryCard(entry) {
  try {
    const canvas = await createShareImage(entry);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("No se pudo generar la imagen");
    }

    const file = new File([blob], `${entry.title || "media-logger"}.png`, {
      type: "image/png",
    });

    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: entry.title,
        text: entry.title,
        files: [file],
      });
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(entry.title || "media-logger").replace(/[^\w\-]+/g, "_")}-share.png`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast("Imagen generada");
  } catch (error) {
    console.error(error);
    window.alert("No se pudo generar la imagen para compartir.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const existingEntry = state.entries.find((entry) => entry.id === state.editingId);
  const normalizedEntry = normalizeEntry(formData, state.editingId);

  if (!normalizedEntry.title || !normalizedEntry.date || !normalizedEntry.cover) {
    window.alert("Titulo, fecha y caratula son obligatorios.");
    return;
  }

  const coverWorks = await testImage(normalizedEntry.cover);
  if (!coverWorks) {
    window.alert("La caratula no se puede cargar. Revisa la URL.");
    return;
  }

  if (existingEntry) {
    normalizedEntry.createdAt = existingEntry.createdAt;
    state.entries = state.entries.map((entry) =>
      entry.id === state.editingId ? normalizedEntry : entry
    );
    showToast("Entrada actualizada");
  } else {
    state.entries = [normalizedEntry, ...state.entries];
    showToast("Entrada guardada");
  }

  saveEntries();
  resetForm();
  render();
});

typeInput.addEventListener("change", updateSeriesFields);
typeInput.addEventListener("change", updateConditionalFields);
statusInput.addEventListener("change", updateConditionalFields);
document.querySelector("#title").addEventListener("input", updateSaveButtonState);
document.querySelector("#date").addEventListener("input", updateSaveButtonState);
coverInput.addEventListener("input", updateCoverPreview);
notesInput.addEventListener("input", updateConditionalFields);
revisitInput.addEventListener("change", updateConditionalFields);
cancelEditButton.addEventListener("click", resetForm);
toggleExtrasButton.addEventListener("click", () => {
  const open = extraFields.hidden;
  setExtrasOpen(open);
});

document.querySelector("#export-button").addEventListener("click", exportEntries);
document.querySelector("#clear-button").addEventListener("click", clearAllEntries);

importInput.addEventListener("change", (event) => {
  importEntries(event.target.files[0]);
});

document.querySelector("#search").addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  renderEntries();
});

document.querySelector("#filter-status").addEventListener("change", (event) => {
  state.filters.status = event.target.value;
  renderEntries();
});

document.querySelector("#sort-by").addEventListener("change", (event) => {
  state.filters.sortBy = event.target.value;
  renderEntries();
});

typeTabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.filters.typeView = button.dataset.view;
    render();
  });
});

resetForm();
render();
