import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("opens a seeded checkout and finds evidence for an annotation", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /^(Inspector|Your boards)$/ }).first(),
  ).toBeVisible();
  if (await page.getByRole("heading", { name: "Your boards" }).isVisible())
    await page.getByRole("button", { name: "Open Checkout redesign" }).click();
  await expect(page.getByRole("heading", { name: "Inspector" })).toBeVisible();
  if (process.env.TRACE_CAPTURE === "true") {
    await page.screenshot({ path: testInfo.outputPath("trace-editor.png") });
  }
  await page
    .getByRole("button", { name: /The payment button falls below/ })
    .click();
  await expect(page.getByText("1 selected", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Find context", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Improve mobile payment button", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Possible duplicate").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Draft tasks", exact: true })
    .last()
    .click();
  await page
    .getByRole("button", { name: /payment button falls below the fold/i })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review issue draft" }),
  ).toBeVisible();
  await expect(page.getByLabel("Summary")).toHaveValue(
    /payment button falls below/i,
  );
});

test("uploads and annotates an image, saves, reopens and exports", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Trace", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("textbox", { name: "Canvas name" }).isVisible())
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await page.getByRole("button", { name: "New workspace" }).click();
  const name = "Mobile QA " + Date.now();
  await page.getByRole("textbox", { name: "Workspace name" }).fill(name);
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Canvas name" })).toHaveValue(
    name,
  );
  await page
    .getByRole("button", { name: "Rectangle (R)", exact: true })
    .click();
  const board = await page.getByTestId("canvas-stage").boundingBox();
  if (!board) throw new Error("Drawing surface is unavailable");
  await page.mouse.move(board.x + 200, board.y + 140);
  await page.mouse.down();
  await page.mouse.move(board.x + 340, board.y + 220, { steps: 4 });
  await page.mouse.up();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 160;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 450, 160);
    context.font = "36px Arial";
    context.fillStyle = "black";
    context.fillText("Continue to payment", 38, 85);
    return canvas.toDataURL().split(",")[1];
  });
  await page.locator(".canvas-stage input[type=file]").setInputFiles({
    name: "checkout.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(
    page.getByRole("button", { name: "Crop image", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annotate", exact: true }).click();
  const stage = await page.getByTestId("canvas-stage").boundingBox();
  if (!stage) throw new Error("Canvas is unavailable");
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page
    .getByRole("textbox", { name: "Feedback" })
    .fill("The payment button should be visible on mobile.");
  if (process.env.TRACE_TEST_OCR === "true") {
    await page.getByRole("button", { name: "Read screenshot text" }).click();
    await expect(
      page.getByRole("textbox", { name: "Extracted text" }),
    ).toHaveValue(/Continue to payment/i, { timeout: 30000 });
  }
  await page.getByRole("button", { name: "Save annotation" }).click();
  await expect(
    page.getByText("The payment button should be visible on mobile.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save workspace", exact: true }),
  ).toHaveText("Saved", { timeout: 20_000 });
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Canvas name" })).toHaveValue(
    name,
  );
  await expect(
    page.getByText("The payment button should be visible on mobile.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Trace JSON" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.trace\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(
    exported.scene.elements.some(
      (element: { type: string }) => element.type === "rectangle",
    ),
  ).toBe(true);
  expect(Object.keys(exported.scene.files)).toHaveLength(1);
  expect(exported.scene.annotations).toHaveLength(1);
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("workspace management supports rename, duplicate, favorite and delete", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Trace", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("textbox", { name: "Canvas name" }).isVisible())
    await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await page.getByRole("button", { name: "New workspace" }).click();
  const name = "Planning " + Date.now();
  await page.getByRole("textbox", { name: "Workspace name" }).fill(name);
  await page
    .getByRole("combobox", { name: "Template", exact: true })
    .selectOption("User flow");
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  const card = page.locator(".board-card").filter({
    has: page.getByRole("button", { name: "Open " + name, exact: true }),
  });
  await card.getByRole("button", { name: "Favorite", exact: true }).click();
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Rename", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Workspace name" })
    .fill(name + " updated");
  await page
    .getByRole("button", { name: "Save workspace", exact: true })
    .click();
  const renamed = page.locator(".board-card").filter({
    has: page.getByRole("button", {
      name: "Open " + name + " updated",
      exact: true,
    }),
  });
  await renamed.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByRole("button", { name: "All boards", exact: true }).click();
  const copy = page.locator(".board-card").filter({
    has: page.getByRole("button", {
      name: "Open " + name + " updated (copy)",
      exact: true,
    }),
  });
  await copy.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete workspace", exact: true })
    .click();
  await expect(copy).toHaveCount(0);
});
