import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticatedImage } from "./authenticated-image";

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

afterEach(cleanup);

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