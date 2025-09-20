const DATA_ROOT = "notion_export/Japan Travel Planner 🌸 273042fae56c80149c0ded3ca759366a";
const FILES = {
  manifest: "notion_export/Japan Travel Planner 🌸 273042fae56c80149c0ded3ca759366a.md",
  itinerary: `${DATA_ROOT}/Travel Itinerary 273042fae56c81f4b235f8b4a219d671.csv`,
  packing: `${DATA_ROOT}/Packing List 273042fae56c8157b6cffb25550a7f53.csv`,
  expenses: `${DATA_ROOT}/Expenses 273042fae56c8184bec2d767d89c564d.csv`,
  wishlist: `${DATA_ROOT}/Untitled 273042fae56c81beb5c6dd05945c9506.csv`,
};

const dom = {
  loading: document.getElementById("loadingState"),
  error: document.getElementById("errorState"),
  tripWindow: document.getElementById("tripWindow"),
  timestamp: document.getElementById("dataTimestamp"),
  todoList: document.getElementById("todoList"),
  todoSummary: document.getElementById("todoSummary"),
  snapshotTable: document.getElementById("snapshotTable"),
  snapshotSummary: document.getElementById("snapshotSummary"),
  itineraryGrid: document.getElementById("itineraryGrid"),
  itineraryStats: document.getElementById("itineraryStats"),
  packingGrid: document.getElementById("packingGrid"),
  packingStats: document.getElementById("packingStats"),
  expenseTable: document.getElementById("expenseTable"),
  expenseStats: document.getElementById("expenseStats"),
  wishlistGrid: document.getElementById("wishlistGrid"),
  wishlistStats: document.getElementById("wishlistStats"),
  linksList: document.getElementById("linksList"),
  linksSummary: document.getElementById("linksSummary"),
};

(async function initDashboard() {
  try {
    const [manifest, itineraryCsv, packingCsv, expensesCsv, wishlistCsv] = await Promise.all([
      fetchText(FILES.manifest),
      fetchText(FILES.itinerary),
      fetchText(FILES.packing),
      fetchText(FILES.expenses),
      fetchText(FILES.wishlist),
    ]);

    const overviewData = parseManifest(manifest);
    renderOverview(overviewData);

    const itineraryRecords = recordsFromCsv(itineraryCsv);
    renderItinerary(itineraryRecords);

    const packingRecords = recordsFromCsv(packingCsv);
    renderPacking(packingRecords);

    const expenseRecords = recordsFromCsv(expensesCsv);
    renderExpenses(expenseRecords);

    const wishlistRecords = recordsFromCsv(wishlistCsv);
    renderWishlist(wishlistRecords);

    setTimestamp();
    hide(dom.loading);
  } catch (error) {
    console.error("Failed to build dashboard", error);
    hide(dom.loading);
    show(dom.error);
    dom.error.textContent = `Something went wrong while reading the Notion export: ${error.message}`;
  }
})();

function encodePath(path) {
  return encodeURI(path);
}

async function fetchText(path) {
  const response = await fetch(encodePath(path));
  if (!response.ok) {
    throw new Error(`Unable to fetch ${path} (${response.status})`);
  }
  return response.text();
}

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  const input = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === "\"") {
        if (input[i + 1] === "\"") {
          currentField += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unmatched quote detected");
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (!rows.length) {
    return { headers: [], rows: [] };
  }

  const headers = rows.shift().map((header) => header.trim());
  return { headers, rows };
}

function recordsFromCsv(text) {
  const { headers, rows } = parseCSV(text);
  if (!headers.length) {
    return [];
  }
  return rows
    .filter((row) => row.some((cell) => cell && cell.trim().length))
    .map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        const value = row[index] ?? "";
        record[header] = typeof value === "string" ? value.trim() : value;
      });
      return record;
    });
}

