// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000" }

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickUpload } from "@/components/quick-upload";

const entityId = "11111111-1111-4111-8111-111111111111";

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

function jpeg(name = "zdjecie.jpg", size?: number) {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], name, { type: "image/jpeg", lastModified: 1234 });
  if (size) Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

async function reachFilesStep(fetchMock: ReturnType<typeof vi.fn>) {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ ok: true }))
    .mockResolvedValueOnce(jsonResponse({ employee: { firstName: "Jan" }, entities: [{ id: entityId, displayName: "Toruń" }] }));
  const user = userEvent.setup({ applyAccept: false });
  render(<QuickUpload qrToken={"q".repeat(36)} qrName="Test QR" />);
  await user.type(screen.getByLabelText("Numer telefonu"), "+48500100200");
  await user.click(screen.getByRole("button", { name: /Potwierdź i przejdź dalej/ }));
  await screen.findByRole("heading", { name: "Wybierz podmiot" });
  await user.click(screen.getByRole("button", { name: "Dalej" }));
  await screen.findByRole("heading", { name: "Wybierz typ dokumentu" });
  await user.click(screen.getByRole("button", { name: "Dalej" }));
  await screen.findByRole("heading", { name: "Dodaj zdjęcie lub PDF" });
  return user;
}

describe("mobilny upload QR", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let objectUrlIndex = 0;

  beforeEach(() => {
    objectUrlIndex = 0;
    localStorage.clear();
    localStorage.setItem("wb_docs_client", "test-client-id");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:test-${++objectUrlIndex}`) });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    if (!crypto.randomUUID) Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => "12345678-1234-4234-8234-123456789012" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("dodaje rzeczywisty File z aparatu i pokazuje miniaturę", async () => {
    const user = await reachFilesStep(fetchMock);
    const camera = screen.getByLabelText("Zrób zdjęcie");
    expect(camera.getAttribute("accept")).toBe("image/*");
    expect(camera.getAttribute("capture")).toBe("environment");

    await user.upload(camera, jpeg("aparat.jpg"));

    expect(screen.getByText("Dodane strony: 1")).toBeTruthy();
    expect(screen.getByText("aparat.jpg")).toBeTruthy();
    expect(screen.getByAltText("Miniatura strony 1").getAttribute("src")).toBe("blob:test-1");
    expect((screen.getByRole("button", { name: "Przejdź do podsumowania" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("dodaje zdjęcie wybrane z galerii", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Wybierz z galerii lub plików"), jpeg("galeria.jpg"));
    expect(screen.getByText("galeria.jpg")).toBeTruthy();
    expect(screen.getByText("Dodane strony: 1")).toBeTruthy();
  });

  it("dodaje dwie strony i pozwala usunąć jedną", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Wybierz z galerii lub plików"), [jpeg("strona-1.jpg"), jpeg("strona-2.jpg")]);
    expect(screen.getByText("Dodane strony: 2")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Usuń stronę 1" }));

    expect(screen.getByText("Dodane strony: 1")).toBeTruthy();
    expect(screen.queryByText("strona-1.jpg")).toBeNull();
    expect(screen.getByText("strona-2.jpg")).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
  });

  it("pozwala ponownie wybrać ten sam plik", async () => {
    const user = await reachFilesStep(fetchMock);
    const camera = screen.getByLabelText("Zrób zdjęcie");
    const file = jpeg("ta-sama.jpg");
    await user.upload(camera, file);
    await user.upload(camera, file);
    expect(screen.getByText("Dodane strony: 2")).toBeTruthy();
    expect(screen.getAllByText("ta-sama.jpg")).toHaveLength(2);
  });

  it("anulowanie aparatu nie usuwa wcześniejszych zdjęć ani nie dodaje pustego pliku", async () => {
    const user = await reachFilesStep(fetchMock);
    const camera = screen.getByLabelText("Zrób zdjęcie");
    await user.upload(camera, jpeg("zachowane.jpg"));
    fireEvent.change(camera, { target: { files: [] } });
    expect(screen.getByText("Dodane strony: 1")).toBeTruthy();
    expect(screen.getByText("zachowane.jpg")).toBeTruthy();
  });

  it("pokazuje błąd HEIC przy konkretnym załączniku", async () => {
    const user = await reachFilesStep(fetchMock);
    const heic = new File([new Uint8Array([1, 2, 3])], "iphone.heic", { type: "image/heic" });
    await user.upload(screen.getByLabelText("Wybierz z galerii lub plików"), heic);
    expect(screen.getByText(/Format HEIC\/HEIF nie jest obsługiwany/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Przejdź do podsumowania" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blokuje przejście po przekroczeniu limitu dziesięciu stron", async () => {
    const user = await reachFilesStep(fetchMock);
    const pages = Array.from({ length: 11 }, (_, index) => jpeg(`strona-${index + 1}.jpg`));
    await user.upload(screen.getByLabelText("Wybierz z galerii lub plików"), pages);
    expect(screen.getByText("Dodane strony: 11")).toBeTruthy();
    expect(screen.getByText(/Limit wynosi 10/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Przejdź do podsumowania" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("blokuje plik przekraczający limit rozmiaru", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Zrób zdjęcie"), jpeg("za-duzy.jpg", 10 * 1024 * 1024 + 1));
    expect(screen.getByText("Ten plik przekracza limit 10 MB.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Przejdź do podsumowania" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("przechodzi do podsumowania po dodaniu poprawnego zdjęcia", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Zrób zdjęcie"), jpeg("gotowe.jpg"));
    await user.click(screen.getByRole("button", { name: "Przejdź do podsumowania" }));
    expect(await screen.findByRole("heading", { name: "Sprawdź i wyślij" })).toBeTruthy();
    expect(screen.getByText("1 (0.0 MB)")).toBeTruthy();
  });

  it("zachowuje pliki po powrocie z podsumowania", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Zrób zdjęcie"), jpeg("nie-znikaj.jpg"));
    await user.click(screen.getByRole("button", { name: "Przejdź do podsumowania" }));
    await user.click(screen.getByRole("button", { name: "Wróć" }));
    expect(screen.getByText("nie-znikaj.jpg")).toBeTruthy();
    expect(screen.getByText("Dodane strony: 1")).toBeTruthy();
  });

  it("wysyła w FormData oryginalne obiekty File", async () => {
    const user = await reachFilesStep(fetchMock);
    const first = jpeg("pierwsza.jpg");
    const second = jpeg("druga.jpg");
    await user.upload(screen.getByLabelText("Wybierz z galerii lub plików"), [first, second]);
    await user.click(screen.getByRole("button", { name: "Przejdź do podsumowania" }));
    await user.type(screen.getByLabelText(/Notatka/), "Test formularza");
    fetchMock.mockResolvedValueOnce(jsonResponse({ referenceNumber: "TOR-2026-000001", entity: "Toruń", category: "FAKTURA", status: "ZAPISANY", receivedAt: new Date().toISOString() }));

    await user.click(screen.getByRole("button", { name: /Wyślij dokument/ }));
    await screen.findByRole("heading", { name: "Dokument został zapisany" });

    const request = fetchMock.mock.calls[2][1] as RequestInit;
    const body = request.body as FormData;
    expect(body.get("entityId")).toBe(entityId);
    expect(body.get("category")).toBe("FAKTURA");
    expect(body.get("note")).toBe("Test formularza");
    const sentFiles = body.getAll("files") as File[];
    expect(sentFiles).toHaveLength(2);
    expect(sentFiles[0]).toBe(first);
    expect(sentFiles[1]).toBe(second);
  });

  it("zwalnia pozostałe ObjectURL po odmontowaniu", async () => {
    const user = await reachFilesStep(fetchMock);
    await user.upload(screen.getByLabelText("Zrób zdjęcie"), jpeg("podglad.jpg"));
    cleanup();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1"));
  });
});
