import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./index";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toast: vi.fn(),
  currentRole: "manager",
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "manager-1", name: "Manager", role: mocks.currentRole },
    isLoading: false,
  }),
}));

const fieldWorker = {
  id: "worker-1",
  email: "worker@example.test",
  name: "Field Worker",
  initials: "FW",
  role: "field_worker",
  teamId: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const administrator = {
  ...fieldWorker,
  id: "admin-1",
  email: "admin@example.test",
  name: "Administrator",
  initials: "AD",
  role: "administrator",
};

function renderUsersPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const elementPrototype = HTMLElement.prototype as HTMLElement & {
    hasPointerCapture?: () => boolean;
    setPointerCapture?: () => void;
    releasePointerCapture?: () => void;
  };
  elementPrototype.hasPointerCapture = () => false;
  elementPrototype.setPointerCapture = () => {};
  elementPrototype.releasePointerCapture = () => {};
  elementPrototype.scrollIntoView = () => {};

  mocks.currentRole = "manager";
  mocks.fetch.mockReset();
  mocks.toast.mockReset();
  mocks.fetch.mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/users" && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({ data: [fieldWorker, administrator], total: 2 }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (url === "/api/teams") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url === "/api/users/worker-1" && init?.method === "PATCH") {
        return new Response(JSON.stringify(fieldWorker), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
    },
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("manager password management", () => {
  it("lets a manager generate, view, and save a new staff password", async () => {
    const user = userEvent.setup();
    renderUsersPage();

    await screen.findByTestId("manage-password-worker-1");
    expect(screen.getByTestId("manage-password-worker-1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("manage-password-admin-1"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByTestId("manage-password-worker-1"));
    expect(
      screen.getByRole("heading", { name: "Set password for Field Worker" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/existing password cannot be viewed/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate password" }));
    const passwordInput = screen.getByTestId(
      "reset-user-password",
    ) as HTMLInputElement;
    const generatedPassword = passwordInput.value;
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(generatedPassword).toHaveLength(14);

    await user.click(screen.getByRole("button", { name: "Save new password" }));

    await screen.findByRole("heading", { name: "Password updated" });
    expect(screen.getByTestId("confirmed-password")).toHaveValue(
      generatedPassword,
    );
    expect(screen.getByText(/cannot be viewed again/i)).toBeInTheDocument();

    const patchCall = mocks.fetch.mock.calls.find(
      ([url, init]) =>
        url === "/api/users/worker-1" && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      password: generatedPassword,
    });
  });

  it("shows a newly entered password after creating an account without returning it from the API", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/users" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ data: [], total: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url === "/api/teams") {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url === "/api/users" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ...fieldWorker,
              name: "New Worker",
              email: "new@example.test",
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
      },
    );

    renderUsersPage();
    await screen.findByText("No staff accounts found");
    await user.click(screen.getByRole("button", { name: "New Account" }));
    await user.type(screen.getByPlaceholderText("Jane Smith"), "New Worker");
    await user.type(
      screen.getByPlaceholderText("jane.smith@poriruacity.govt.nz"),
      "new@example.test",
    );
    await user.type(screen.getByPlaceholderText("JS"), "NW");
    fireEvent.change(screen.getByTestId("create-user-password"), {
      target: { value: "Visible-Password-42!" },
    });
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await screen.findByRole("heading", { name: "Account created" });
    expect(screen.getByTestId("confirmed-password")).toHaveValue(
      "Visible-Password-42!",
    );
    const createCall = mocks.fetch.mock.calls.find(
      ([url, init]) => url === "/api/users" && init?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      name: "New Worker",
      password: "Visible-Password-42!",
    });
  });
});
