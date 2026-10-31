(function () {
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function randomDelay(min, max) {
    min = min || 120;
    max = max || 420;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function cleanNumber(text) {
    return String(text || "").replace(/[^\d]/g, "");
  }
  function cleanText(text) {
    return String(text || "")
      .replace(/[\s\u00A0]+/g, "")
      .replace(/\.\./g, ".");
  }
  const appOrigin = document.currentScript && document.currentScript.dataset.appOrigin;
  window.__pirateScannerLoading = false;
  if (!appOrigin) return;
  if (window.__pirateScannerRunning) return;
  window.__pirateScannerRunning = true;
  const palette = { background: "#121923", foreground: "#edf0f4", border: "#d4af37" };
  function notify(message, final) {
    let box = document.getElementById("pirateScannerNotification");
    if (!box) {
      box = document.createElement("div");
      box.id = "pirateScannerNotification";
      box.setAttribute("role", "status");
      box.style.cssText = "position:fixed;z-index:2147483647;bottom:20px;right:20px;max-width:360px;padding:14px;border:1px solid;border-radius:6px;font:14px/1.5 Arial,sans-serif;white-space:pre-wrap";
      box.style.background = palette.background; box.style.color = palette.foreground; box.style.borderColor = palette.border;
      document.body.appendChild(box);
    }
    box.textContent = "Pirate Scanner · " + message;
    clearTimeout(window.__pirateScannerNoticeTimer);
    if (final) window.__pirateScannerNoticeTimer = setTimeout(() => box.remove(), 20000);
  }
  const host = /^s([1-9]\d{0,3})-([a-z]{2,8})\.ikariam\.gameforge\.com$/i.exec(location.hostname);
  if (!host || location.protocol !== "https:") {
    notify("Open an Ikariam game server first.", true); window.__pirateScannerRunning = false; return;
  }
  const connection = window.__pirateScannerConnection;
  const nonce = connection?.origin === appOrigin ? connection.nonce : crypto.randomUUID();
  const bridge = connection?.origin === appOrigin ? connection.bridge : window.open(appOrigin + "/scanner-connect#origin=" + encodeURIComponent(location.origin) + "&nonce=" + nonce, "pirate-scanner-" + nonce, "width=480,height=600");
  delete window.__pirateScannerConnection;
  if (!bridge) {
    notify("Allow pop-ups for Ikariam, then click Pirate Scanner again.", true); window.__pirateScannerRunning = false; return;
  }
  let readyResolve, readyReject, importResolve, importReject;
  let readySettled = false;
  let cancelled = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  let timeout;
  function receive(event) {
    if (event.origin !== appOrigin || event.source !== bridge || event.data?.channel !== "pirate-scanner" || event.data?.nonce !== nonce) return;
    if (event.data.type === "ready") { readySettled = true; readyResolve(event.data); }
    if (event.data.type === "success" && importResolve) importResolve(event.data);
    if (event.data.type === "error") {
      cancelled = true;
      const error = new Error(event.data.error || "Import failed.");
      if (!readySettled) { readySettled = true; readyReject(error); }
      if (importReject) importReject(error);
    }
  }
  window.addEventListener("message", receive);
  const heartbeat = setInterval(() => {
    if (bridge.closed) {
      cancelled = true;
      if (!readySettled) { readySettled = true; readyReject(new Error("Scanner connection window was closed.")); }
      if (importReject) importReject(new Error("Scanner connection window was closed."));
    } else bridge.postMessage({ channel: "pirate-scanner", nonce, type: "heartbeat" }, appOrigin);
  }, 2000);
  function getCurrentPlayerInfo() {
    const nameEl = document.querySelector("li.avatarName a.noViewParameters");
    const pointsEl = document.querySelector("li.capturePoints span.value");
    const name = nameEl ? nameEl.textContent.trim() : "";
    const points = pointsEl ? cleanNumber(pointsEl.textContent) : "";
    if (!name && !points) return "";
    return "CURRENT_PLAYER " + points + " points " + name;
  }
  function getViewData(html) {
    const match = html.match(
      /\["updateBackgroundData",(.*?)]\s*,\s*\["updateTemplateData"/,
    );
    if (!match || !match[1]) {
      throw new Error("Could not extract Ikariam background data.");
    }
    return JSON.parse(match[1]);
  }
  function getCurrentCityIdFromPage() {
    if (typeof bgViewData !== "undefined" && bgViewData.currentCityId) {
      return parseInt(bgViewData.currentCityId, 10);
    }
    return undefined;
  }
  function extractPlayers() {
    const players = [];
    const rows = document.querySelectorAll("#pirateHighscore > *");
    rows.forEach((row) => {
      const link = row.querySelector("a");
      const spans = row.querySelectorAll("span");
      const bootySpan = row.querySelector("span.pirateBooty");
      if (!spans || spans.length < 2) return;
      const player = {
        cityId: undefined,
        current: false,
        position: spans[0] ? spans[0].innerText : "",
        points: bootySpan ? bootySpan.innerText : "No data",
        name: "",
      };
      if (!link) {
        if (!/player/.test(row.className)) return;
        player.name = spans[2] ? spans[2].innerText : "Current player";
        player.cityId = getCurrentCityIdFromPage();
        player.current = true;
      } else {
        player.name = link.innerText;
        const onclick = link.getAttribute("onclick") || "";
        const cityMatch = onclick.match(/cityId=(\d+)/);
        if (!cityMatch) return;
        player.cityId = parseInt(cityMatch[1], 10);
      }
      if (player.cityId) players.push(player);
    });
    return players;
  }
  async function enrichPlayerWithCity(player) {
    await sleep(randomDelay());
    const response = await fetch(
      "?view=island&cityId=" + encodeURIComponent(player.cityId),
      { credentials: "same-origin" },
    );
    if (!response.ok) throw new Error("Could not fetch city information.");
    const html = await response.text();
    const viewData = getViewData(html);
    const island = {
      id: parseInt(viewData.id, 10),
      name: viewData.name,
      x: parseInt(viewData.xCoord, 10),
      y: parseInt(viewData.yCoord, 10),
    };
    const city = (viewData.cities || []).find(
      (c) => parseInt(c.id, 10) === parseInt(player.cityId, 10),
    );
    if (city) {
      player.city = {
        id: city.id,
        name: city.name,
        island: island,
        ownerAllyTag: city.ownerAllyTag || "",
      };
    }
    if (!city) throw new Error("Could not locate city " + player.cityId + ". No data was imported.");
    return player;
  }
  function generateRanksText(players) {
    return players
      .map((player) => {
        const points = cleanText(player.points);
        const formattedPosition = String(player.position || "").replace(
          /\s*\.\s*$/,
          ".",
        );
        let text =
          formattedPosition + " " + points + " points " + player.name;
        if (player.city) {
          if (player.city.ownerAllyTag) {
            text += " (" + player.city.ownerAllyTag + ")";
          }
          text +=
            " en " +
            player.city.island.x +
            ":" +
            player.city.island.y +
            ", " +
            player.city.name;
        }
        return text;
      })
      .join("\n");
  }
  async function runScanner() {
    try {
      notify("Checking world mapping and alliance...");
      await ready; // No expensive game requests before authenticated world resolution.
      if (cancelled) throw new Error("Scan cancelled.");
      if (!document.getElementById("pirateHighscore")) {
        const position17 = document.getElementById("position17");
        if (!position17 || !/pirateFortress/.test(position17.className))
          throw new Error("Open a city with Pirate Fortress first.");
        const fortressLink = document.getElementById("js_CityPosition17Link");
        if (!fortressLink) throw new Error("Open Pirate Fortress rankings first.");
        fortressLink.click();
        await sleep(2200);
      }
      const currentPlayerLine = getCurrentPlayerInfo();
      const players = extractPlayers();
      if (!players.length) throw new Error("No pirate rankings found. Open Pirate Fortress rankings first.");
      for (let i = 0; i < players.length; i++) {
        if (cancelled) throw new Error("Scanner connection lost. No data was imported.");
        notify("Scanning " + (i + 1) + " / " + players.length + "...");
        await enrichPlayerWithCity(players[i]);
      }
      const result = [currentPlayerLine, generateRanksText(players)].filter(Boolean).join("\n");
      notify("Collected " + players.length + " players. Submitting...");
      const imported = new Promise((resolve, reject) => { importResolve = resolve; importReject = reject; });
      timeout = setTimeout(() => importReject(new Error("Import confirmation timed out. Check Highscore before scanning again.")), 180000);
      bridge.postMessage({ channel: "pirate-scanner", nonce, type: "import", request_id: nonce, raw_text: result }, appOrigin);
      const confirmation = await imported;
      notify("Database import confirmed: " + confirmation.entries_count + " players." + (confirmation.invalid_count ? " Invalid rows: " + confirmation.invalid_count : ""), true);
    } catch (error) {
      notify(error && error.message ? error.message : String(error), true);
    } finally {
      clearTimeout(timeout); clearInterval(heartbeat);
      window.removeEventListener("message", receive);
      window.__pirateScannerRunning = false;
      if (!bridge.closed) bridge.close();
    }
  }
  runScanner();
})();
