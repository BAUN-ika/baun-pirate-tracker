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
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return Promise.resolve();
  }
  function showManualCopyBox(text) {
    const oldBox = document.getElementById("baunPirateScannerBox");
    if (oldBox) oldBox.remove();
    const box = document.createElement("div");
    box.id = "baunPirateScannerBox";
    box.style.cssText =
      "position:fixed;z-index:999999;top:20px;left:20px;right:20px;background:#111;color:#fff;border:2px solid #d4af37;border-radius:10px;padding:14px;font-family:Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)";
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      "<b>BAUN Pirate Scanner result</b>" +
      '<button id="baunCloseScannerBox" style="padding:6px 10px;cursor:pointer">Close</button>' +
      "</div>" +
      '<p style="margin:0 0 8px 0;color:#ddd">Browser je blokirao automatsko kopiranje. Klikni u polje, zatim Ctrl+A i Ctrl+C.</p>' +
      '<textarea id="baunPirateScannerResult" style="width:100%;height:320px;background:#000;color:#0f0;border:1px solid #555;border-radius:6px;padding:10px;font-family:monospace;font-size:13px"></textarea>';
    document.body.appendChild(box);
    const textarea = document.getElementById("baunPirateScannerResult");
    textarea.value = text;
    textarea.focus();
    textarea.select();
    document.getElementById("baunCloseScannerBox").onclick = function () {
      box.remove();
    };
  }
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
      if (!document.getElementById("pirateHighscore")) {
        const position17 = document.getElementById("position17");
        if (!position17 || !/pirateFortress/.test(position17.className)) {
          alert(
            "Please open a city with Pirate Fortress first, then run Pirate Scanner again.",
          );
          return;
        }
        const fortressLink = document.getElementById("js_CityPosition17Link");
        if (!fortressLink) {
          alert(
            "Could not open Pirate Fortress automatically. Please open Pirate Fortress rankings manually.",
          );
          return;
        }
        fortressLink.click();
        await sleep(2200);
      }
      const currentPlayerLine = getCurrentPlayerInfo();
      const players = extractPlayers();
      if (!players.length) {
        alert(
          "No pirate ranking players found. Please open Pirate Fortress rankings first.",
        );
        return;
      }
      for (const player of players) {
        await enrichPlayerWithCity(player);
      }
      const ranksText = generateRanksText(players);
      const result = [currentPlayerLine, ranksText].filter(Boolean).join("\n");
      try {
        await copyToClipboard(result);
        alert(
          "Pirate data copied! Current player + players scanned: " +
            players.length,
        );
      } catch (copyError) {
        showManualCopyBox(result);
        alert(
          "Pirate data prepared. Browser blocked automatic copy, so copy it manually from the box.",
        );
      }
    } catch (error) {
      alert(
        "Pirate Scanner failed: " +
          (error && error.message ? error.message : String(error)),
      );
    }
  }
  runScanner();
})();