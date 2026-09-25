import { describe, expect, it } from "vitest";
import { parseHighscoreText, parseLine } from "./parser";

describe("scanner parser", () => {
  it("parsira red sa numeričkim city_name i koordinatom 100", () => {
    const row = parseLine("497. 7,414 points Luffy en 100:68, 300");
    expect(row.valid).toBe(true);
    expect(row.kind).toBe("scanner");
    expect(row.rank).toBe(497);
    expect(row.piratePoints).toBe(7414);
    expect(row.ikariamUsername).toBe("Luffy");
    expect(row.allianceTag).toBeNull();
    expect(row.coordinates).toBe("100:68");
    expect(row.cityName).toBe("300");
  });

  it("parsira red sa savezom i tekstualnim city_name", () => {
    const row = parseLine(
      "499. 7,414 points Programmer (BOEM) en 30:2, Cryptology",
    );
    expect(row.valid).toBe(true);
    expect(row.kind).toBe("scanner");
    expect(row.rank).toBe(499);
    expect(row.piratePoints).toBe(7414);
    expect(row.ikariamUsername).toBe("Programmer");
    expect(row.allianceTag).toBe("BOEM");
    expect(row.coordinates).toBe("30:2");
    expect(row.cityName).toBe("Cryptology");
  });

  it("parsira red sa savezom NOR", () => {
    const row = parseLine(
      "504. 7,414 points Maskinen (NOR) en 92:29, dolphin1",
    );
    expect(row.valid).toBe(true);
    expect(row.kind).toBe("scanner");
    expect(row.rank).toBe(504);
    expect(row.piratePoints).toBe(7414);
    expect(row.ikariamUsername).toBe("Maskinen");
    expect(row.allianceTag).toBe("NOR");
    expect(row.coordinates).toBe("92:29");
    expect(row.cityName).toBe("dolphin1");
  });

  it("odbija koordinate van opsega 1-100", () => {
    expect(parseLine("1. 100 points A en 0:50, Grad").valid).toBe(false);
    expect(parseLine("1. 100 points A en 101:50, Grad").valid).toBe(false);
  });

  it("manual format i dalje radi kao fallback", () => {
    const row = parseLine("196 . 10,399 Capture Points Linkinpark88");
    expect(row.valid).toBe(true);
    expect(row.kind).toBe("manual");
    expect(row.ikariamUsername).toBe("Linkinpark88");
  });

  it("parseHighscoreText obrađuje sva tri scanner reda", () => {
    const rows = parseHighscoreText(
      [
        "497. 7,414 points Luffy en 100:68, 300",
        "499. 7,414 points Programmer (BOEM) en 30:2, Cryptology",
        "504. 7,414 points Maskinen (NOR) en 92:29, dolphin1",
      ].join("\n"),
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.valid).toBe(true);
      expect(r.kind).toBe("scanner");
    }
  });
});
