import { describe, expect, it } from "vitest";
import { reportToHtml } from "./reportHtml";

describe("reportToHtml", () => {
  it("escapa contenido y marca datos simulados", () => {
    const html = reportToHtml(
      {
        simulated: true,
        spaces: [{ name: "<script>alert(1)</script>", co2_avg: 800 }],
        narrative: { text: "Todo <b>normal</b>", label: "Narrativa determinista (sin IA)" },
      },
      "Reporte",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("DATOS SIMULADOS");
    expect(html).toContain("sin IA");
  });
});
