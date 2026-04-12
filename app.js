const STORAGE_KEY = "media-logger-lite.entries";
const STORAGE_META_KEY = "media-logger-lite.meta";
const BACKUP_COUNTER_KEY = "media-logger-lite.backup-counter";
const BACKUP_INTERVAL = 12;
const DATA_VERSION = 6;
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
  seriesDraftWatchedSeasons: [],
  formSnapshot: "",
  isDirty: false,
};

const form = document.querySelector("#entry-form");
const template = document.querySelector("#entry-template");
const entriesGrid = document.querySelector("#entries-grid");
const typeInput = document.querySelector("#type");
const totalSeasonsInput = document.querySelector("#total-seasons");
const ratingInput = document.querySelector("#rating");
const statusInput = document.querySelector("#status");
const coverInput = document.querySelector("#cover");
const saveButton = document.querySelector("#save-button");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const importInput = document.querySelector("#import-file");
const typeTabs = [...document.querySelectorAll(".tab-button")];
const viewButtons = [...document.querySelectorAll(".view-button")];
const seriesTotalField = document.querySelector("#field-series-total");
const statusField = statusInput.parentElement;
const coverPreview = document.querySelector("#cover-preview");
const coverPreviewImage = document.querySelector("#cover-preview-image");
const seriesProgress = document.querySelector("#series-progress");
const seriesProgressSummary = document.querySelector("#series-progress-summary");
const seasonChipGrid = document.querySelector("#season-chip-grid");
const monthlySummary = document.querySelector("#monthly-summary");
const toast = document.querySelector("#app-toast");
const confirmModal = document.querySelector("#confirm-modal");
const confirmModalTitle = document.querySelector("#confirm-modal-title");
const confirmModalCopy = document.querySelector("#confirm-modal-copy");
const confirmModalCancel = document.querySelector("#confirm-modal-cancel");
const confirmModalConfirm = document.querySelector("#confirm-modal-confirm");
const detailModal = document.querySelector("#detail-modal");
const detailModalCover = document.querySelector("#detail-modal-cover");
const detailModalType = document.querySelector("#detail-modal-type");
const detailModalStatus = document.querySelector("#detail-modal-status");
const detailModalTitle = document.querySelector("#detail-modal-title");
const detailModalRating = document.querySelector("#detail-modal-rating");
const detailModalMeta = document.querySelector("#detail-modal-meta");
const detailModalSeasons = document.querySelector("#detail-modal-seasons");

let toastTimer = null;
let pendingConfirmAction = null;

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const rawMeta = localStorage.getItem(STORAGE_META_KEY);
    if (!raw) {
      persistStorageMeta();
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      persistStorageMeta();
      return [];
    }

    const normalizedEntries = parsed.map(normalizeImportedEntry).filter((entry) => entry.cover);
    const parsedMeta = rawMeta ? JSON.parse(rawMeta) : null;
    const needsMetaRefresh = !parsedMeta || Number(parsedMeta.version) !== DATA_VERSION;

    // Rewrite legacy values in-place so old string booleans don't keep resurfacing.
    if (JSON.stringify(parsed) !== JSON.stringify(normalizedEntries) || needsMetaRefresh) {
      persistEntries(normalizedEntries);
    }

    return normalizedEntries;
  } catch (error) {
    console.error("No se pudieron cargar las entradas:", error);
    return [];
  }
}

