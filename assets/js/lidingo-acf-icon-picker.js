(function () {
  const bridgeConfig = window.lidingoIconBridge || {};
  const maxResults = Number(bridgeConfig.maxResults) > 0 ? Number(bridgeConfig.maxResults) : 500;

  const initializedFields = new WeakMap();
  const pendingFieldContainers = new WeakSet();
  let fallbackGetAcfIcons = typeof window.getAcfIcons === "function" ? window.getAcfIcons : null;
  let catalogPromise = null;

  // Escape text before injecting into HTML templates.
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        case "'":
          return "&#39;";
        default:
          return char;
      }
    });
  }

  // Validate and de-duplicate catalog entries into a predictable shape.
  function normalizeCatalog(rawCatalog) {
    if (!Array.isArray(rawCatalog)) {
      return [];
    }

    const unique = new Map();

    rawCatalog.forEach(function (item) {
      if (!item || typeof item !== "object") {
        return;
      }

      const token = typeof item.token === "string" ? item.token.trim() : "";
      if (!token || !/^:.+:$/u.test(token)) {
        return;
      }

      const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : token;
      const keywords = Array.isArray(item.keywords)
        ? item.keywords.filter(function (keyword) {
            return typeof keyword === "string" && keyword.trim().length > 0;
          })
        : [];

      const searchText = [token, label].concat(keywords).join(" ").toLowerCase();

      if (!unique.has(token)) {
        unique.set(token, {
          token: token,
          label: label,
          keywords: keywords,
          searchText: searchText,
        });
      }
    });

    return Array.from(unique.values());
  }

  // Fetch icon catalog once and reuse the same promise for all fields.
  function loadCatalog() {
    if (catalogPromise) {
      return catalogPromise;
    }

    const url = typeof bridgeConfig.catalogUrl === "string" ? bridgeConfig.catalogUrl : "";
    if (!url) {
      catalogPromise = Promise.resolve([]);
      return catalogPromise;
    }

    catalogPromise = fetch(url, { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("Could not load icon catalog");
        }

        return response.json();
      })
      .then(function (json) {
        return normalizeCatalog(json);
      })
      .catch(function (error) {
        console.error("[lidingo-icon-bridge] Failed to load icon catalog.", error);
        return [];
      });

    return catalogPromise;
  }

  // Resolve all required DOM nodes for one ACF icon field container.
  function queryFieldElements(container) {
    if (!container) {
      return null;
    }

    const searchInput = container.querySelector('[data-js-acf-icon-field="search-input"]');
    const hiddenInput = container.querySelector('[data-js-acf-icon-field="hidden-input"]');
    const listContainer = container.querySelector('[data-js-acf-icon-field="list"]');
    const previewIconContainer = container.querySelector('[data-js-icon-field="preview-icon"]');
    const previewClearButton = container.querySelector('[data-js-acf-icon-field="clear-button"]');
    const noIconText = container.querySelector('[data-js-acf-icon-field="no-icon"]');
    const searchContainer = container.querySelector(".acf-icon-field__search");

    if (
      !searchInput ||
      !hiddenInput ||
      !listContainer ||
      !previewIconContainer ||
      !previewClearButton ||
      !noIconText ||
      !searchContainer
    ) {
      return null;
    }

    return {
      container: container,
      searchInput: searchInput,
      hiddenInput: hiddenInput,
      listContainer: listContainer,
      previewIconContainer: previewIconContainer,
      previewClearButton: previewClearButton,
      noIconText: noIconText,
      searchContainer: searchContainer,
    };
  }

  // Fall back to original picker if bridge initialization cannot continue.
  function callFallback(event, id) {
    if (typeof fallbackGetAcfIcons === "function" && fallbackGetAcfIcons !== bridgeGetAcfIcons) {
      fallbackGetAcfIcons(event, id);
    }
  }

  function resolveContainer(event, id) {
    if (event) {
      const currentTarget = event.currentTarget;
      if (
        currentTarget instanceof HTMLElement &&
        currentTarget.matches('[data-js-acf-icon-field="container"]')
      ) {
        return currentTarget;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const fromTarget = target.closest('[data-js-acf-icon-field="container"]');
        if (fromTarget) {
          return fromTarget;
        }
      }
    }

    if (typeof id === "string" && id) {
      return document.getElementById(id);
    }

    return null;
  }

  function isCloneContainer(container) {
    if (!container || !(container instanceof HTMLElement)) {
      return false;
    }

    return Boolean(container.closest(".acf-clone, .acf-row.-clone, .acf-field-clone"));
  }

  // Detect our ligature token format, for example ":pratbubblor:".
  function isLidingoToken(value) {
    return /^:.+:$/u.test(String(value || "").trim());
  }

  // Handles rendering, selection and search behavior for one icon field.
  class LidingoIconField {
    constructor(elements, catalog) {
      this.elements = elements;
      this.catalog = catalog;
      this.catalogByToken = new Map();

      catalog.forEach((entry) => {
        this.catalogByToken.set(entry.token, entry);
      });

      this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
    }

    init(initialEvent) {
      this.elements.hiddenInput.addEventListener("change", () => {
        this.renderPreview(this.elements.hiddenInput.value);
        this.syncSelection();
      });

      this.elements.searchInput.addEventListener("input", () => {
        this.renderList(this.search(this.elements.searchInput.value));
      });

      this.elements.searchInput.addEventListener("focus", () => {
        this.renderList(this.search(this.elements.searchInput.value));
      });

      this.elements.previewClearButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setSelection("");
      });

      this.elements.listContainer.addEventListener("click", (event) => {
        const item = event.target.closest("[data-js-acf-icon-field-item]");
        if (!item || !this.elements.listContainer.contains(item)) {
          return;
        }

        const token = item.getAttribute("data-js-acf-icon-field-item");
        if (!token) {
          return;
        }

        if (this.elements.hiddenInput.value === token) {
          this.setSelection("");
          return;
        }

        this.setSelection(token);
      });

      document.addEventListener("click", this.boundHandleOutsideClick);

      this.renderPreview(this.elements.hiddenInput.value);
      this.renderList([]);
      this.syncSelection();
      this.handleAfterInit(initialEvent);
    }

    // Mirror clear-button clicks that triggered initialization.
    handleAfterInit(initialEvent) {
      if (!initialEvent || !initialEvent.target) {
        return;
      }

      const target = initialEvent.target;
      if (target === this.elements.previewClearButton || this.elements.previewClearButton.contains(target)) {
        this.setSelection("");
      }
    }

    // Close result list when user clicks outside the search area.
    handleOutsideClick(event) {
      if (this.elements.searchContainer.contains(event.target)) {
        return;
      }

      this.renderList([]);
    }

    // Persist selection in hidden input and trigger change listeners.
    setSelection(token) {
      this.elements.hiddenInput.value = token;
      this.elements.hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Match query against token, label and keywords with a result cap.
    search(query) {
      const normalizedQuery = String(query || "").trim().toLowerCase();
      if (!normalizedQuery) {
        return this.catalog.slice(0, maxResults);
      }

      const matches = [];
      for (let index = 0; index < this.catalog.length && matches.length < maxResults; index += 1) {
        const entry = this.catalog[index];
        if (entry.searchText.indexOf(normalizedQuery) !== -1) {
          matches.push(entry);
        }
      }

      return matches;
    }

    // Render search results into clickable list items.
    renderList(items) {
      if (!Array.isArray(items) || items.length === 0) {
        this.elements.searchContainer.classList.remove("is-expanded");
        this.elements.listContainer.innerHTML = "";
        return;
      }

      this.elements.searchContainer.classList.add("is-expanded");

      const selectedToken = this.elements.hiddenInput.value || "";
      const html = items
        .map((entry) => {
          const isSelected = selectedToken === entry.token;
          const classes = "acf-icon-field__list-item" + (isSelected ? " is-selected" : "");
          const title = entry.token === entry.label ? entry.token : entry.token + " " + entry.label;

          return (
            '<li class="' +
            classes +
            '" data-js-acf-icon-field-item="' +
            escapeHtml(entry.token) +
            '" role="radio" aria-checked="' +
            (isSelected ? "true" : "false") +
            '" title="' +
            escapeHtml(title) +
            '">' +
            '<span class="acf-icon-field__icon lidingo-icon-bridge__glyph" aria-hidden="true">' +
            escapeHtml(entry.token) +
            "</span>" +
            "</li>"
          );
        })
        .join("");

      this.elements.listContainer.innerHTML = html;
    }

    // Render selected value preview as Lidingo token or legacy Material icon.
    renderPreview(token) {
      if (!token) {
        this.elements.previewIconContainer.innerHTML = "";
        this.elements.noIconText.style.display = "block";
        this.elements.previewClearButton.style.display = "none";
        return;
      }

      const trimmedToken = String(token).trim();
      const entry = this.catalogByToken.get(trimmedToken);
      const label = entry ? entry.label : trimmedToken;
      const name = trimmedToken === label ? trimmedToken : trimmedToken + " " + label;
      const isToken = isLidingoToken(trimmedToken);

      if (isToken) {
        this.elements.previewIconContainer.innerHTML =
          '<span class="acf-icon-field__preview-icon lidingo-icon-bridge__glyph" aria-hidden="true">' +
          escapeHtml(trimmedToken) +
          "</span>" +
          '<span class="acf-icon-field__preview-icon-name">' +
          escapeHtml(name) +
          "</span>";
      } else {
        // Backwards compatibility for existing Material values.
        this.elements.previewIconContainer.innerHTML =
          '<span class="acf-icon-field__preview-icon material-symbols material-symbols-rounded material-symbols-sharp material-symbols-outlined" aria-hidden="true">' +
          escapeHtml(trimmedToken) +
          "</span>" +
          '<span class="acf-icon-field__preview-icon-name">' +
          escapeHtml(name) +
          "</span>";
      }

      this.elements.noIconText.style.display = "none";
      this.elements.previewClearButton.style.display = "flex";
    }

    // Keep list item selected-state in sync with hidden input value.
    syncSelection() {
      const selectedToken = this.elements.hiddenInput.value || "";
      const items = this.elements.listContainer.querySelectorAll("[data-js-acf-icon-field-item]");
      items.forEach((item) => {
        const token = item.getAttribute("data-js-acf-icon-field-item");
        const isSelected = token === selectedToken;

        item.classList.toggle("is-selected", isSelected);
        item.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    }
  }

  // Entry point replacing global getAcfIcons for all ACF icon fields.
  function bridgeGetAcfIcons(event, id) {
    const container = resolveContainer(event, id);
    if (!container) {
      if (id) {
        callFallback(event, id);
      }
      return;
    }

    if (isCloneContainer(container)) {
      return;
    }

    const existing = initializedFields.get(container);
    if (existing) {
      existing.handleAfterInit(event);
      return;
    }

    if (pendingFieldContainers.has(container)) {
      return;
    }

    const elements = queryFieldElements(container);
    if (!elements) {
      const fallbackId = (typeof id === "string" && id) || container.getAttribute("id") || "";
      if (!fallbackId) {
        return;
      }

      callFallback(event, fallbackId);
      return;
    }

    pendingFieldContainers.add(container);

    loadCatalog()
      .then(function (catalog) {
        if (!catalog.length) {
          pendingFieldContainers.delete(container);
          const fallbackId = (typeof id === "string" && id) || container.getAttribute("id") || "";
          if (fallbackId) {
            callFallback(event, fallbackId);
          }
          return;
        }

        const field = new LidingoIconField(elements, catalog);
        initializedFields.set(container, field);
        pendingFieldContainers.delete(container);
        field.init(event);
      })
      .catch(function (error) {
        pendingFieldContainers.delete(container);
        console.error("[lidingo-icon-bridge] Failed to initialize icon field.", error);
        const fallbackId = (typeof id === "string" && id) || container.getAttribute("id") || "";
        if (fallbackId) {
          callFallback(event, fallbackId);
        }
      });
  }

  // Install override and retain reference to previous implementation.
  function installOverride() {
    if (typeof window.getAcfIcons === "function" && window.getAcfIcons !== bridgeGetAcfIcons) {
      fallbackGetAcfIcons = window.getAcfIcons;
    }

    window.getAcfIcons = bridgeGetAcfIcons;
  }

  // Initialize one icon field container by element id.
  function initializeContainer(container) {
    if (!container || !(container instanceof HTMLElement) || isCloneContainer(container)) {
      return;
    }

    const id = container.getAttribute("id") || "";
    bridgeGetAcfIcons({ target: container, currentTarget: container }, id);
  }

  // Initialize every icon field container under the provided root node.
  function initializeAllContainers(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }

    const containers = root.querySelectorAll('[data-js-acf-icon-field="container"]');
    containers.forEach(function (container) {
      initializeContainer(container);
    });
  }

  // Initialize on load and for dynamically inserted containers.
  function setupAutoInitialization() {
    const init = function () {
      initializeAllContainers(document);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }

    window.addEventListener("load", init, { once: true });

    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          if (node.matches('[data-js-acf-icon-field="container"]')) {
            initializeContainer(node);
            return;
          }

          initializeAllContainers(node);
        });
      });
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  installOverride();
  setupAutoInitialization();

  let attempts = 0;
  const intervalId = window.setInterval(function () {
    installOverride();
    attempts += 1;

    if (attempts >= 100) {
      window.clearInterval(intervalId);
    }
  }, 50);
})();
