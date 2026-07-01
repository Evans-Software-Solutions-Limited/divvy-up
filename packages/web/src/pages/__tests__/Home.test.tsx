import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import Home from "../Home";
import { useGetGroups } from "@/hooks/api/useGetGroups";
import type { UseQueryResult } from "@tanstack/react-query";

vi.mock("@/hooks/api/useGetGroups");

const mockUseGetGroups = vi.mocked(useGetGroups);

function renderHome() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Home", () => {
  it("renders the My groups heading", () => {
    mockUseGetGroups.mockReturnValue({
      isLoading: false,
      data: [],
      error: null,
    } as unknown as UseQueryResult<[]>);
    renderHome();
    expect(screen.getByText("My groups")).toBeDefined();
  });

  it("renders a group card when groups are returned", () => {
    mockUseGetGroups.mockReturnValue({
      isLoading: false,
      data: [{ id: "1", name: "Weekend Trip", createdAt: "", members: [] }],
      error: null,
    } as unknown as UseQueryResult<
      { id: string; name: string; createdAt: string; members: [] }[]
    >);
    renderHome();
    expect(screen.getByText("Weekend Trip")).toBeDefined();
  });
});
