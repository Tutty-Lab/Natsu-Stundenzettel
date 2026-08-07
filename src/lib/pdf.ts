const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

export function safeFileName(text: string): string {
  const plain = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return (
    plain.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") ||
    "Stundenzettel"
  );
}

export async function elementsToPdf(
  elements: HTMLElement[],
  filename: string,
): Promise<void> {
  if (elements.length === 0) return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);
  const documentPdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const elementWidth = element.scrollWidth;
    const elementHeight = element.scrollHeight;
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      width: elementWidth,
      height: elementHeight,
      windowWidth: elementWidth,
      windowHeight: elementHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const ratio = canvas.height / canvas.width;
    let width = A4_WIDTH_MM;
    let height = width * ratio;
    if (height > A4_HEIGHT_MM) {
      height = A4_HEIGHT_MM;
      width = height / ratio;
    }

    if (index > 0) documentPdf.addPage();
    documentPdf.addImage(
      canvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      (A4_WIDTH_MM - width) / 2,
      0,
      width,
      height,
    );
  }

  downloadPdfBlob(documentPdf.output("blob"), filename);
}

export function downloadPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
