import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("confirms a saved Jira draft and persists its canvas reference after an interrupted save", async ({
  page,
}) => {
  const host = await readFile(
    new URL("./fixtures/forge-host.txt", import.meta.url),
    "utf8",
  );
  await page.route(/\/src\/data\/forge\.ts(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: host,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Open Forge checkout test" }).click();
  await expect(page.getByText("Atlassian", { exact: true })).toBeVisible();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 450;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 450, 160);
    ctx.fillStyle = "black";
    ctx.font = "36px Arial";
    ctx.fillText("Payment button", 38, 85);
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
    .fill("The payment button vanishes on mobile checkout.");
  await page.getByRole("button", { name: "Save annotation" }).click();
  await page
    .getByRole("button", { name: "Find context", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Payment button clipped on mobile", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Draft tasks", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: /payment button vanishes/i }).click();
  const dialog = page.getByRole("dialog", { name: "Review issue draft" });
  await dialog.getByLabel("Summary").fill("Mobile checkout CTA lost");
  await dialog.getByLabel("Jira project key").fill("PAY");
  await dialog.getByRole("button", { name: "Load issue types" }).click();
  await dialog.getByRole("button", { name: "Create Jira issue" }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("trace-forge-test-receipt")),
  ).toBeNull();
  await dialog.getByRole("button", { name: "Confirm Jira issue" }).click();
  await expect(page.getByRole("alert")).toContainText("Simulated interruption");
  const receipt = await page.evaluate(() =>
    localStorage.getItem("trace-forge-test-receipt"),
  );
  expect(receipt).toContain("PAY-7");
  page.on("dialog", (prompt) => prompt.accept());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Save workspace", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("PAY-7", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save workspace", exact: true }),
  ).toHaveText("Saved");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Trace JSON" }).click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(exported.scene.drafts).toEqual([]);
  expect(exported.scene.annotations[0].linkedIssue).toBe("PAY-7");
  const referenceId = Object.keys(exported.scene.references)[0];
  expect(
    exported.scene.elements.some(
      (element: {
        type: string;
        startBinding?: { elementId: string };
        endBinding?: { elementId: string };
      }) =>
        element.type === "arrow" &&
        element.startBinding?.elementId ===
          exported.scene.annotations[0].elementId &&
        element.endBinding?.elementId === referenceId,
    ),
  ).toBe(true);
  expect(Object.values(exported.scene.references)).toMatchObject([
    {
      source: { id: "PAY-7" },
      provenance: "jira-created",
      createdFromDraftId: JSON.parse(receipt!).requestId,
    },
  ]);
});
