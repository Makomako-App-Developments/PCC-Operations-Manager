import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AuthenticatedImage, AuthenticatedMediaLink, LocalImagePreview } from "./authenticated-image";

const mocks = vi.hoisted(() => ({
  customFetch: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  customFetch: mocks.customFetch,
}));

beforeEach(() => {
  mocks.customFetch.mockReset();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:protected-photo"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LocalImagePreview", () => {
  it("reuses one object URL per file and revokes URLs when replaced or unmounted", () => {
    const firstFile = new File(["first"], "first.jpg", { type: "image/jpeg" });
    const secondFile = new File(["second"], "second.jpg", { type: "image/jpeg" });
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first-photo")
      .mockReturnValueOnce("blob:second-photo");

    const { rerender, unmount } = render(
      <LocalImagePreview file={firstFile} alt="Local audit photo" />,
    );
    expect(screen.getByRole("img", { name: "Local audit photo" })).toHaveAttribute("src", "blob:first-photo");

    rerender(<LocalImagePreview file={firstFile} alt="Updated label" />);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    rerender(<LocalImagePreview file={secondFile} alt="Updated label" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first-photo");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("img", { name: "Updated label" })).toHaveAttribute("src", "blob:second-photo");

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second-photo");
  });
});

describe("AuthenticatedImage", () => {
  it("shows a loading state while the authenticated request, including token refresh, is pending", () => {
    mocks.customFetch.mockReturnValue(new Promise(() => {}));
    render(<AuthenticatedImage src="/api/uploads/photo.jpg" alt="Work photo" className="photo" />);

    expect(screen.getByLabelText("Loading Work photo")).toHaveClass("animate-pulse");
    expect(mocks.customFetch).toHaveBeenCalledWith(
      "/api/uploads/photo.jpg",
      expect.objectContaining({ responseType: "blob", signal: expect.any(AbortSignal) }),
    );
  });

  it("renders the fetched blob and revokes its object URL on cleanup", async () => {
    mocks.customFetch.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
    const { unmount } = render(<AuthenticatedImage src="/api/uploads/photo.jpg" alt="Work photo" />);

    expect(await screen.findByRole("img", { name: "Work photo" })).toHaveAttribute("src", "blob:protected-photo");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:protected-photo");
  });

  it("shows an unavailable state when authentication refresh or image loading fails", async () => {
    mocks.customFetch.mockRejectedValue(new Error("Unauthorized"));
    render(<AuthenticatedImage src="/api/uploads/photo.jpg" alt="Work photo" />);

    await waitFor(() => expect(screen.getByRole("img", { name: "Work photo" })).toHaveTextContent("Photo unavailable"));
  });

  it("aborts the old request and cleans up its URL when the source changes", async () => {
    mocks.customFetch.mockResolvedValue(new Blob(["photo"], { type: "image/jpeg" }));
    const { rerender } = render(<AuthenticatedImage src="/api/uploads/first.jpg" alt="Work photo" />);
    await screen.findByRole("img", { name: "Work photo" });

    rerender(<AuthenticatedImage src="/api/uploads/second.jpg" alt="Work photo" />);

    await waitFor(() => expect(mocks.customFetch).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:protected-photo");
  });
});

describe("AuthenticatedMediaLink", () => {
  it("opens an authenticated blob and later revokes its temporary URL", async () => {
    vi.useFakeTimers();
    const replace = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { replace }, close: vi.fn() } as unknown as Window);
    mocks.customFetch.mockResolvedValue(new Blob(["file"], { type: "application/pdf" }));

    render(
      <AuthenticatedMediaLink src="/api/uploads/file.pdf">
        Open document
      </AuthenticatedMediaLink>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledWith("blob:protected-photo");

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:protected-photo");
  });

  it("closes the blank tab and shows a clear message when authentication refresh fails", async () => {
    const close = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { replace: vi.fn() }, close } as unknown as Window);
    mocks.customFetch.mockRejectedValue(new Error("Unauthorized"));

    render(
      <AuthenticatedMediaLink src="/api/uploads/file.pdf">
        Open document
      </AuthenticatedMediaLink>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open document" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Attachment unavailable");
    expect(close).toHaveBeenCalled();
  });
});