function normalizeImportedEntry(entry) {
  const type = entry.type in TYPE_LABELS ? entry.type : "movie";
  const totalSeasons =
    type === "series" ? Math.max(Number(entry.totalSeasons) || Number(entry.season) || 0, 0) || null : null;
  const watchedSeasons =
    type === "series" ? normalizeSeasonList(entry.watchedSeasons, totalSeasons, entry) : [];
  const status = entry.status in STATUS_LABELS ? entry.status : "completed";

  return {
    id: entry.id || crypto.randomUUID(),
    title: String(entry.title || "").trim(),
    type,
    status,
    date: String(entry.date || new Date().toISOString().slice(0, 10)),
    rating: Number(entry.rating) || 0,
    season: null,
    totalSeasons,
    watchedSeasons,
    cover: String(entry.cover || "").trim(),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function normalizeSeasonList(value, totalSeasons, legacyEntry = {}) {
  const numericTotal = Math.max(Number(totalSeasons) || 0, 0);

  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => Number(item) || 0))]
      .filter((season) => season > 0 && (!numericTotal || season <= numericTotal))
      .sort((a, b) => a - b);
  }

  const legacySeason = Number(legacyEntry.season) || 0;
  if (!legacySeason) {
    return [];
  }

  const fallbackMax = numericTotal || legacySeason;
  return Array.from({ length: Math.min(legacySeason, fallbackMax) }, (_, index) => index + 1);
}

function getNormalizedSeriesTitle(title) {
  return String(title || "").trim().toLowerCase();
}

function deriveSeriesStatus(totalSeasons, watchedSeasons) {
  const total = Math.max(Number(totalSeasons) || 0, 0);
  const watchedCount = watchedSeasons.length;

  if (!total || watchedCount === 0) {
    return "planned";
  }

  if (watchedCount >= total) {
    return "completed";
  }

  return "in-progress";
}

function getSeriesWatchLabel(entry) {
  if (entry.type !== "series" || !entry.totalSeasons) {
    return "";
  }

  const watchedCount = entry.watchedSeasons.length;
  return `${watchedCount}/${entry.totalSeasons} temporadas`;
}

function renderSeasonMarks(container, entry, variant = "card") {
  container.innerHTML = "";

  if (entry.type !== "series" || !entry.totalSeasons) {
    container.hidden = true;
    return;
  }

  const watched = new Set(entry.watchedSeasons || []);
  const fragment = document.createDocumentFragment();

  for (let season = 1; season <= entry.totalSeasons; season += 1) {
    const mark = document.createElement("span");
    mark.className = `season-mark season-mark-${variant}`;
    mark.textContent = `S${season}`;
    mark.setAttribute("aria-hidden", "true");
    if (watched.has(season)) {
      mark.classList.add("active");
    }
    fragment.appendChild(mark);
  }

  container.appendChild(fragment);
  container.hidden = false;
}

function renderSeasonChips() {
  const total = Math.max(Number(totalSeasonsInput.value) || 0, 0);
  seasonChipGrid.innerHTML = "";

  if (!total) {
    seriesProgressSummary.textContent = "0/0";
    return;
  }

  const watched = new Set(state.seriesDraftWatchedSeasons);
  const fragment = document.createDocumentFragment();

  for (let season = 1; season <= total; season += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "season-chip";
    button.dataset.season = String(season);
    button.textContent = `T${season}`;
    button.setAttribute("aria-pressed", String(watched.has(season)));
    button.classList.toggle("active", watched.has(season));
    button.addEventListener("click", () => {
      toggleSeasonSelection(season);
    });
    fragment.appendChild(button);
  }

  seasonChipGrid.appendChild(fragment);
  seriesProgressSummary.textContent = `${state.seriesDraftWatchedSeasons.length}/${total}`;
}

function toggleSeasonSelection(season) {
  const current = new Set(state.seriesDraftWatchedSeasons);
  if (current.has(season)) {
    current.delete(season);
  } else {
    current.add(season);
  }

  state.seriesDraftWatchedSeasons = [...current].sort((a, b) => a - b);
  renderSeasonChips();
  updateConditionalFields();
  updateDirtyState();
}

function syncSeriesDraftBounds() {
  const total = Math.max(Number(totalSeasonsInput.value) || 0, 0);
  state.seriesDraftWatchedSeasons = state.seriesDraftWatchedSeasons
    .filter((season) => season > 0 && season <= total)
    .sort((a, b) => a - b);
}

function persistStorageMeta() {
  localStorage.setItem(
    STORAGE_META_KEY,
    JSON.stringify({
      version: DATA_VERSION,
      updatedAt: new Date().toISOString(),
    })
  );
}

function persistEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  persistStorageMeta();
}

