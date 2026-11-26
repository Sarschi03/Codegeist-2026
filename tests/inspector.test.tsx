// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/components/Inspector";

afterEach(cleanup);

describe("Inspector", () => {
  it("lets a reviewer link a likely duplicate to a selection", () => {
    const addSource = vi.fn();
    const source = {
      id: "PAY-156",
      product: "Jira" as const,
      title: "Improve mobile payment button",
      description: "Payment button review",
      status: "Open",
      related: [],
      retrievedAt: 1,
    };
    const noop = () => undefined;
    render(
      <Inspector
        tab="Context"
        setTab={noop}
        close={noop}
        annotations={[]}
        selected={["pin"]}
        onAnnotation={noop}
        resolve={noop}
        addAnnotation={noop}
        findContext={noop}
        draft={noop}
        query="payment"
        setQuery={noop}
        search={noop}
        sources={[{ source, why: "Matches “payment”", duplicate: true }]}
        linked={[]}
        addSource={addSource}
        refresh={noop}
        remove={noop}
        dismiss={noop}
        drafts={[]}
        draftFormat="Auto"
        setDraftFormat={noop}
        editDraft={noop}
        exportDrafts={noop}
        busy={false}
        warnings={[]}
      />,
    );
    expect(screen.getByText("Possible duplicate")).toBeTruthy();
    expect(screen.getByText("Matches “payment”")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Link$/ }));
    expect(addSource).toHaveBeenCalledWith(source, true);
  });
});
