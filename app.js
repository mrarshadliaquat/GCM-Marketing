(function () {
  "use strict";

  const STORAGE_KEY = "whatsappCampaignDashboard.v1";
  const defaultState = {
    contacts: [],
    logs: [],
    settings: {
      businessName: "Your Business",
      offerText: "20% discount this week",
      messageTemplate: "Hello {{name}}, this is {{business}}. Offer: {{offer}}. Reply STOP if you do not want updates.",
      timerSeconds: 20
    },
    duplicates: 0
  };

  let state = loadState();
  let timerId = null;
  let countdownId = null;
  let countdown = 0;
  let activeView = "contacts";

  const els = {
    metricTotal: document.getElementById("metricTotal"),
    metricPending: document.getElementById("metricPending"),
    metricOpened: document.getElementById("metricOpened"),
    metricSent: document.getElementById("metricSent"),
    metricFailed: document.getElementById("metricFailed"),
    metricDuplicates: document.getElementById("metricDuplicates"),
    contactsBody: document.getElementById("contactsBody"),
    logsBody: document.getElementById("logsBody"),
    contactsView: document.getElementById("contactsView"),
    logsView: document.getElementById("logsView"),
    emptyContactsTemplate: document.getElementById("emptyContactsTemplate"),
    emptyLogsTemplate: document.getElementById("emptyLogsTemplate"),
    csvInput: document.getElementById("csvInput"),
    txtInput: document.getElementById("txtInput"),
    vcfInput: document.getElementById("vcfInput"),
    manualName: document.getElementById("manualName"),
    manualCountry: document.getElementById("manualCountry"),
    manualPhone: document.getElementById("manualPhone"),
    businessName: document.getElementById("businessName"),
    offerText: document.getElementById("offerText"),
    messageTemplate: document.getElementById("messageTemplate"),
    timerSeconds: document.getElementById("timerSeconds"),
    timerStatus: document.getElementById("timerStatus"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    toast: document.getElementById("toast")
  };

  init();

  function init() {
    hydrateSettings();
    attachEvents();
    render();
  }

  function hydrateSettings() {
    els.businessName.value = state.settings.businessName;
    els.offerText.value = state.settings.offerText;
    els.messageTemplate.value = state.settings.messageTemplate;
    els.timerSeconds.value = state.settings.timerSeconds;
  }

  function attachEvents() {
    document.addEventListener("click", handleDocumentClick);
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    els.csvInput.addEventListener("change", (event) => handleFile(event, "csv"));
    els.txtInput.addEventListener("change", (event) => handleFile(event, "txt"));
    els.vcfInput.addEventListener("change", (event) => handleFile(event, "vcf"));

    [els.businessName, els.offerText, els.messageTemplate, els.timerSeconds].forEach((field) => {
      field.addEventListener("input", saveSettingsFromForm);
    });

    els.searchInput.addEventListener("input", renderContacts);
    els.statusFilter.addEventListener("change", renderContacts);
  }

  function handleDocumentClick(event) {
    const tokenButton = event.target.closest("[data-token]");
    if (tokenButton) {
      insertToken(tokenButton.dataset.token);
      return;
    }

    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const id = actionButton.dataset.id;

    const actions = {
      addManual,
      openNext,
      startTimer,
      stopTimer,
      cleanDuplicates,
      exportLogs,
      clearData
    };

    if (actions[action]) {
      actions[action]();
      return;
    }

    if (action === "openContact") openContact(id);
    if (action === "markSent") markContact(id, "Sent", "Marked sent");
    if (action === "markFailed") markFailed(id);
    if (action === "skipContact") markContact(id, "Do not send", "Skipped");
    if (action === "deleteContact") deleteContact(id);
  }

  function handleFile(event, type) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      let rows = [];
      if (type === "csv") rows = parseCSVContacts(content);
      if (type === "txt") rows = parseTXTContacts(content);
      if (type === "vcf") rows = parseVCFContacts(content);
      const result = importContacts(rows, type.toUpperCase() + " import");
      saveAndRender();
      showToast(`${result.added} imported, ${result.duplicates} duplicates skipped, ${result.failed} failed.`);
    };
    reader.readAsText(file);
  }

  function parseCSVContacts(text) {
    const lines = normalizeLines(text).filter(Boolean);
    if (!lines.length) return [];

    const first = parseCSVLine(lines[0]);
    const hasHeader = first.some((value) => /name|customer|phone|mobile|number|country|code|whatsapp/i.test(value));
    let nameIndex = 0;
    let countryIndex = 1;
    let phoneIndex = 2;
    let start = 0;

    if (hasHeader) {
      start = 1;
      nameIndex = findHeaderIndex(first, ["name", "customer"]);
      countryIndex = findHeaderIndex(first, ["country", "code"]);
      phoneIndex = findHeaderIndex(first, ["phone", "mobile", "number", "whatsapp"]);
    }

    return lines.slice(start).map((line) => {
      const fields = parseCSVLine(line);
      if (hasHeader) {
        return {
          name: field(fields, nameIndex),
          country: field(fields, countryIndex),
          phone: field(fields, phoneIndex)
        };
      }
      if (fields.length >= 3) {
        return { name: field(fields, 0), country: field(fields, 1), phone: field(fields, 2) };
      }
      if (fields.length === 2) {
        return { name: field(fields, 0), country: "", phone: field(fields, 1) };
      }
      return { name: "", country: "", phone: field(fields, 0) };
    });
  }

  function parseCSVLine(line) {
    const fields = [];
    let value = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(value.trim());
        value = "";
      } else {
        value += char;
      }
    }
    fields.push(value.trim());
    return fields;
  }

  function parseTXTContacts(text) {
    return normalizeLines(text).filter(Boolean).map((line) => {
      const phone = extractPhone(line);
      const name = line
        .replace(phone, "")
        .replace(/[|,;]/g, " ")
        .replace(/\s+-\s+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { name, country: "", phone };
    });
  }

  function parseVCFContacts(text) {
    const contacts = [];
    let current = null;

    normalizeLines(text).forEach((line) => {
      const trimmed = line.trim();
      const upper = trimmed.toUpperCase();
      if (upper === "BEGIN:VCARD") {
        current = { name: "", country: "", phone: "" };
        return;
      }
      if (!current) return;
      if (upper.startsWith("FN:")) current.name = cleanVCardValue(trimmed.slice(3));
      if (upper.startsWith("N:") && !current.name) current.name = cleanVCardValue(trimmed.slice(2)).replace(/;/g, " ").trim();
      if (upper.startsWith("TEL") && !current.phone) current.phone = cleanVCardValue(valueAfterColon(trimmed));
      if (upper === "END:VCARD") {
        contacts.push(current);
        current = null;
      }
    });

    return contacts;
  }

  function importContacts(rows, source) {
    const result = { added: 0, duplicates: 0, failed: 0 };
    rows.forEach((row) => {
      const normalized = normalizeContact(row);
      if (!normalized.fullNumber || normalized.fullNumber.length < 7) {
        result.failed += 1;
        logAction({ name: row.name || "", fullNumber: normalized.fullNumber || "" }, "Import Failed", source);
        return;
      }
      if (state.contacts.some((contact) => contact.fullNumber === normalized.fullNumber)) {
        result.duplicates += 1;
        state.duplicates += 1;
        logAction(normalized, "Duplicate Skipped", source);
        return;
      }
      const contact = {
        id: createId(),
        name: normalized.name || "Imported Contact",
        country: normalized.country,
        phone: normalized.phone,
        fullNumber: normalized.fullNumber,
        status: "Pending",
        lastAction: "",
        notes: source,
        failure: ""
      };
      state.contacts.push(contact);
      result.added += 1;
      logAction(contact, "Imported", source);
    });
    return result;
  }

  function addManual() {
    const row = {
      name: els.manualName.value,
      country: els.manualCountry.value,
      phone: els.manualPhone.value
    };
    const result = importContacts([row], "Manual add");
    if (result.added) {
      els.manualName.value = "";
      els.manualCountry.value = "";
      els.manualPhone.value = "";
    }
    saveAndRender();
    showToast(result.added ? "Contact added." : "Contact not added. Check number or duplicate.");
  }

  function cleanDuplicates() {
    const seen = new Map();
    const kept = [];
    let removed = 0;

    state.contacts.forEach((contact) => {
      if (seen.has(contact.fullNumber)) {
        removed += 1;
        state.duplicates += 1;
        logAction(contact, "Duplicate Removed", `Duplicate of ${seen.get(contact.fullNumber)}`);
      } else {
        seen.set(contact.fullNumber, contact.name);
        kept.push(contact);
      }
    });

    state.contacts = kept;
    saveAndRender();
    showToast(`${removed} duplicate contact(s) removed.`);
  }

  function openNext() {
    const contact = state.contacts.find((item) => item.status === "Pending" || !item.status);
    if (!contact) {
      stopTimer();
      showToast("No pending contacts found.");
      return false;
    }
    return openContact(contact.id);
  }

  function openContact(id) {
    const contact = findContact(id);
    if (!contact) return false;

    const url = buildWhatsAppURL(contact);
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
      stopTimer();
      showToast("Popup blocked. Allow popups for this site, then try again.");
      return false;
    }

    contact.status = "Opened";
    contact.lastAction = nowText();
    contact.notes = "Opened WhatsApp message";
    contact.failure = "";
    logAction(contact, "Opened", "WhatsApp message opened");
    saveAndRender();
    return true;
  }

  function startTimer() {
    stopTimer(false);
    const opened = openNext();
    if (!opened) return;
    countdown = timerSeconds();
    updateTimerStatus();
    countdownId = window.setInterval(() => {
      countdown -= 1;
      updateTimerStatus();
      if (countdown <= 0) {
        const ok = openNext();
        if (!ok) return;
        countdown = timerSeconds();
      }
    }, 1000);
  }

  function stopTimer(showMessage = true) {
    if (timerId) window.clearTimeout(timerId);
    if (countdownId) window.clearInterval(countdownId);
    timerId = null;
    countdownId = null;
    countdown = 0;
    els.timerStatus.textContent = "Timer stopped";
    if (showMessage) showToast("Timer stopped.");
  }

  function updateTimerStatus() {
    els.timerStatus.textContent = `Next message in ${Math.max(0, countdown)} second(s)`;
  }

  function markFailed(id) {
    const reason = window.prompt("Failure reason:", "Not sent");
    markContact(id, "Failed", reason || "Not sent");
  }

  function markContact(id, status, notes) {
    const contact = findContact(id);
    if (!contact) return;
    contact.status = status;
    contact.lastAction = nowText();
    contact.notes = notes;
    contact.failure = status === "Failed" ? notes : "";
    logAction(contact, status, notes);
    saveAndRender();
  }

  function deleteContact(id) {
    const contact = findContact(id);
    if (!contact) return;
    if (!window.confirm(`Delete ${contact.name}?`)) return;
    state.contacts = state.contacts.filter((item) => item.id !== id);
    logAction(contact, "Deleted", "Removed from contacts");
    saveAndRender();
  }

  function exportLogs() {
    const header = ["Date", "Name", "Number", "Result", "Notes"];
    const rows = state.logs.map((log) => [log.date, log.name, log.fullNumber, log.result, log.notes]);
    downloadText("whatsapp_logs.csv", toCSV([header].concat(rows)), "text/csv");
  }

  function clearData() {
    if (!window.confirm("Clear all contacts and logs from this browser?")) return;
    stopTimer(false);
    state = structuredClone(defaultState);
    hydrateSettings();
    saveAndRender();
    showToast("Data cleared.");
  }

  function saveSettingsFromForm() {
    state.settings.businessName = els.businessName.value;
    state.settings.offerText = els.offerText.value;
    state.settings.messageTemplate = els.messageTemplate.value;
    state.settings.timerSeconds = timerSeconds();
    saveState();
  }

  function insertToken(token) {
    const textarea = els.messageTemplate;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + token.length;
    saveSettingsFromForm();
  }

  function switchView(view) {
    activeView = view;
    document.querySelectorAll(".tab").forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle("active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
    });
    els.contactsView.classList.toggle("hidden", view !== "contacts");
    els.logsView.classList.toggle("hidden", view !== "logs");
    render();
  }

  function render() {
    renderMetrics();
    renderContacts();
    renderLogs();
  }

  function renderMetrics() {
    const counts = countStatuses();
    els.metricTotal.textContent = state.contacts.length;
    els.metricPending.textContent = counts.Pending || 0;
    els.metricOpened.textContent = counts.Opened || 0;
    els.metricSent.textContent = counts.Sent || 0;
    els.metricFailed.textContent = counts.Failed || 0;
    els.metricDuplicates.textContent = state.duplicates || 0;
  }

  function renderContacts() {
    const search = els.searchInput.value.trim().toLowerCase();
    const status = els.statusFilter.value;
    let contacts = state.contacts;

    if (search) {
      contacts = contacts.filter((contact) => {
        return [contact.name, contact.fullNumber, contact.status, contact.notes].join(" ").toLowerCase().includes(search);
      });
    }
    if (status !== "all") contacts = contacts.filter((contact) => contact.status === status);

    els.contactsBody.textContent = "";
    if (!contacts.length) {
      els.contactsBody.appendChild(els.emptyContactsTemplate.content.cloneNode(true));
      return;
    }

    contacts.forEach((contact) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <strong></strong>
          <div class="number-cell"></div>
        </td>
        <td class="number-cell"></td>
        <td><span class="status"></span></td>
        <td class="date-cell"></td>
        <td>
          <div class="row-actions">
            <button class="small primary" data-action="openContact" data-id="${contact.id}">Open</button>
            <button class="small ghost" data-action="markSent" data-id="${contact.id}">Sent</button>
            <button class="small ghost" data-action="markFailed" data-id="${contact.id}">Failed</button>
            <button class="small ghost" data-action="skipContact" data-id="${contact.id}">Skip</button>
            <button class="small danger ghost" data-action="deleteContact" data-id="${contact.id}">Delete</button>
          </div>
        </td>
      `;
      row.querySelector("strong").textContent = contact.name;
      row.querySelector(".number-cell").textContent = contact.notes || "";
      row.children[1].textContent = "+" + contact.fullNumber;
      const statusEl = row.querySelector(".status");
      statusEl.textContent = contact.status || "Pending";
      statusEl.className = "status " + String(contact.status || "Pending").replace(/\s+/g, "-");
      row.children[3].textContent = contact.lastAction || "";
      els.contactsBody.appendChild(row);
    });
  }

  function renderLogs() {
    els.logsBody.textContent = "";
    if (!state.logs.length) {
      els.logsBody.appendChild(els.emptyLogsTemplate.content.cloneNode(true));
      return;
    }

    state.logs.slice().reverse().forEach((log) => {
      const row = document.createElement("tr");
      [log.date, log.name, "+" + log.fullNumber, log.result, log.notes].forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        if (index === 0 || index === 2) cell.className = "date-cell";
        row.appendChild(cell);
      });
      els.logsBody.appendChild(row);
    });
  }

  function countStatuses() {
    return state.contacts.reduce((acc, contact) => {
      const status = contact.status || "Pending";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
  }

  function buildWhatsAppURL(contact) {
    return `https://wa.me/${contact.fullNumber}?text=${encodeURIComponent(renderMessage(contact))}`;
  }

  function renderMessage(contact) {
    return state.settings.messageTemplate
      .replaceAll("{{name}}", contact.name)
      .replaceAll("{{business}}", state.settings.businessName)
      .replaceAll("{{offer}}", state.settings.offerText);
  }

  function normalizeContact(row) {
    const country = digitsOnly(row.country || "");
    const phone = digitsOnly(row.phone || "");
    const fullNumber = digitsOnly(country + phone);
    return {
      name: String(row.name || "").trim(),
      country,
      phone,
      fullNumber
    };
  }

  function extractPhone(text) {
    const match = String(text).match(/\+?[0-9][0-9\-\s().]{6,}[0-9]/);
    return match ? match[0] : text;
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeLines(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim());
  }

  function cleanVCardValue(value) {
    return String(value || "")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\n/gi, " ")
      .trim();
  }

  function valueAfterColon(value) {
    const index = value.indexOf(":");
    return index === -1 ? value : value.slice(index + 1);
  }

  function findHeaderIndex(fields, names) {
    const index = fields.findIndex((fieldValue) => {
      const normalized = fieldValue.toLowerCase();
      return names.some((name) => normalized.includes(name));
    });
    return index;
  }

  function field(fields, index) {
    if (index < 0 || index >= fields.length) return "";
    return String(fields[index] || "").trim();
  }

  function findContact(id) {
    return state.contacts.find((contact) => contact.id === id);
  }

  function logAction(contact, result, notes) {
    state.logs.push({
      date: nowText(),
      name: contact.name || "",
      fullNumber: contact.fullNumber || "",
      result,
      notes: notes || ""
    });
  }

  function timerSeconds() {
    const value = Number.parseInt(els.timerSeconds.value, 10);
    if (!Number.isFinite(value)) return 20;
    return Math.max(5, value);
  }

  function nowText() {
    return new Date().toLocaleString();
  }

  function createId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function toCSV(rows) {
    return rows.map((row) => {
      return row.map((value) => {
        const text = String(value || "");
        return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
      }).join(",");
    }).join("\n");
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
      els.toast.classList.remove("show");
    }, 3200);
  }

  function saveAndRender() {
    saveState();
    render();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return structuredClone(defaultState);
      return Object.assign(structuredClone(defaultState), JSON.parse(saved));
    } catch (error) {
      return structuredClone(defaultState);
    }
  }
})();
