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

const FALLBACK_COVER =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
      <rect width="400" height="500" fill="#f4e8d9"/>
      <rect x="32" y="32" width="336" height="436" rx="24" fill="#fff7ef" stroke="#d8c6b2"/>
      <path d="M126 166h148M126 220h148M126 274h92" stroke="#be5b2f" stroke-width="18" stroke-linecap="round"/>
      <circle cx="304" cy="352" r="34" fill="#456445" fill-opacity=".16"/>
      <text x="50%" y="78%" text-anchor="middle" fill="#7d6a58" font-family="Georgia, serif" font-size="30">Sin caratula</text>
    </svg>
  `);

const state = {
  entries: loadEntries(),
  filters: {
    search: "",
    type: "all",
    status: "all",
    sortBy: "date-desc",
  },
  editingId: null,
};

const form = document.querySelector("#entry-form");
const template = document.querySelector("#entry-template");
const entriesGrid = document.querySelector("#entries-grid");
const typeInput = document.querySelector("#type");
const seasonInput = document.querySelector("#season");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const importInput = document.querySelector("#import-file");

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("No se pudieron cargar las entradas:", error);
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function formatStars(value) {
  const numericValue = Number(value);
  if (!numericValue) {
    return "Sin nota";
  }

  const fullStars = Math.floor(numericValue);
  const hasHalf = numericValue % 1 !== 0;
  return `${"★".repeat(fullStars)}${hasHalf ? "½" : ""} (${numericValue}/5)`;
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
  const pieces = [formatDate(entry.date)];

  if (entry.type === "series" && entry.season) {
    pieces.push(`Temporada ${entry.season}`);
  }

  return pieces.join(" · ");
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
      const matchesSearch =
        !searchTerm ||
        entry.title.toLowerCase().includes(searchTerm) ||
        entry.notes.toLowerCase().includes(searchTerm);
      const matchesType =
        state.filters.type === "all" || entry.type === state.filters.type;
      const matchesStatus =
        state.filters.status === "all" || entry.status === state.filters.status;

      return matchesSearch && matchesType && matchesStatus;
    })
    .sort(compareEntries);
}

function renderStats() {
  const completed = state.entries.filter((entry) => entry.status === "completed").length;
  const inProgress = state.entries.filter((entry) => entry.status === "in-progress").length;
  const ratedEntries = state.entries.filter((entry) => Number(entry.rating) > 0);
  const average =
    ratedEntries.length > 0
      ? ratedEntries.reduce((sum, entry) => sum + Number(entry.rating), 0) / ratedEntries.length
      : 0;

  document.querySelector("#stat-total").textContent = String(state.entries.length);
  document.querySelector("#stat-completed").textContent = String(completed);
  document.querySelector("#stat-progress").textContent = String(inProgress);
  document.querySelector("#stat-average").textContent = average.toFixed(1);
}

function renderEntries() {
  const filteredEntries = getFilteredEntries();
  entriesGrid.innerHTML = "";
  document.querySelector("#results-count").textContent = `${filteredEntries.length} resultados`;

  if (filteredEntries.length === 0) {
    entriesGrid.innerHTML = `
      <article class="panel empty-state">
        <h3>No hay entradas que coincidan</h3>
        <p>Prueba a cambiar los filtros o añade tu primera pelicula, juego, serie o disco.</p>
      </article>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredEntries.forEach((entry) => {
    const clone = template.content.cloneNode(true);
    const article = clone.querySelector(".entry-card");
    const cover = clone.querySelector(".entry-cover");
    const typePill = clone.querySelector(".type-pill");
    const statusPill = clone.querySelector(".status-pill");
    const title = clone.querySelector(".entry-title");
    const meta = clone.querySelector(".entry-meta");
    const rating = clone.querySelector(".entry-rating");
    const notes = clone.querySelector(".entry-notes");
    const editButton = clone.querySelector(".edit-button");
    const deleteButton = clone.querySelector(".delete-button");

    article.dataset.id = entry.id;
    cover.src = entry.cover || FALLBACK_COVER;
    cover.alt = `Caratula de ${entry.title}`;
    cover.classList.toggle("is-placeholder", !entry.cover);
    cover.addEventListener("error", () => {
      cover.src = FALLBACK_COVER;
      cover.classList.add("is-placeholder");
    });

    typePill.textContent = TYPE_LABELS[entry.type];
    statusPill.textContent = STATUS_LABELS[entry.status];
    statusPill.dataset.status = entry.status;
    title.textContent = entry.title;
    meta.textContent = getEntryMeta(entry);
    rating.textContent = formatStars(entry.rating);
    notes.textContent = entry.notes || "Sin notas.";

    editButton.addEventListener("click", () => startEditing(entry.id));
    deleteButton.addEventListener("click", () => deleteEntry(entry.id));

    fragment.appendChild(clone);
  });

  entriesGrid.appendChild(fragment);
}

function render() {
  renderStats();
  renderEntries();
}

function resetForm() {
  form.reset();
  document.querySelector("#entry-id").value = "";
  document.querySelector("#date").value = new Date().toISOString().slice(0, 10);
  document.querySelector("#rating").value = "0";
  seasonInput.disabled = typeInput.value !== "series";
  seasonInput.value = "";
  cancelEditButton.hidden = true;
  document.querySelector("#save-button").textContent = "Guardar entrada";
  state.editingId = null;
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
  document.querySelector("#notes").value = entry.notes || "";
  seasonInput.disabled = entry.type !== "series";
  cancelEditButton.hidden = false;
  document.querySelector("#save-button").textContent = "Actualizar entrada";
}

function normalizeEntry(formData, idOverride = null) {
  const type = formData.get("type");
  const seasonRaw = formData.get("season");

  return {
    id: idOverride || crypto.randomUUID(),
    title: String(formData.get("title")).trim(),
    type,
    status: String(formData.get("status")),
    date: String(formData.get("date")),
    rating: Number(formData.get("rating")) || 0,
    season: type === "series" && seasonRaw ? Number(seasonRaw) : null,
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
}

function exportEntries() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
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

      state.entries = entries.map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        title: String(entry.title || "").trim(),
        type: entry.type || "movie",
        status: entry.status || "completed",
        date: entry.date || new Date().toISOString().slice(0, 10),
        rating: Number(entry.rating) || 0,
        season: entry.type === "series" ? Number(entry.season) || null : null,
        cover: String(entry.cover || "").trim(),
        notes: String(entry.notes || "").trim(),
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: entry.updatedAt || new Date().toISOString(),
      }));

      saveEntries();
      resetForm();
      render();
      window.alert("Importacion completada.");
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
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const existingEntry = state.entries.find((entry) => entry.id === state.editingId);
  const normalizedEntry = normalizeEntry(formData, state.editingId);

  if (!normalizedEntry.title || !normalizedEntry.date) {
    return;
  }

  if (existingEntry) {
    normalizedEntry.createdAt = existingEntry.createdAt;
    state.entries = state.entries.map((entry) =>
      entry.id === state.editingId ? normalizedEntry : entry
    );
  } else {
    state.entries = [normalizedEntry, ...state.entries];
  }

  saveEntries();
  resetForm();
  render();
});

typeInput.addEventListener("change", () => {
  const isSeries = typeInput.value === "series";
  seasonInput.disabled = !isSeries;
  if (!isSeries) {
    seasonInput.value = "";
  }
});

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

document.querySelector("#filter-type").addEventListener("change", (event) => {
  state.filters.type = event.target.value;
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

resetForm();
render();