function parseManifest(markdown) {
  const lines = markdown.split("\n");

  const section = (predicate) => {
    const startIdx = lines.findIndex((line) => predicate(line.trim()));
    if (startIdx === -1) {
      return [];
    }
    const sectionLines = [];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const current = lines[i];
      const trimmed = current.trim();
      if (/^##\s+/.test(trimmed) && !predicate(trimmed)) {
        break;
      }
      sectionLines.push(current);
    }
    return sectionLines;
  };

  const toDoLines = section((line) => line.toLowerCase().startsWith("## priority to-dos"));
  const todos = toDoLines
    .map((line) => line.trim())
    .filter((line) => /^- \[[ xX]\]/.test(line))
    .map((line) => {
      const done = line.includes("[x]") || line.includes("[X]");
      const label = line.replace(/^- \[[ xX]\]\s*/, "");
      return { label, done };
    });

  const snapshotHeadingLine = lines.find((line) =>
    line.trim().toLowerCase().startsWith("## trip snapshot")
  );
  let tripWindow = "";
  if (snapshotHeadingLine) {
    const match = snapshotHeadingLine.match(/\(([^)]+)\)/);
    if (match) {
      tripWindow = match[1];
    }
  }

  const snapshotLines = section((line) => line.trim().toLowerCase().startsWith("## trip snapshot"));
  const tableLines = snapshotLines.filter((line) => line.trim().startsWith("|"));
  let snapshotTable = { headers: [], rows: [] };
  if (tableLines.length >= 2) {
    const clean = tableLines.map((line) => line.trim());
    const headers = clean[0]
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const body = clean
      .slice(2)
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
      )
      .filter((cells) => cells.some((cell) => cell.length));
    snapshotTable = { headers, rows: body };
  }

  const linksLines = section((line) => line.toLowerCase().startsWith("## links"));
  const links = linksLines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const match = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (!match) {
        return null;
      }
      return { label: match[1], url: match[2] };
    })
    .filter(Boolean);

  return { todos, snapshotTable, tripWindow, links };
}

function renderOverview(data) {
  const { todos, snapshotTable, tripWindow, links } = data;

  if (dom.tripWindow && tripWindow) {
    dom.tripWindow.textContent = `Travel window: ${tripWindow}`;
  }

  renderTodoList(todos);
  renderSnapshotTable(snapshotTable);
  renderLinks(links);
}

function renderTodoList(todos) {
  if (!dom.todoList) {
    return;
  }
  dom.todoList.innerHTML = "";
  if (!todos.length) {
    dom.todoList.innerHTML = "<li>No tasks to show.</li>";
    dom.todoSummary.textContent = "All caught up";
    return;
  }

  let doneCount = 0;
  for (const todo of todos) {
    if (todo.done) {
      doneCount += 1;
    }
    const item = document.createElement("li");
    item.className = "checklist__item";
    const checkbox = document.createElement("span");
    checkbox.className = "checklist__box";
    checkbox.setAttribute("aria-hidden", "true");
    if (todo.done) {
      checkbox.classList.add("checklist__box--checked");
    }
    const label = document.createElement("span");
    label.className = "checklist__label";
    label.textContent = todo.label;
    item.append(checkbox, label);
    dom.todoList.appendChild(item);
  }
  dom.todoSummary.textContent = `${doneCount}/${todos.length} complete`;
}

