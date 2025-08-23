(() => {
  "use strict";

  const LIMITS = {
    title: 256,
    description: 4096,
    authorName: 256,
    footerText: 2048,
    fieldName: 256,
    fieldValue: 1024,
    buttonLabel: 80,
    total: 6000,
  };

  const $ = (id) => document.getElementById(id);
  const notify = (type, title, msg) =>
    typeof window.showNotification === "function"
      ? window.showNotification(type, title, msg)
      : alert(`${title}\n${msg}`);
  const debounce = (fn, ms = 120) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
  const htmlEscape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );

  const isHttpUrl = (v) => {
    const s = String(v || "").trim();
    if (!s) return true;
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  const markValidity = (input, ok) => {
    if (!input) return ok;
    input.classList.toggle("invalid", !ok);
    return ok;
  };

  function validateAllUrls(showToast = false) {
    const problems = [];
    let firstInvalid = null;

    const urlInputs = [
      ["url", "Embed URL"],
      ["thumb", "Thumbnail URL"],
      ["image", "Image URL"],
      ["authorIcon", "Author icon URL"],
      ["authorUrl", "Author URL"],
      ["footerIcon", "Footer icon URL"],
    ];

    for (const [id, label] of urlInputs) {
      const el = $(id);
      const ok = isHttpUrl(el?.value);
      if (!ok) {
        problems.push(`${label}: please enter a full http(s) URL`);
        if (!firstInvalid) firstInvalid = el;
      }
      markValidity(el, ok);
    }

    document.querySelectorAll("#buttons .button-row").forEach((row, i) => {
      const idx = i + 1;
      const styleEl = row.querySelector("select.control");
      const activeEl = row.querySelector('label.inline input[type="checkbox"]');
      const inputs = row.querySelectorAll("input.control");
      const urlEl = inputs[1];
      const customEl = inputs[2];
      const isLink = styleEl?.value === "Link";
      const active = !!activeEl?.checked;

      if (!active) {
        markValidity(urlEl, true);
        markValidity(customEl, true);
        return;
      }

      if (isLink) {
        const ok = !!urlEl?.value.trim() && isHttpUrl(urlEl.value);
        markValidity(urlEl, ok);
        markValidity(customEl, true);
        if (!ok) {
          problems.push(`Button ${idx}: Link style needs a valid URL`);
          if (!firstInvalid) firstInvalid = urlEl;
        }
      } else {
        const ok = !!customEl?.value.trim();
        markValidity(customEl, ok);
        markValidity(urlEl, true);
        if (!ok) {
          problems.push(`Button ${idx}: non-Link style needs a Custom ID`);
          if (!firstInvalid) firstInvalid = customEl;
        }
      }
    });

    const ok = problems.length === 0;
    if (!ok && showToast) {
      notify("fail", "Invalid fields", problems[0]);
      firstInvalid?.focus();
    }
    return { ok, errors: problems, firstInvalid };
  }

  function makeFieldRow(initial = {}) {
    const wrap = document.createElement("div");
    wrap.className = "field-row";

    const colName = document.createElement("div");
    colName.className = "col";
    const name = Object.assign(document.createElement("input"), {
      className: "control",
      placeholder: "Title",
      maxLength: LIMITS.fieldName,
      value: initial.name || "",
    });
    const nameCnt = Object.assign(document.createElement("div"), {
      className: "counter-right cnt-name",
    });
    colName.append(name, nameCnt);

    const colValue = document.createElement("div");
    colValue.className = "col";
    const value = Object.assign(document.createElement("input"), {
      className: "control",
      placeholder: "Value",
      maxLength: LIMITS.fieldValue,
      value: initial.value || "",
    });
    const valueCnt = Object.assign(document.createElement("div"), {
      className: "counter-right cnt-value",
    });
    colValue.append(value, valueCnt);

    const right = document.createElement("div");
    right.className = "inline";
    const inlineWrap = document.createElement("label");
    inlineWrap.className = "inline";
    const inline = Object.assign(document.createElement("input"), {
      type: "checkbox",
      checked: !!initial.inline,
    });
    const inlineLbl = Object.assign(document.createElement("span"), {
      className: "muted",
      textContent: "inline",
    });
    inlineWrap.append(inline, inlineLbl);

    const remove = Object.assign(document.createElement("button"), {
      className: "btn secondary",
      textContent: "✕",
      title: "Remove field",
    });
    remove.addEventListener("click", () => {
      wrap.remove();
      updatePreview();
      updateCounters();
    });

    right.append(inlineWrap, remove);
    wrap.append(colName, colValue, right);

    [name, value, inline].forEach((el) => {
      el.addEventListener(
        "input",
        debounce(() => {
          updatePreview();
          updateCounters();
          validateAllUrls(false);
        })
      );
      el.addEventListener(
        "change",
        debounce(() => {
          updatePreview();
          updateCounters();
          validateAllUrls(false);
        })
      );
    });

    updateCounters();
    return wrap;
  }

  function renumberButtons() {
    document.querySelectorAll("#buttons .button-row").forEach((row, i) => {
      const title = row.querySelector(".button-title");
      if (title) title.textContent = `Button ${i + 1}`;
    });
  }

  function makeButtonRow(initial = {}) {
    const wrap = document.createElement("div");
    wrap.className = "button-row";

    const header = document.createElement("div");
    header.className = "button-header";

    const title = document.createElement("span");
    title.className = "button-title";
    title.textContent = `Button ${
      document.querySelectorAll("#buttons .button-row").length + 1
    }`;

    const remove = Object.assign(document.createElement("button"), {
      className: "remove-btn",
      textContent: "✕",
      title: "Remove button",
    });
    remove.addEventListener("click", () => {
      wrap.remove();
      renumberButtons();
      updatePreview();
      updateCounters();
    });

    header.append(title, remove);

    const body = document.createElement("div");
    body.className = "button-body";

    const colLabel = document.createElement("div");
    colLabel.className = "col";
    const label = Object.assign(document.createElement("input"), {
      className: "control",
      placeholder: "Label",
      maxLength: LIMITS.buttonLabel,
      value: initial.label || "",
    });
    const labelCnt = Object.assign(document.createElement("div"), {
      className: "counter-right cnt-btn-label",
    });
    colLabel.append(label, labelCnt);

    const style = document.createElement("select");
    style.className = "control select";
    ["Primary", "Secondary", "Success", "Danger", "Link"].forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      style.appendChild(o);
    });
    style.value = initial.style || "Primary";

    const url = Object.assign(document.createElement("input"), {
      className: "control",
      placeholder: "https://... (Link)",
      value: initial.url || "",
    });
    const customId = Object.assign(document.createElement("input"), {
      className: "control",
      placeholder: "Custom ID (non-Link)",
      value: initial.custom_id || "",
    });

    const activeWrap = document.createElement("label");
    activeWrap.className = "inline";
    const active = Object.assign(document.createElement("input"), {
      type: "checkbox",
      checked: initial.enabled ?? false,
    });
    const activeLbl = Object.assign(document.createElement("span"), {
      className: "muted",
      textContent: "Active",
    });
    activeWrap.append(active, activeLbl);

    const sync = () => {
      const isLink = style.value === "Link";
      url.disabled = !isLink;
      customId.disabled = isLink;
      markValidity(url, true);
      markValidity(customId, true);
    };
    style.addEventListener("change", () => {
      sync();
      updatePreview();
      validateAllUrls(false);
    });
    sync();

    [label, url, customId, active].forEach((el) => {
      el.addEventListener(
        "input",
        debounce(() => {
          updatePreview();
          updateCounters();
          validateAllUrls(false);
        })
      );
      el.addEventListener(
        "change",
        debounce(() => {
          updatePreview();
          updateCounters();
          validateAllUrls(false);
        })
      );
    });

    body.append(colLabel, style, url, customId, activeWrap);
    wrap.append(header, body);
    return wrap;
  }

  function readFields() {
    return Array.from(document.querySelectorAll("#fields .field-row"))
      .map((row) => {
        const name = row.querySelector(".col input.control");
        const value = row.querySelector(".col:nth-child(2) input.control");
        const inline = row.querySelector('input[type="checkbox"]').checked;
        return {
          name: (name?.value || "").trim(),
          value: (value?.value || "").trim(),
          inline,
        };
      })
      .filter((f) => f.name || f.value)
      .slice(0, 25);
  }

  function readButtons() {
    return Array.from(document.querySelectorAll("#buttons .button-row"))
      .map((row) => {
        const activeCheckbox = row.querySelector(
          'label.inline input[type="checkbox"]'
        );
        if (!activeCheckbox?.checked) return null;

        const labelEl =
          row.querySelector(".col input.control") ||
          row.querySelector("input.control");
        const styleEl = row.querySelector("select.control");
        const inputs = row.querySelectorAll("input.control");
        const urlEl = inputs[1];
        const customEl = inputs[2];
        const isLink = styleEl.value === "Link";

        return {
          label: (labelEl?.value || "Button").trim(),
          style: styleEl.value,
          url: isLink ? (urlEl?.value || "").trim() : undefined,
          custom_id: !isLink ? (customEl?.value || "").trim() : undefined,
        };
      })
      .filter(Boolean)
      .slice(0, 25);
  }

  function buildPayload() {
    const channelId = $("channel").value;
    const mentionDropdown = $("mention").value;
    const mentionRole = $("mentionRole").value.trim();
    const mention = mentionRole ? mentionRole : mentionDropdown || null;

    const rawDesc = String($("description").value || "");
    const description = rawDesc.trim().length > 0 ? rawDesc.trim() : "\u200b";

    const embed = {
      title: $("title").value.trim(),
      description,
      url: $("url").value.trim() || null,
      color: $("color").value,
      thumbnail: $("thumb").value.trim() || null,
      image: $("image").value.trim() || null,
      author: {
        name: $("authorName").value.trim(),
        icon_url: $("authorIcon").value.trim() || null,
        url: $("authorUrl").value.trim() || null,
      },
      footer: {
        text: $("footerText").value.trim(),
        icon_url: $("footerIcon").value.trim() || null,
      },
      fields: readFields(),
    };

    const buttons = readButtons();
    const messageContent = "";
    const suppressEmbeds = false;

    return {
      channelId,
      messageContent,
      embed,
      buttons,
      mention,
      suppressEmbeds,
    };
  }

  function setCounter(elOrId, len, limit, attachInvalidTo) {
    const el = typeof elOrId === "string" ? $(elOrId) : elOrId;
    if (!el) return;
    el.textContent = `${len}/${limit}`;
    const over = len > limit;
    el.classList.toggle("over", over);
    attachInvalidTo?.classList.toggle("invalid", over);
    return over;
  }

  function updateCounters() {
    const overTitle = setCounter(
      "cntTitle",
      ($("title")?.value || "").length,
      LIMITS.title,
      $("title")
    );
    const descLen = ($("description")?.value || "").length;
    const overDesc = setCounter(
      "cntDescription",
      descLen,
      LIMITS.description,
      $("description")
    );
    const overAuth = setCounter(
      "cntAuthorName",
      ($("authorName")?.value || "").length,
      LIMITS.authorName,
      $("authorName")
    );
    const overFoot = setCounter(
      "cntFooterText",
      ($("footerText")?.value || "").length,
      LIMITS.footerText,
      $("footerText")
    );

    let fieldsLen = 0,
      overAnyField = false;
    document.querySelectorAll("#fields .field-row").forEach((row) => {
      const nameInput = row.querySelector(".col input.control");
      const valueInput = row.querySelector(".col:nth-child(2) input.control");
      const nameCnt =
        row.querySelector(".cnt-name") || row.querySelector(".counter-right");
      const valueCnt =
        row.querySelector(".cnt-value") ||
        row.querySelectorAll(".counter-right")[1];

      const nlen = (nameInput?.value || "").length;
      const vlen = (valueInput?.value || "").length;
      fieldsLen += nlen + vlen;

      const overN = setCounter(nameCnt, nlen, LIMITS.fieldName, nameInput);
      const overV = setCounter(valueCnt, vlen, LIMITS.fieldValue, valueInput);
      if (overN || overV) overAnyField = true;
    });

    let overAnyButton = false;
    document.querySelectorAll("#buttons .button-row").forEach((row) => {
      const labelInput =
        row.querySelector(".col input.control") ||
        row.querySelector("input.control");
      const lblCnt =
        row.querySelector(".cnt-btn-label") ||
        row.querySelector(".counter-right");
      const lblLen = (labelInput?.value || "").length;
      const overLbl = setCounter(
        lblCnt,
        lblLen,
        LIMITS.buttonLabel,
        labelInput
      );
      if (overLbl) overAnyButton = true;
    });

    const totalLen =
      ($("title")?.value || "").length +
      descLen +
      ($("authorName")?.value || "").length +
      ($("footerText")?.value || "").length +
      fieldsLen;

    const overTotal = setCounter("cntTotal", totalLen, LIMITS.total);

    $("send").disabled = !!(
      overTitle ||
      overDesc ||
      overAuth ||
      overFoot ||
      overAnyField ||
      overAnyButton ||
      overTotal
    );
    return !$("send").disabled;
  }

  function renderPreview(payload) {
    const pv = $("preview");
    const e = payload.embed || {};
    const color = e.color || "#2b61ff";

    const authorIconHtml =
      isHttpUrl(e.author?.icon_url) && e.author?.icon_url
        ? `<img src="${e.author.icon_url}" alt="" style="width:18px;height:18px;object-fit:cover;border-radius:50%;margin-right:6px;vertical-align:-3px;">`
        : "";

    const fieldsHtml = (e.fields || [])
      .map(
        (f) => `
      <div style="margin:6px 0;">
        <div style="color:#9db2ff;font-size:12px;">${htmlEscape(f.name || "")}${
          f.inline ? '<span style="opacity:.6"> (inline)</span>' : ""
        }</div>
        <div>${htmlEscape(f.value || "")}</div>
      </div>`
      )
      .join("");

    const showDesc = e.description && e.description !== "\u200b";

    const btnsHtml = (payload.buttons || [])
      .slice(0, 5)
      .map((b) => {
        const isLink = b.style === "Link";
        const badge = isLink ? "link" : (b.style || "").toLowerCase();
        const hint = isLink ? b.url || "" : b.custom_id || "";
        return `<span class="chip" title="${htmlEscape(hint)}">${htmlEscape(
          b.label || "Button"
        )} • ${badge}</span>`;
      })
      .join(" ");

    const footerIconHtml =
      isHttpUrl(e.footer?.icon_url) && e.footer?.icon_url
        ? `<img src="${e.footer.icon_url}" alt="" style="width:16px;height:16px;object-fit:cover;border-radius:50%;margin-right:6px;vertical-align:-3px;">`
        : "";

    const thumbHtml =
      isHttpUrl(e.thumbnail) && e.thumbnail
        ? `<div style="margin-top:10px;"><img src="${e.thumbnail}" alt="" style="max-width:120px;max-height:120px;border-radius:8px;"></div>`
        : "";

    const imageHtml =
      isHttpUrl(e.image) && e.image
        ? `<div style="margin-top:10px;"><img src="${e.image}" alt="" style="max-width:100%;border-radius:10px;"></div>`
        : "";

    const footerBlock =
      e.footer?.text || footerIconHtml
        ? `<div class="muted" style="margin-top:10px;">${footerIconHtml}${htmlEscape(
            e.footer?.text || ""
          )}</div>`
        : "";

    pv.innerHTML = `
      <div style="border-left:4px solid ${color}; padding-left:12px;">
        ${
          e.author?.name
            ? `<div class="muted" style="margin-bottom:6px;">${authorIconHtml}${htmlEscape(
                e.author.name
              )}</div>`
            : ""
        }
        ${
          e.title
            ? `<div style="font-weight:600;">${htmlEscape(e.title)}</div>`
            : ""
        }
        ${
          showDesc
            ? `<div style="margin-top:6px; white-space:pre-wrap;">${htmlEscape(
                e.description
              )}</div>`
            : ""
        }
        ${fieldsHtml ? `<div style="margin-top:8px;">${fieldsHtml}</div>` : ""}
        ${thumbHtml}
        ${imageHtml}
        ${footerBlock}
        ${
          btnsHtml
            ? `<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">${btnsHtml}</div>`
            : ""
        }
      </div>
    `;
  }
  const updatePreview = debounce(() => {
    renderPreview(buildPayload());
  }, 50);

  async function loadChannels() {
    const sel = $("channel");
    sel.innerHTML = `<option value="">Loading...</option>`;
    if (!window.api || typeof window.api.getEmbedTargets !== "function") {
      sel.innerHTML = `<option value="">(bridge unavailable)</option>`;
      notify("fail", "Unavailable", "API bridge not available.");
      return;
    }
    try {
      const res = await window.api.getEmbedTargets();
      if (!res?.ok) {
        sel.innerHTML = `<option value="">(error)</option>`;
        notify(
          "fail",
          "Load channels",
          res?.error || "Failed to fetch channels."
        );
        return;
      }
      const channels = res.channels || [];
      sel.innerHTML =
        `<option value="">Select a channel...</option>` +
        channels
          .map((c) => `<option value="${c.id}">${c.name}</option>`)
          .join("");
    } catch (e) {
      sel.innerHTML = `<option value="">(error)</option>`;
      notify("fail", "Load channels", String(e?.message || e));
    }
  }

  async function sendEmbed() {
    if (!window.api || typeof window.api.sendEmbed !== "function") {
      notify("fail", "Unavailable", "API bridge not available.");
      return;
    }

    const { ok } = validateAllUrls(true);
    if (!ok) return;

    if (!updateCounters()) {
      notify("fail", "Too long", "Some field exceeds Discord limits.");
      return;
    }

    const payload = buildPayload();
    if (!payload.channelId) {
      notify("fail", "Missing channel", "Select a channel.");
      return;
    }

    $("send").disabled = true;
    try {
      const res = await window.api.sendEmbed(payload);
      if (res?.ok) {
        notify("success", "Sent", "Embed posted successfully.");
      } else {
        notify("fail", "Error", res?.error || "Failed to send embed.");
      }
    } catch (e) {
      notify("fail", "Error", String(e?.message || e));
    } finally {
      $("send").disabled = false;
    }
  }

  function clearAll() {
    [
      "title",
      "url",
      "description",
      "thumb",
      "image",
      "authorName",
      "authorIcon",
      "authorUrl",
      "footerText",
      "footerIcon",
      "mentionRole",
    ].forEach((id) => ($(id).value = ""));
    $("mention").value = "";
    $("color").value = "#2b61ff";
    $("fields").innerHTML = "";
    $("buttons").innerHTML = "";
    updatePreview();
    updateCounters();
    validateAllUrls(false);
  }

  function addField(initial) {
    $("fields").appendChild(makeFieldRow(initial || {}));
    updatePreview();
    updateCounters();
    validateAllUrls(false);
  }
  function addButton(initial) {
    const box = $("buttons");
    if (box.querySelectorAll(".button-row").length >= 25) return;
    const row = makeButtonRow(initial || { style: "Primary" });
    box.appendChild(row);
    renumberButtons();
    updatePreview();
    updateCounters();
    validateAllUrls(false);
  }

  function attachChangeTracking() {
    [
      "channel",
      "mention",
      "mentionRole",
      "title",
      "url",
      "description",
      "color",
      "thumb",
      "image",
      "authorName",
      "authorIcon",
      "authorUrl",
      "footerText",
      "footerIcon",
    ].forEach((id) => {
      $(id).addEventListener("input", () => {
        updatePreview();
        updateCounters();
        validateAllUrls(false);
      });
      $(id).addEventListener("change", () => {
        updatePreview();
        updateCounters();
        validateAllUrls(false);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("addField").addEventListener("click", () => addField());
    $("addButton").addEventListener("click", () => addButton());
    $("send").addEventListener("click", sendEmbed);
    $("clear").addEventListener("click", clearAll);
    attachChangeTracking();

    addField({ name: "Title", value: "Value", inline: true });
    addButton({
      label: "Button name",
      style: "Link",
      url: "https://discord.com",
    });

    await loadChannels();
    updatePreview();
    updateCounters();
    validateAllUrls(false);
  });
})();