function saveEntries() {
  persistEntries(state.entries);
}

function getFormSnapshot() {
  return JSON.stringify({
    entryId: document.querySelector("#entry-id").value,
    title: document.querySelector("#title").value.trim(),
    type: typeInput.value,
    status: statusInput.value,
    date: document.querySelector("#date").value,
    rating: ratingInput.value,
    totalSeasons: totalSeasonsInput.value,
    watchedSeasons: [...state.seriesDraftWatchedSeasons],
    cover: coverInput.value.trim(),
  });
}

function markFormClean() {
  state.formSnapshot = getFormSnapshot();
  state.isDirty = false;
}

function updateDirtyState() {
  state.isDirty = getFormSnapshot() !== state.formSnapshot;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function getBackupCounter() {
  return Number(localStorage.getItem(BACKUP_COUNTER_KEY)) || 0;
}

function setBackupCounter(value) {
  localStorage.setItem(BACKUP_COUNTER_KEY, String(value));
}

function registerMutation(reason = "Guardado") {
  const nextCount = getBackupCounter() + 1;
  if (nextCount >= BACKUP_INTERVAL) {
    exportEntries({ silent: true, reason: "backup" });
    setBackupCounter(0);
    showToast("Copia de seguridad descargada");
    return;
  }

  setBackupCounter(nextCount);
  showToast(reason);
}

function openConfirmModal({ title, copy, confirmLabel = "Aceptar", confirmVariant = "danger", onConfirm }) {
  pendingConfirmAction = onConfirm;
  confirmModalTitle.textContent = title;
  confirmModalCopy.textContent = copy;
  confirmModalConfirm.textContent = confirmLabel;
  confirmModalConfirm.classList.toggle("danger", confirmVariant === "danger");
  confirmModalConfirm.classList.toggle("primary", confirmVariant !== "danger");
  confirmModal.hidden = false;
}

function closeConfirmModal() {
  confirmModal.hidden = true;
  pendingConfirmAction = null;
}

function openDetailModal(entry) {
  detailModalCover.src = entry.cover;
  detailModalCover.alt = `Caratula de ${entry.title}`;
  detailModalCover.classList.remove("is-placeholder");
  detailModalCover.onerror = () => {
    detailModalCover.src = getCoverFallback(entry.title);
    detailModalCover.classList.add("is-placeholder");
  };
  detailModalType.textContent = TYPE_LABELS[entry.type];
  detailModalStatus.textContent = STATUS_LABELS[entry.status];
  detailModalStatus.dataset.status = entry.status;
  detailModalTitle.textContent = entry.title;
  detailModalRating.textContent = formatStars(entry.rating);
  detailModalRating.hidden = !detailModalRating.textContent;
  detailModalMeta.textContent = formatDate(entry.date);
  renderSeasonMarks(detailModalSeasons, entry, "detail");

  detailModal.hidden = false;
}

function closeDetailModal() {
  detailModal.hidden = true;
}

function getCoverFallback(title) {
  const label = encodeURIComponent((title || "Media").slice(0, 32));
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600"><rect width="480" height="600" rx="36" fill="%23111113"/><rect x="24" y="24" width="432" height="552" rx="28" fill="%2317171b" stroke="%232a2a31"/><circle cx="240" cy="220" r="62" fill="%23222228"/><path d="M208 206h64v8h-64zm0 18h64v8h-64zm0 18h40v8h-40z" fill="%235a5a66"/><text x="240" y="432" text-anchor="middle" fill="%23d4d4d8" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="600">${label}</text></svg>`;
}

function isFormReady() {
  const needsSeriesSeasons = typeInput.value === "series";
  return Boolean(
    document.querySelector("#title").value.trim() &&
      document.querySelector("#date").value &&
      coverInput.value.trim() &&
      (!needsSeriesSeasons || Number(totalSeasonsInput.value) > 0)
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
  totalSeasonsInput.disabled = !isSeries;
  seriesTotalField.hidden = !isSeries;
  seriesProgress.hidden = !isSeries;
  statusField.hidden = isSeries;

  if (!isSeries) {
    totalSeasonsInput.value = "";
    state.seriesDraftWatchedSeasons = [];
    seasonChipGrid.innerHTML = "";
    seriesProgressSummary.textContent = "0/0";
  }

  if (isSeries) {
    syncSeriesDraftBounds();
    renderSeasonChips();
  }
}

function updateConditionalFields() {
  const status =
    typeInput.value === "series"
      ? deriveSeriesStatus(totalSeasonsInput.value, state.seriesDraftWatchedSeasons)
      : statusInput.value;
  const showRating = status !== "planned";

  ratingInput.parentElement.hidden = !showRating;
  if (!showRating) {
    ratingInput.value = "0";
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
  return formatDate(entry.date);
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

function getMonthlyGroups() {
  const groups = new Map();

  [...state.entries]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .forEach((entry) => {
      const key = entry.date.slice(0, 7);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    });

  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function formatMonthLabel(value) {
  const [year, month] = value.split("-");
  return new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${year}-${month}-01T12:00:00`));
}

function renderMonthlySummary() {
  monthlySummary.innerHTML = "";
  const groups = getMonthlyGroups();

  if (groups.length === 0) {
    monthlySummary.innerHTML = `
      <article class="monthly-empty">
        <p>Sin registros todavia.</p>
      </article>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  groups.forEach(([monthKey, entries]) => {
    const section = document.createElement("section");
    section.className = "month-group";

    const header = document.createElement("div");
    header.className = "month-group-header";
    header.innerHTML = `
      <h3>${formatMonthLabel(monthKey)}</h3>
      <span>${entries.length}</span>
    `;

    const gallery = document.createElement("div");
    gallery.className = "month-gallery";

    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "month-item";
      button.title = entry.title;
      button.setAttribute("aria-label", entry.title);

      const image = document.createElement("img");
      image.className = "month-item-cover";
      image.src = entry.cover;
      image.alt = `Caratula de ${entry.title}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener(
        "error",
        () => {
          image.src = getCoverFallback(entry.title);
          image.classList.add("is-placeholder");
        },
        { once: true }
      );

      button.appendChild(image);
      button.addEventListener("click", () => openDetailModal(entry));
      gallery.appendChild(button);
    });

    section.appendChild(header);
    section.appendChild(gallery);
    fragment.appendChild(section);
  });

  monthlySummary.appendChild(fragment);
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
    const title = clone.querySelector(".entry-title");
    const meta = clone.querySelector(".entry-meta");
    const seasonMarks = clone.querySelector(".season-marks");
    const toggleStatusButton = clone.querySelector(".toggle-status-button");
    const editButton = clone.querySelector(".edit-button");
    const deleteButton = clone.querySelector(".delete-button");

    article.dataset.id = entry.id;
    article.dataset.status = entry.status;
    article.tabIndex = 0;
    cover.src = entry.cover;
    cover.alt = `Caratula de ${entry.title}`;
    cover.loading = "lazy";
    cover.decoding = "async";
    cover.addEventListener(
      "error",
      () => {
        cover.src = getCoverFallback(entry.title);
        cover.classList.add("is-placeholder");
      },
      { once: true }
    );

    typePill.textContent = TYPE_LABELS[entry.type];
    statusPill.textContent = STATUS_LABELS[entry.status];
    statusPill.dataset.status = entry.status;
    title.textContent = entry.title;
    meta.textContent = getEntryMeta(entry);
    renderSeasonMarks(seasonMarks, entry, "card");
    ratingBadge.textContent = formatStars(entry.rating);
    ratingBadge.hidden = !ratingBadge.textContent;
    toggleStatusButton.title =
      entry.type === "series"
        ? "Marcar todas vistas"
        : "Marcar como completado";
    toggleStatusButton.setAttribute("aria-label", toggleStatusButton.title);
    toggleStatusButton.hidden = entry.status === "completed";

    toggleStatusButton.addEventListener("click", () => toggleEntryStatus(entry.id));
    editButton.addEventListener("click", () => startEditing(entry.id));
    deleteButton.addEventListener("click", () => deleteEntry(entry.id));
    article.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button")) {
        return;
      }
      openDetailModal(entry);
    });
    article.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetailModal(entry);
      }
    });

    fragment.appendChild(clone);
  });

  entriesGrid.appendChild(fragment);
}

function render() {
  renderStats();
  renderMonthlySummary();
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
  state.seriesDraftWatchedSeasons = [];
  resetCoverPreview();
  updateSeriesFields();
  updateConditionalFields();
  updateSaveButtonState();
  markFormClean();
}

function populateForm(entry) {
  document.querySelector("#entry-id").value = entry.id;
  document.querySelector("#title").value = entry.title;
  document.querySelector("#type").value = entry.type;
  document.querySelector("#status").value = entry.status;
  document.querySelector("#date").value = entry.date;
  document.querySelector("#rating").value = String(entry.rating);
  document.querySelector("#total-seasons").value = entry.totalSeasons || "";
  document.querySelector("#cover").value = entry.cover || "";
  state.seriesDraftWatchedSeasons = [...(entry.watchedSeasons || [])];
  cancelEditButton.hidden = false;
  saveButton.textContent = "Actualizar";
  updateSeriesFields();
  updateConditionalFields();
  updateCoverPreview();
  updateSaveButtonState();
  markFormClean();
}

function normalizeEntry(formData, idOverride = null) {
  const type = String(formData.get("type"));
  const isSeries = type === "series";
  const totalSeasons = isSeries ? Math.max(Number(formData.get("total-seasons")) || 0, 0) || null : null;
  const watchedSeasons = isSeries
    ? state.seriesDraftWatchedSeasons.filter((season) => totalSeasons && season <= totalSeasons)
    : [];
  const derivedStatus = isSeries
    ? deriveSeriesStatus(totalSeasons, watchedSeasons)
    : String(formData.get("status"));

  return {
    id: idOverride || crypto.randomUUID(),
    title: String(formData.get("title")).trim(),
    type,
    status: derivedStatus,
    date: String(formData.get("date")),
    rating: Number(formData.get("rating")) || 0,
    season: null,
    totalSeasons,
    watchedSeasons,
    cover: String(formData.get("cover")).trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function findSeriesDuplicate(title, excludeId = null) {
  const normalizedTitle = getNormalizedSeriesTitle(title);
  return state.entries.find(
    (entry) =>
      entry.type === "series" &&
      entry.id !== excludeId &&
      getNormalizedSeriesTitle(entry.title) === normalizedTitle
  );
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

  openConfirmModal({
    title: "Borrar registro",
    copy: `Se borrara "${entry.title}".`,
    confirmLabel: "Borrar",
    onConfirm: () => {
      state.entries = state.entries.filter((item) => item.id !== entryId);
      saveEntries();
      if (state.editingId === entryId) {
        resetForm();
      }
      render();
      registerMutation("Entrada borrada");
    },
  });
}

function exportEntries(options = {}) {
  const { silent = false, reason = "manual" } = options;
  const payload = {
    exportedAt: new Date().toISOString(),
    version: DATA_VERSION,
    entries: state.entries,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const dateLabel = new Date().toISOString().slice(0, 10);

  anchor.href = url;
  anchor.download = reason === "backup"
    ? `media-logger-backup-${dateLabel}.json`
    : `media-logger-${dateLabel}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  if (!silent) {
    showToast("JSON exportado");
  }
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
      setBackupCounter(0);

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

  openConfirmModal({
    title: "Vaciar biblioteca",
    copy: "Se borraran todas las entradas guardadas.",
    confirmLabel: "Vaciar",
    onConfirm: () => {
      state.entries = [];
      saveEntries();
      resetForm();
      render();
      registerMutation("Biblioteca vaciada");
    },
  });
}

function toggleEntryStatus(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry || entry.status === "completed") {
    return;
  }

  if (entry.type === "series") {
    const totalSeasons = Math.max(Number(entry.totalSeasons) || 0, 0);
    const watchedSeasons = Array.from({ length: totalSeasons }, (_, index) => index + 1);
    const nextStatus = deriveSeriesStatus(totalSeasons, watchedSeasons);

    state.entries = state.entries.map((item) =>
      item.id === entryId
        ? {
            ...item,
            watchedSeasons,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
          }
        : item
    );

    saveEntries();
    if (state.editingId === entryId) {
      const updatedEntry = state.entries.find((item) => item.id === entryId);
      if (updatedEntry) {
        populateForm(updatedEntry);
      }
    }
    render();
    registerMutation("Serie marcada como completa");
    return;
  }

  const nextStatus = "completed";
  state.entries = state.entries.map((item) =>
    item.id === entryId
      ? {
          ...item,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        }
      : item
  );
  saveEntries();
  if (state.editingId === entryId) {
    const updatedEntry = state.entries.find((item) => item.id === entryId);
    if (updatedEntry) {
      populateForm(updatedEntry);
    }
  }
  render();
  registerMutation("Marcado como completado");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const duplicateSeries = typeInput.value === "series"
    ? findSeriesDuplicate(formData.get("title"), state.editingId)
    : null;
  const targetId = state.editingId || duplicateSeries?.id || null;
  const existingEntry = targetId ? state.entries.find((entry) => entry.id === targetId) : null;
  const normalizedEntry = normalizeEntry(formData, targetId);

  if (!normalizedEntry.title || !normalizedEntry.date || !normalizedEntry.cover) {
    window.alert("Titulo, fecha y caratula son obligatorios.");
    return;
  }

  if (normalizedEntry.type === "series" && !normalizedEntry.totalSeasons) {
    window.alert("Indica cuantas temporadas tiene la serie.");
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
      entry.id === targetId ? normalizedEntry : entry
    );
    saveEntries();
    resetForm();
    render();
    registerMutation(duplicateSeries ? "Serie actualizada" : "Entrada actualizada");
  } else {
    state.entries = [normalizedEntry, ...state.entries];
    saveEntries();
    resetForm();
    render();
    registerMutation("Entrada guardada");
  }
});

typeInput.addEventListener("change", updateSeriesFields);
typeInput.addEventListener("change", updateConditionalFields);
typeInput.addEventListener("change", updateDirtyState);
statusInput.addEventListener("change", updateConditionalFields);
statusInput.addEventListener("change", updateDirtyState);
totalSeasonsInput.addEventListener("input", () => {
  syncSeriesDraftBounds();
  renderSeasonChips();
  updateConditionalFields();
  updateDirtyState();
});
document.querySelector("#title").addEventListener("input", () => {
  updateSaveButtonState();
  updateDirtyState();
});
document.querySelector("#date").addEventListener("input", () => {
  updateSaveButtonState();
  updateDirtyState();
});
ratingInput.addEventListener("change", updateDirtyState);
coverInput.addEventListener("input", () => {
  updateCoverPreview();
  updateDirtyState();
});
cancelEditButton.addEventListener("click", resetForm);

document.querySelector("#export-button").addEventListener("click", exportEntries);
document.querySelector("#clear-button").addEventListener("click", clearAllEntries);
confirmModalCancel.addEventListener("click", closeConfirmModal);
confirmModalConfirm.addEventListener("click", () => {
  if (pendingConfirmAction) {
    pendingConfirmAction();
  }
  closeConfirmModal();
});
confirmModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeModal === "true") {
    closeConfirmModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !confirmModal.hidden) {
    closeConfirmModal();
  }
  if (event.key === "Escape" && !detailModal.hidden) {
    closeDetailModal();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.isDirty) {
    return;
  }

  event.preventDefault();
  event.returnValue = "";
});
detailModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.dataset.closeDetail === "true") {
    closeDetailModal();
  }
});

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

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister()))
      )
      .catch((error) => {
        console.error("No se pudieron limpiar los service workers:", error);
      });

    if ("caches" in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch((error) => {
          console.error("No se pudo limpiar la caché de la app:", error);
        });
    }
  });
}

resetForm();
render();