function renderSnapshotTable(snapshotTable) {
  if (!dom.snapshotTable) {
    return;
  }
  if (!snapshotTable.headers.length) {
    dom.snapshotTable.tHead.innerHTML = "";
    dom.snapshotTable.tBodies[0].innerHTML = "";
    dom.snapshotSummary.textContent = "Table unavailable";
    return;
  }

  dom.snapshotSummary.textContent = `${snapshotTable.rows.length} days mapped`;

  const thead = dom.snapshotTable.querySelector("thead");
  thead.innerHTML = "";
  const headerRow = document.createElement("tr");
  snapshotTable.headers.forEach((header) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = dom.snapshotTable.querySelector("tbody");
  tbody.innerHTML = "";
  snapshotTable.rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell, index) => {
      const td = document.createElement("td");
      if (index === 0) {
        td.dataset.label = snapshotTable.headers[index];
      }
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderLinks(links) {
  if (!dom.linksList) {
    return;
  }
  dom.linksList.innerHTML = "";
  if (!links.length) {
    dom.linksList.innerHTML = "<li>No shared links in the export.</li>";
    dom.linksSummary.textContent = "0 resources";
    return;
  }
  dom.linksSummary.textContent = `${links.length} resource${links.length === 1 ? "" : "s"}`;
  links.forEach((link) => {
    const li = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    li.appendChild(anchor);
    dom.linksList.appendChild(li);
  });
}

function renderItinerary(records) {
  if (!dom.itineraryGrid) {
    return;
  }
  dom.itineraryGrid.innerHTML = "";
  if (!records.length) {
    dom.itineraryGrid.innerHTML = '<p class="empty-state">Itinerary CSV is empty.</p>';
    dom.itineraryStats.textContent = "0 entries";
    return;
  }

  const dayMap = new Map();
  const order = [];
  records.forEach((record) => {
    const dayLabel = record.Day || "Unscheduled";
    const normalized = dayLabel.trim() || "Unscheduled";
    if (!dayMap.has(normalized)) {
      dayMap.set(normalized, []);
      order.push(normalized);
    }
    dayMap.get(normalized).push(record);
  });

  order.sort((a, b) => dayNumber(a) - dayNumber(b));

  let entryCount = 0;
  order.forEach((day) => {
    const items = dayMap.get(day) ?? [];
    items.sort((a, b) => timeValue(a.Description) - timeValue(b.Description));

    const card = document.createElement("article");
    card.className = "day-card";

    const header = document.createElement("header");
    header.className = "day-card__header";

    const title = document.createElement("h3");
    title.className = "day-card__title";
    title.textContent = day;

    const count = document.createElement("span");
    count.className = "day-card__count";
    count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

    header.append(title, count);
    card.appendChild(header);

    const list = document.createElement("ol");
    list.className = "day-card__list";

    items.forEach((item) => {
      entryCount += 1;
      const listItem = document.createElement("li");
      listItem.className = "day-card__item";

      const itemHeader = document.createElement("div");
      itemHeader.className = "day-card__item-header";

      const name = document.createElement("span");
      name.className = "day-card__item-name";
      name.textContent = item.Name;

      const type = document.createElement("span");
      type.className = "badge";
      type.textContent = item.Type || "";

      const visited = document.createElement("span");
      visited.className = "status-chip";
      const visitedText = (item.Visited || "").toLowerCase();
      if (visitedText === "yes") {
        visited.textContent = "Visited";
        visited.classList.add("status-chip--positive");
      } else if (visitedText === "no") {
        visited.textContent = "Planned";
        visited.classList.add("status-chip--neutral");
      } else {
        visited.textContent = visitedText || "";
        visited.classList.add("status-chip--unknown");
      }

      itemHeader.append(name);
      if (item.Type) {
        itemHeader.append(type);
      }
      if (visited.textContent) {
        itemHeader.append(visited);
      }

      const meta = document.createElement("p");
      meta.className = "day-card__meta";
      const location = item.Group ? item.Group : "";
      const { time, detail } = splitDescription(item.Description);
      const fragments = [];
      if (time) {
        const strong = document.createElement("strong");
        strong.textContent = time;
        fragments.push(strong);
      }
      if (location) {
        const loc = document.createElement("span");
        loc.className = "day-card__location";
        loc.textContent = location;
        fragments.push(loc);
      }
      const description = document.createElement("span");
      description.textContent = detail || item.Description;
      fragments.push(description);
      meta.append(...fragments.flatMap((fragment) => {
        if (fragment instanceof HTMLElement) {
          return [fragment, document.createTextNode(" ")];
        }
        return [];
      }));
      if (meta.lastChild && meta.lastChild.nodeType === Node.TEXT_NODE) {
        meta.removeChild(meta.lastChild);
      }

      const notes = document.createElement("p");
      notes.className = "day-card__notes";
      notes.innerHTML = formatNotes(item.Notes || "");

      listItem.append(itemHeader);
      if (meta.textContent.trim()) {
        listItem.appendChild(meta);
      }
      if (notes.innerHTML.trim()) {
        listItem.appendChild(notes);
      }
      if (item.URL) {
        const link = document.createElement("a");
        link.className = "day-card__link";
        link.href = item.URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open in Google Maps";
        listItem.appendChild(link);
      }
      list.appendChild(listItem);
    });

    card.appendChild(list);
    dom.itineraryGrid.appendChild(card);
  });

  dom.itineraryStats.textContent = `${entryCount} itinerar${entryCount === 1 ? "y" : "ies"}`;
}

function dayNumber(label) {
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function timeValue(description) {
  if (!description) {
    return Number.MAX_SAFE_INTEGER;
  }
  const match = description.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function splitDescription(description) {
  if (!description) {
    return { time: "", detail: "" };
  }
  const parts = description.split("—");
  if (parts.length >= 2) {
    return { time: parts[0].trim(), detail: parts.slice(1).join("—").trim() };
  }
  return { time: "", detail: description.trim() };
}

function formatNotes(notes) {
  if (!notes) {
    return "";
  }
  const safe = escapeHtml(notes);
  const withBreaks = safe
    .replace(/ Booking:/g, "<br><strong>Booking:</strong>")
    .replace(/ With /g, "<br><strong>With </strong>")
    .replace(/ Budget around/g, "<br><strong>Budget around</strong>")
    .replace(/ Nanako working day/g, "<br><strong>Nanako working day</strong>")
    .replace(/ Owner:/g, "<br><strong>Owner:</strong>")
    .replace(/ Linked days:/g, "<br><strong>Linked days:</strong>")
    .replace(/\n/g, "<br>");
  return withBreaks;
}

function renderPacking(records) {
  if (!dom.packingGrid) {
    return;
  }
  dom.packingGrid.innerHTML = "";
  if (!records.length) {
    dom.packingGrid.innerHTML = '<p class="empty-state">Packing list is empty.</p>';
    dom.packingStats.textContent = "0 items";
    return;
  }

  const groups = new Map();
  const order = [];
  let packedCount = 0;
  records.forEach((record) => {
    const type = record.Type || "Misc";
    if (!groups.has(type)) {
      groups.set(type, []);
      order.push(type);
    }
    if ((record.Packed || "").toLowerCase() === "yes") {
      packedCount += 1;
    }
    groups.get(type).push(record);
  });

  order.sort();

  order.forEach((type) => {
    const items = groups.get(type) ?? [];
    const card = document.createElement("article");
    card.className = "category-card";

    const header = document.createElement("header");
    header.className = "category-card__header";

    const title = document.createElement("h3");
    title.className = "category-card__title";
    title.textContent = type;

    const count = document.createElement("span");
    count.className = "category-card__count";
    count.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

    header.append(title, count);
    card.appendChild(header);

    const list = document.createElement("ul");
    list.className = "category-card__list";

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "category-card__item";

      const name = document.createElement("span");
      name.className = "category-card__item-name";
      name.textContent = item.Name;

      const quantity = document.createElement("span");
      quantity.className = "category-card__item-quantity";
      if (item.Quantity) {
        quantity.textContent = item.Quantity;
      }

      const notes = document.createElement("p");
      notes.className = "category-card__item-notes";
      notes.textContent = item.Notes || "";

      const status = document.createElement("span");
      status.className = "status-chip";
      if ((item.Packed || "").toLowerCase() === "yes") {
        status.textContent = "Packed";
        status.classList.add("status-chip--positive");
      } else {
        status.textContent = "To pack";
        status.classList.add("status-chip--neutral");
      }

      li.append(name);
      if (item.Quantity) {
        li.append(quantity);
      }
      if (item.Notes) {
        li.append(notes);
      }
      li.append(status);
      list.appendChild(li);
    });

    card.appendChild(list);
    dom.packingGrid.appendChild(card);
  });

  dom.packingStats.textContent = `${packedCount}/${records.length} packed`;
}

function renderExpenses(records) {
  if (!dom.expenseTable) {
    return;
  }
  const tbody = dom.expenseTable.querySelector("tbody");
  tbody.innerHTML = "";
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No expenses in the export.</td></tr>';
    dom.expenseStats.textContent = "0 expenses";
    return;
  }

  let total = 0;
  records.forEach((record) => {
    const tr = document.createElement("tr");

    const date = document.createElement("td");
    date.textContent = record.Date || "";

    const name = document.createElement("td");
    name.textContent = record.Expense || "";

    const amount = document.createElement("td");
    amount.textContent = record["Transaction Amount"] || "";
    total += currencyValue(record["Transaction Amount"]);

    const category = document.createElement("td");
    category.textContent = record.Category || "";

    const notes = document.createElement("td");
    notes.innerHTML = formatExpenseNotes(record.Comment || "", record.URL || "");

    tr.append(date, name, amount, category, notes);
    tbody.appendChild(tr);
  });

  const formattedTotal = total ? `≈ £${total.toFixed(2)}` : "";
  dom.expenseStats.textContent = formattedTotal ? `${records.length} items · ${formattedTotal}` : `${records.length} items`;
}

function formatExpenseNotes(comment, url) {
  const safe = escapeHtml(comment);
  const formatted = safe
    .replace(/ City:/g, "<br><strong>City:</strong>")
    .replace(/ Type:/g, "<br><strong>Type:</strong>")
    .replace(/ Status:/g, "<br><strong>Status:</strong>")
    .replace(/ Linked days:/g, "<br><strong>Linked days:</strong>")
    .replace(/\n/g, "<br>");
  if (url) {
    return `${formatted}${formatted ? "<br>" : ""}<a href="${url}" target="_blank" rel="noopener noreferrer">Open link</a>`;
  }
  return formatted;
}

function renderWishlist(records) {
  if (!dom.wishlistGrid) {
    return;
  }
  dom.wishlistGrid.innerHTML = "";
  if (!records.length) {
    dom.wishlistGrid.innerHTML = '<p class="empty-state">Wishlist CSV is empty.</p>';
    dom.wishlistStats.textContent = "0 entries";
    return;
  }

  records.forEach((record) => {
    const card = document.createElement("article");
    card.className = "idea-card";

    const title = document.createElement("h3");
    title.className = "idea-card__title";
    title.textContent = record.Name || "";

    const category = document.createElement("p");
    category.className = "idea-card__meta";
    category.textContent = `${record.Category || ""} · ${record.Location || ""}`.replace(/\s·\s$/, "");

    const why = document.createElement("p");
    why.className = "idea-card__text";
    why.textContent = record["Why it still inspires us"] || "";

    const how = document.createElement("p");
    how.className = "idea-card__text idea-card__text--secondary";
    how.textContent = record["How to slot it in"] || "";

    card.append(title);
    if (category.textContent.trim()) {
      card.append(category);
    }
    if (why.textContent.trim()) {
      card.append(why);
    }
    if (how.textContent.trim()) {
      card.append(how);
    }
    if (record["Google Maps URL"]) {
      const link = document.createElement("a");
      link.href = record["Google Maps URL"];
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "idea-card__link";
      link.textContent = "Map it";
      card.append(link);
    }

    dom.wishlistGrid.appendChild(card);
  });

  dom.wishlistStats.textContent = `${records.length} idea${records.length === 1 ? "" : "s"}`;
}

function currencyValue(raw) {
  if (!raw) {
    return 0;
  }
  const numeric = raw.replace(/[^0-9.-]/g, "");
  const value = Number.parseFloat(numeric);
  return Number.isFinite(value) ? value : 0;
}

function setTimestamp() {
  if (!dom.timestamp) {
    return;
  }
  const now = new Date();
  const formatted = now.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  dom.timestamp.textContent = `Synced ${formatted}`;
}

function hide(element) {
  if (!element) {
    return;
  }
  element.setAttribute("hidden", "true");
}

function show(element) {
  if (!element) {
    return;
  }
  element.removeAttribute("hidden");
}

function escapeHtml(value) {
  const input = value ?? "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
