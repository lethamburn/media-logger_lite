const STORAGE_KEY = "media-logger-lite.entries";
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
    layout: "grid",
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
const revisitInput = document.querySelector("#revisit");
const revisitLabel = document.querySelector("#revisit-label");
const saveButton = document.querySelector("#save-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const importInput = document.querySelector("#import-file");
const typeTabs = [...document.querySelectorAll(".tab-button")];
const viewButtons = [...document.querySelectorAll(".view-button")];
const seasonField = document.querySelector("#field-season");
const revisitField = document.querySelector("#field-revisit");
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
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalizedEntries = parsed.map(normalizeImportedEntry).filter((entry) => entry.cover);

    // Rewrite legacy values in-place so old string booleans don't keep resurfacing.
    if (JSON.stringify(parsed) !== JSON.stringify(normalizedEntries)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedEntries));
    }

    return normalizedEntries;
  } catch (error) {
    console.error("No se pudieron cargar las entradas:", error);
    return [];
  }
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
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
    revisit: normalizeBoolean(entry.revisit),
    cover: String(entry.cover || "").trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
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

  return {
    total: state.entries.length,
    completed,
    inProgress,
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
}

function formatStars(value) {
  const numericValue = Number(value);
  if (!numericValue) {
    return "";
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
        entry.title.toLowerCase().includes(searchTerm);
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
}

function renderTypeTabs() {
  typeTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.filters.typeView);
  });
}

function renderViewButtons() {
  viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.layout === state.filters.layout);
  });
  entriesGrid.dataset.layout = state.filters.layout;
}

function renderEntries() {
  const filteredEntries = getFilteredEntries();
  entriesGrid.innerHTML = "";
  document.querySelector("#results-count").textContent = `${filteredEntries.length} resultados`;

  if (filteredEntries.length === 0) {
    entriesGrid.innerHTML = `
      <article class="panel empty-state">
        <h3>Vacio por aqui</h3>
        <p>Anade algo nuevo y aparecera aqui.</p>
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
    ratingBadge.hidden = !ratingBadge.textContent;

    editButton.addEventListener("click", () => startEditing(entry.id));
    deleteButton.addEventListener("click", () => deleteEntry(entry.id));

    fragment.appendChild(clone);
  });

  entriesGrid.appendChild(fragment);
}

function render() {
  renderStats();
  renderTypeTabs();
  renderViewButtons();
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
revisitInput.addEventListener("change", updateConditionalFields);
cancelEditButton.addEventListener("click", resetForm);

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

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filters.layout = button.dataset.layout;
    renderViewButtons();
    renderEntries();
  });
});

resetForm();
render();
